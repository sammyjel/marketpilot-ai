import { AppError } from '@/lib/errors';
import type { GeneratedAsset, VoiceGenerationProvider, VoiceGenerationRequest } from './types';

/** No voice provider configured: say so rather than produce silence. */
export class UnavailableVoiceProvider implements VoiceGenerationProvider {
  readonly name = 'unavailable';

  isConfigured(): boolean {
    return false;
  }

  async generate(): Promise<GeneratedAsset> {
    throw new AppError(
      'unsupported_capability',
      'No voice provider is configured, so the voice-over cannot be generated here. The script is on the campaign — record it yourself, or set VOICE_PROVIDER_API_KEY.',
    );
  }

  async listVoices(): Promise<{ id: string; name: string; language: string }[]> {
    return [];
  }
}

export class ElevenLabsVoiceProvider implements VoiceGenerationProvider {
  readonly name = 'elevenlabs';
  private readonly base = 'https://api.elevenlabs.io/v1';

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(request: VoiceGenerationRequest): Promise<GeneratedAsset> {
    if (!this.apiKey) {
      throw new AppError('provider_unavailable', 'No voice provider API key is configured.');
    }

    const voiceId = request.voiceId ?? '21m00Tcm4TlvDq8ikWAM';

    const response = await fetch(`${this.base}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: request.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new AppError('provider_rate_limited', 'The voice provider is rate limiting us. Try again shortly.', {
          retryable: true,
        });
      }
      throw new AppError('provider_unavailable', 'The voice provider rejected this request.', {
        details: { status: response.status },
      });
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: 'audio/mpeg',
      producedBy: 'elevenlabs:multilingual-v2',
    };
  }

  async listVoices(): Promise<{ id: string; name: string; language: string }[]> {
    if (!this.apiKey) return [];

    const response = await fetch(`${this.base}/voices`, { headers: { 'xi-api-key': this.apiKey } });
    if (!response.ok) return [];

    const body = (await response.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    return (body.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      language: voice.labels?.['language'] ?? 'multilingual',
    }));
  }
}
