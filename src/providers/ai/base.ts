import type { z } from 'zod';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { describeIssues, extractJson, schemaInstruction } from './json';
import type {
  CompletionRequest,
  CompletionResult,
  JsonRequest,
  JsonResult,
  LanguageModelProvider,
} from './types';

/**
 * Shared JSON handling for every adapter: schema instruction, extraction,
 * validation and a single repair round-trip. Adapters only implement `complete`.
 */
export abstract class BaseLanguageModelProvider implements LanguageModelProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  abstract readonly supportsVision: boolean;

  abstract complete(request: CompletionRequest): Promise<CompletionResult>;

  async completeJson<T extends z.ZodType>(request: JsonRequest<T>): Promise<JsonResult<z.infer<T>>> {
    const { schema, schemaName, system, messages, ...rest } = request;
    const instruction = schemaInstruction(schemaName, schema);

    const first = await this.complete({
      ...rest,
      system: system ? `${system}\n\n${instruction}` : instruction,
      messages,
    });

    const firstAttempt = this.tryParse(schema, first.text);
    if (firstAttempt.ok) {
      return { data: firstAttempt.data, usage: first.usage, model: first.model, repaired: false };
    }

    logger.warn('ai.json_repair', { stage: request.stage ?? schemaName, issues: firstAttempt.issues.slice(0, 400) });

    // One repair attempt: show the model its own output and what was wrong.
    const second = await this.complete({
      ...rest,
      system: system ? `${system}\n\n${instruction}` : instruction,
      messages: [
        ...messages,
        { role: 'assistant', content: first.text.slice(0, 12_000) },
        {
          role: 'user',
          content: [
            'That response did not match the required schema. Problems:',
            firstAttempt.issues,
            '',
            'Return the corrected JSON only. Keep the content you already wrote wherever it was valid.',
          ].join('\n'),
        },
      ],
    });

    const secondAttempt = this.tryParse(schema, second.text);
    if (!secondAttempt.ok) {
      throw new AppError(
        'provider_unavailable',
        'The AI could not produce a usable result. Please try generating again.',
        { details: { stage: request.stage ?? schemaName }, retryable: true },
      );
    }

    return {
      data: secondAttempt.data,
      usage: {
        inputTokens: first.usage.inputTokens + second.usage.inputTokens,
        outputTokens: first.usage.outputTokens + second.usage.outputTokens,
        costMicros: (first.usage.costMicros ?? 0) + (second.usage.costMicros ?? 0),
      },
      model: second.model,
      repaired: true,
    };
  }

  private tryParse<T extends z.ZodType>(
    schema: T,
    text: string,
  ): { ok: true; data: z.infer<T> } | { ok: false; issues: string } {
    let raw: unknown;
    try {
      raw = extractJson(text);
    } catch (error) {
      return { ok: false, issues: error instanceof Error ? error.message : 'Response was not JSON.' };
    }

    const parsed = schema.safeParse(raw);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, issues: describeIssues(parsed.error) };
  }
}

/**
 * Maps an HTTP failure from any vendor onto our error vocabulary so callers can
 * treat rate limits, timeouts and outages uniformly.
 */
export function mapProviderHttpError(status: number, body: string, vendor: string): AppError {
  if (status === 401 || status === 403) {
    return new AppError('provider_unavailable', `The ${vendor} API key is missing or not authorised.`, {
      details: { status },
    });
  }
  if (status === 429) {
    return new AppError('provider_rate_limited', `${vendor} is rate limiting us. Try again in a moment.`, {
      retryable: true,
    });
  }
  if (status === 408 || status === 504) {
    return new AppError('provider_timeout', `${vendor} took too long to respond. Try again.`, { retryable: true });
  }
  if (status >= 500) {
    return new AppError('provider_unavailable', `${vendor} is temporarily unavailable. Try again shortly.`, {
      retryable: true,
    });
  }
  logger.error('ai.provider_error', { vendor, status, body: body.slice(0, 500) });
  return new AppError('provider_unavailable', `${vendor} rejected the request.`, { details: { status } });
}

/** Wraps fetch with a hard timeout so a hung provider cannot stall a job. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  vendor: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('provider_timeout', `${vendor} took too long to respond. Try again.`, { retryable: true });
    }
    throw new AppError('provider_unavailable', `Could not reach ${vendor}.`, { retryable: true, cause: error });
  } finally {
    clearTimeout(timer);
  }
}
