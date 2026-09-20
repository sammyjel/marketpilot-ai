import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import { AnthropicProvider } from './anthropic';
import { MockLanguageModelProvider } from './mock';
import { OpenAiProvider } from './openai';
import type { LanguageModelProvider } from './types';

export type {
  CompletionRequest,
  CompletionResult,
  ContentPart,
  JsonRequest,
  JsonResult,
  LanguageModelProvider,
  Message,
  TokenUsage,
} from './types';

let cached: LanguageModelProvider | undefined;

/**
 * Resolves the configured language model.
 *
 * `MOCK_EXTERNAL_SERVICES=true` always wins, so a misconfigured production key
 * can never be charged from a development machine.
 */
export function languageModel(): LanguageModelProvider {
  if (cached) return cached;
  const config = env();

  if (config.MOCK_EXTERNAL_SERVICES || config.AI_PROVIDER === 'mock') {
    cached = new MockLanguageModelProvider();
    return cached;
  }

  if (!config.AI_PROVIDER_API_KEY) {
    throw new AppError(
      'provider_unavailable',
      'No AI provider is configured. Set AI_PROVIDER_API_KEY, or set MOCK_EXTERNAL_SERVICES=true to work offline.',
    );
  }

  cached =
    config.AI_PROVIDER === 'openai'
      ? new OpenAiProvider(config.AI_PROVIDER_API_KEY, config.AI_MODEL)
      : new AnthropicProvider(config.AI_PROVIDER_API_KEY, config.AI_MODEL);

  return cached;
}

/** True when generated content must be labelled as mock output in the UI. */
export function isMockAi(): boolean {
  return languageModel().name === 'mock';
}

/** Test seam. */
export function setLanguageModel(provider: LanguageModelProvider | undefined): void {
  cached = provider;
}
