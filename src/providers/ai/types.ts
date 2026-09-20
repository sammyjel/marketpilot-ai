import type { z } from 'zod';

export type TextPart = { type: 'text'; text: string };

export type ImagePart = {
  type: 'image';
  mimeType: string;
  /** Base64-encoded bytes. Images are never passed to providers by URL. */
  data: string;
};

export type ContentPart = TextPart | ImagePart;

export type Message = {
  role: 'user' | 'assistant';
  content: string | ContentPart[];
};

export type CompletionRequest = {
  system?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  /** Used for usage attribution and logging, never sent to the provider. */
  stage?: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Provider cost in micro-USD when the adapter can compute it. */
  costMicros?: number;
};

export type CompletionResult = {
  text: string;
  usage: TokenUsage;
  model: string;
};

export type JsonRequest<T extends z.ZodType> = CompletionRequest & {
  schema: T;
  /** Human-readable name used in the repair prompt and error messages. */
  schemaName: string;
};

export type JsonResult<T> = {
  data: T;
  usage: TokenUsage;
  model: string;
  /** True when the first response failed validation and had to be repaired. */
  repaired: boolean;
};

/**
 * The only surface the application uses to talk to a language model.
 *
 * Adapters are responsible for mapping their vendor's errors onto AppError with
 * the right code (provider_rate_limited, provider_timeout, ...) so callers can
 * retry uniformly.
 */
export interface LanguageModelProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsVision: boolean;

  complete(request: CompletionRequest): Promise<CompletionResult>;

  /**
   * Requests structured output and validates it against `schema`. Implementations
   * must retry once with the validation errors before giving up.
   */
  completeJson<T extends z.ZodType>(request: JsonRequest<T>): Promise<JsonResult<z.infer<T>>>;
}
