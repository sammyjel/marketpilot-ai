import { BaseLanguageModelProvider, fetchWithTimeout, mapProviderHttpError } from './base';
import type { CompletionRequest, CompletionResult, ContentPart } from './types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 120_000;

/**
 * Whether the model still accepts `temperature` / `top_p` / `top_k`.
 *
 * Current-generation models removed the sampling parameters and reject a
 * request that carries them with a 400 -- which surfaces as a bare "rejected
 * the request" and is extremely hard to trace back. Omitting them is valid on
 * every model, so the safe default is to omit and send only for the older
 * families that still take them. Anything unrecognised is treated as current.
 */
function acceptsSampling(model: string): boolean {
  return /^claude-(haiku-|instant-|opus-4-6|sonnet-4-6|opus-4-5|sonnet-4-5|2|3)/.test(model);
}

/** Per-million-token prices in micro-USD, used for cost attribution only. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4_000_000, output: 20_000_000 },
  'claude-opus-5': { input: 5_000_000, output: 25_000_000 },
  'claude-sonnet-5-5': { input: 2_000_000, output: 10_000_000 },
  'claude-sonnet-5': { input: 2_000_000, output: 10_000_000 },
  'claude-haiku-4-5': { input: 1_000_000, output: 5_000_000 },
};

type AnthropicResponse = {
  content: { type: string; text?: string }[];
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

export class AnthropicProvider extends BaseLanguageModelProvider {
  readonly name = 'anthropic';
  readonly supportsVision = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {
    super();
  }

  private toContent(content: string | ContentPart[]): unknown {
    if (typeof content === 'string') return content;
    return content.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image', source: { type: 'base64', media_type: part.mimeType, data: part.data } },
    );
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await fetchWithTimeout(
      API_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 4096,
          ...(acceptsSampling(this.model) ? { temperature: request.temperature ?? 0.7 } : {}),
          ...(request.system ? { system: request.system } : {}),
          messages: request.messages.map((message) => ({
            role: message.role,
            content: this.toContent(message.content),
          })),
        }),
      },
      TIMEOUT_MS,
      'Anthropic',
    );

    if (!response.ok) {
      throw mapProviderHttpError(response.status, await response.text(), 'Anthropic');
    }

    const body = (await response.json()) as AnthropicResponse;
    const text = body.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    const pricing = PRICING[this.model];
    const costMicros = pricing
      ? Math.round(
          (body.usage.input_tokens * pricing.input + body.usage.output_tokens * pricing.output) / 1_000_000,
        )
      : undefined;

    return {
      text,
      model: body.model,
      usage: {
        inputTokens: body.usage.input_tokens,
        outputTokens: body.usage.output_tokens,
        ...(costMicros !== undefined ? { costMicros } : {}),
      },
    };
  }
}
