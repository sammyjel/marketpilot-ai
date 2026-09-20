import { BaseLanguageModelProvider, fetchWithTimeout, mapProviderHttpError } from './base';
import type { CompletionRequest, CompletionResult, ContentPart } from './types';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 120_000;

type OpenAiResponse = {
  choices: { message: { content: string | null } }[];
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
};

/** Second vendor adapter, kept so the app is never tied to one provider. */
export class OpenAiProvider extends BaseLanguageModelProvider {
  readonly name = 'openai';
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
        : { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.data}` } },
    );
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const messages: unknown[] = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    for (const message of request.messages) {
      messages.push({ role: message.role, content: this.toContent(message.content) });
    }

    const response = await fetchWithTimeout(
      API_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_completion_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        }),
      },
      TIMEOUT_MS,
      'OpenAI',
    );

    if (!response.ok) {
      throw mapProviderHttpError(response.status, await response.text(), 'OpenAI');
    }

    const body = (await response.json()) as OpenAiResponse;

    return {
      text: body.choices[0]?.message.content ?? '',
      model: body.model,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  }
}
