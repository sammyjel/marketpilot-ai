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
/**
 * Budget for a second attempt. Doubling gives a stage that merely overran room
 * to finish, while the cap stops a pathological response running away. Nothing
 * is spent unless the tokens are actually generated.
 */
function raisedBudget(current: number | undefined): number {
  return Math.min((current ?? 4096) * 2, 16_000);
}

export abstract class BaseLanguageModelProvider implements LanguageModelProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  abstract readonly supportsVision: boolean;

  abstract complete(request: CompletionRequest): Promise<CompletionResult>;

  async completeJson<T extends z.ZodType>(request: JsonRequest<T>): Promise<JsonResult<z.infer<T>>> {
    const { schema, schemaName, system, messages, ...rest } = request;
    const instruction = schemaInstruction(schemaName, schema);
    const fullSystem = system ? `${system}\n\n${instruction}` : instruction;

    const first = await this.complete({ ...rest, system: fullSystem, messages });

    const firstAttempt = this.tryParse(schema, first.text);
    if (firstAttempt.ok) {
      return { data: firstAttempt.data, usage: first.usage, model: first.model, repaired: false };
    }

    const stage = request.stage ?? schemaName;
    const retryBudget = raisedBudget(rest.maxTokens);

    // Running out of output budget and diverging from the schema are different
    // failures, and one second attempt cannot serve both.
    //
    // A truncated response is not wrong, only unfinished. Feeding the fragment
    // back and asking for a correction makes the model regenerate all of it,
    // from a longer prompt, under the same ceiling that just proved too low --
    // so the repair truncates as well and a recoverable stage fails hard. Ask
    // again with room to finish instead.
    const second = first.truncated
      ? await this.complete({ ...rest, maxTokens: retryBudget, system: fullSystem, messages })
      : await this.complete({
          ...rest,
          // A repair restates the whole object plus the correction, so it needs
          // at least as much room as the attempt it is fixing.
          maxTokens: retryBudget,
          system: fullSystem,
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

    logger.warn(first.truncated ? 'ai.truncated_retry' : 'ai.json_repair', {
      stage,
      ...(first.truncated
        ? { firstMaxTokens: rest.maxTokens ?? null, retryMaxTokens: retryBudget }
        : { issues: firstAttempt.issues.slice(0, 400) }),
    });

    const secondAttempt = this.tryParse(schema, second.text);
    if (!secondAttempt.ok) {
      throw new AppError(
        'provider_unavailable',
        'The AI could not produce a usable result. Please try generating again.',
        {
          details: {
            stage,
            reason: second.truncated ? 'truncated' : 'schema_mismatch',
            issues: secondAttempt.issues.slice(0, 200),
          },
          retryable: true,
        },
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
/** Pulls the human-readable reason out of an Anthropic/OpenAI error body. */
function providerMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    return typeof message === 'string' && message.trim() ? message.trim().slice(0, 300) : null;
  } catch {
    return null;
  }
}

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

  // The provider's own explanation is the only thing that makes a 4xx
  // diagnosable, and it was previously discarded -- the caller stored a bare
  // "rejected the request" while the reason sat in a log nobody reads.
  const reason = providerMessage(body);
  return new AppError(
    'provider_unavailable',
    reason ? `${vendor} rejected the request (${status}): ${reason}` : `${vendor} rejected the request (${status}).`,
    { details: { status } },
  );
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
