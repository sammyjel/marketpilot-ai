import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ASPECT_DIMENSIONS, type VideoGenerationProvider, type VideoGenerationRequest, type VideoJobHandle } from './types';

/**
 * Video generation when no provider is configured.
 *
 * It does NOT fabricate a video file. The campaign still gets a complete,
 * timecoded storyboard with voice-over lines and on-screen text, and this
 * reports honestly that no renderer is available — which is exactly what the
 * user needs to know in order to shoot or edit it themselves.
 */
export class UnavailableVideoProvider implements VideoGenerationProvider {
  readonly name = 'unavailable';

  isConfigured(): boolean {
    return false;
  }

  async start(): Promise<VideoJobHandle> {
    throw new AppError(
      'unsupported_capability',
      'No video generation provider is configured, so the video cannot be rendered here. The storyboard, script, voice-over lines and on-screen text are ready on the campaign — use them to shoot or edit the video, or set VIDEO_PROVIDER_API_KEY to render it automatically.',
    );
  }

  async poll(): Promise<VideoJobHandle> {
    throw new AppError('unsupported_capability', 'No video generation provider is configured.');
  }

  async cancel(): Promise<void> {
    // Nothing to cancel.
  }
}

type ReplicatePrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
};

/**
 * Replicate adapter.
 *
 * Video models are slow and expensive, so generation is always started and
 * polled from a background job — never inside an HTTP request.
 */
export class ReplicateVideoProvider implements VideoGenerationProvider {
  readonly name = 'replicate';
  private readonly base = 'https://api.replicate.com/v1';

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model = 'minimax/video-01',
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
  }

  /** Turns the beat sheet into a single prompt the model can work from. */
  private promptFrom(request: VideoGenerationRequest): string {
    const beats = request.beats
      .map((beat) => `${beat.beat} (${beat.seconds}s): ${beat.visual}`)
      .join(' Then ');
    return `${request.durationSeconds} second vertical product video. ${beats}. Keep the product exactly as shown in the reference image; do not alter its label, colour or shape.`;
  }

  async start(request: VideoGenerationRequest): Promise<VideoJobHandle> {
    if (!this.apiKey) {
      throw new AppError('provider_unavailable', 'No video provider API key is configured.');
    }

    const { width, height } = ASPECT_DIMENSIONS[request.aspectRatio];

    const response = await fetch(`${this.base}/predictions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        input: {
          prompt: this.promptFrom(request),
          ...(request.productImage
            ? {
                first_frame_image: `data:${request.productImage.mimeType};base64,${request.productImage.buffer.toString('base64')}`,
              }
            : {}),
          width,
          height,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('video.start_failed', { status: response.status, body: body.slice(0, 300) });
      throw new AppError('provider_unavailable', 'The video provider rejected this request.', {
        retryable: response.status >= 500,
      });
    }

    const prediction = (await response.json()) as ReplicatePrediction;
    return { externalId: prediction.id, status: prediction.status === 'failed' ? 'failed' : 'queued' };
  }

  async poll(externalId: string): Promise<VideoJobHandle> {
    const response = await fetch(`${this.base}/predictions/${externalId}`, { headers: this.headers() });
    if (!response.ok) {
      throw new AppError('provider_unavailable', 'Could not check the video status.', { retryable: true });
    }

    const prediction = (await response.json()) as ReplicatePrediction;

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        externalId,
        status: 'failed',
        error: prediction.error ?? 'The video provider could not render this video.',
      };
    }

    if (prediction.status !== 'succeeded') {
      return { externalId, status: 'processing' };
    }

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) return { externalId, status: 'failed', error: 'The provider returned no video.' };

    const download = await fetch(url);
    if (!download.ok) {
      return { externalId, status: 'failed', error: 'The rendered video could not be downloaded.' };
    }

    return {
      externalId,
      status: 'succeeded',
      asset: {
        buffer: Buffer.from(await download.arrayBuffer()),
        mimeType: 'video/mp4',
        producedBy: `replicate:${this.model}`,
      },
    };
  }

  async cancel(externalId: string): Promise<void> {
    await fetch(`${this.base}/predictions/${externalId}/cancel`, {
      method: 'POST',
      headers: this.headers(),
    }).catch(() => undefined);
  }
}
