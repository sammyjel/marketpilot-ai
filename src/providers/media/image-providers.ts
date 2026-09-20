import { AppError } from '@/lib/errors';
import { ASPECT_DIMENSIONS, type GeneratedAsset, type ImageGenerationProvider, type ImageGenerationRequest } from './types';

const IMAGE_TIMEOUT_MS = 180_000;

async function post(url: string, init: RequestInit, vendor: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('provider_timeout', `${vendor} took too long to generate the image.`, { retryable: true });
    }
    throw new AppError('provider_unavailable', `Could not reach ${vendor}.`, { retryable: true, cause: error });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI image generation.
 *
 * `preservesProduct` is false: a text-to-image model reinterprets the product
 * rather than keeping the photograph intact. The campaign UI surfaces that, and
 * the compositor remains the default whenever product fidelity matters.
 */
export class OpenAiImageProvider implements ImageGenerationProvider {
  readonly name = 'openai';
  readonly preservesProduct = false;

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private sizeFor(aspect: ImageGenerationRequest['aspectRatio']): string {
    const { width, height } = ASPECT_DIMENSIONS[aspect];
    if (width === height) return '1024x1024';
    return height > width ? '1024x1536' : '1536x1024';
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedAsset> {
    if (!this.apiKey) {
      throw new AppError('provider_unavailable', 'No image provider API key is configured.');
    }

    // When a product photo is supplied, the edit endpoint keeps far closer to
    // the original than a pure text-to-image call.
    const endpoint = request.productImage
      ? 'https://api.openai.com/v1/images/edits'
      : 'https://api.openai.com/v1/images/generations';

    let body: BodyInit;
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };

    if (request.productImage) {
      const form = new FormData();
      form.set('model', 'gpt-image-1');
      form.set('prompt', request.prompt);
      form.set('size', this.sizeFor(request.aspectRatio));
      form.set(
        'image',
        new Blob([new Uint8Array(request.productImage.buffer)], { type: request.productImage.mimeType }),
        'product.png',
      );
      body = form;
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify({
        model: 'gpt-image-1',
        prompt: request.prompt,
        size: this.sizeFor(request.aspectRatio),
        n: 1,
      });
    }

    const response = await post(endpoint, { method: 'POST', headers, body }, 'OpenAI');

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429) {
        throw new AppError('provider_rate_limited', 'The image provider is rate limiting us. Try again shortly.', {
          retryable: true,
        });
      }
      throw new AppError('provider_unavailable', 'The image provider rejected this request.', {
        details: { status: response.status, body: text.slice(0, 200) },
      });
    }

    const json = (await response.json()) as { data?: { b64_json?: string }[] };
    const encoded = json.data?.[0]?.b64_json;
    if (!encoded) {
      throw new AppError('provider_unavailable', 'The image provider returned no image.', { retryable: true });
    }

    const { width, height } = ASPECT_DIMENSIONS[request.aspectRatio];
    return {
      buffer: Buffer.from(encoded, 'base64'),
      mimeType: 'image/png',
      width,
      height,
      producedBy: 'openai:gpt-image-1',
    };
  }
}

/** Stability AI adapter, kept so image generation is not tied to one vendor. */
export class StabilityImageProvider implements ImageGenerationProvider {
  readonly name = 'stability';
  readonly preservesProduct = false;

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedAsset> {
    if (!this.apiKey) {
      throw new AppError('provider_unavailable', 'No image provider API key is configured.');
    }

    const form = new FormData();
    form.set('prompt', request.prompt);
    form.set('output_format', 'jpeg');
    form.set('aspect_ratio', request.aspectRatio);

    const response = await post(
      'https://api.stability.ai/v2beta/stable-image/generate/core',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, accept: 'image/*' },
        body: form,
      },
      'Stability AI',
    );

    if (!response.ok) {
      throw new AppError('provider_unavailable', 'The image provider rejected this request.', {
        details: { status: response.status },
      });
    }

    const { width, height } = ASPECT_DIMENSIONS[request.aspectRatio];
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: 'image/jpeg',
      width,
      height,
      producedBy: 'stability:core',
    };
  }
}
