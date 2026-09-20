export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '2:3';

export const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '2:3': { width: 1000, height: 1500 },
};

export type GeneratedAsset = {
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** Provider cost in micro-USD when the adapter can report it. */
  costMicros?: number;
  /** How the asset was produced, shown to the user so nothing is misrepresented. */
  producedBy: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  aspectRatio: AspectRatio;
  /**
   * The real product photograph. Providers that support image-to-image must
   * preserve the product exactly; providers that cannot are expected to say so
   * rather than invent a different product.
   */
  productImage?: { buffer: Buffer; mimeType: string } | undefined;
  brandColors?: string[];
  overlayText?: string | null;
  logo?: { buffer: Buffer; mimeType: string } | undefined;
};

export interface ImageGenerationProvider {
  readonly name: string;
  /** True when the provider keeps the supplied product identical. */
  readonly preservesProduct: boolean;
  isConfigured(): boolean;
  generate(request: ImageGenerationRequest): Promise<GeneratedAsset>;
}

export type VideoBeat = {
  beat: string;
  seconds: number;
  visual: string;
  voiceover: string;
  onScreen: string;
};

export type VideoGenerationRequest = {
  durationSeconds: 15 | 30 | 60;
  aspectRatio: AspectRatio;
  beats: VideoBeat[];
  productImage?: { buffer: Buffer; mimeType: string } | undefined;
  voiceover?: { buffer: Buffer; mimeType: string } | undefined;
  captions: boolean;
  brandColors?: string[];
};

export type VideoJobHandle = {
  /** Provider-side job id, for adapters that generate asynchronously. */
  externalId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  asset?: GeneratedAsset;
  error?: string;
};

export interface VideoGenerationProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Starts generation. Video is always asynchronous — never inline in a request. */
  start(request: VideoGenerationRequest): Promise<VideoJobHandle>;
  poll(externalId: string): Promise<VideoJobHandle>;
  cancel(externalId: string): Promise<void>;
}

export type VoiceGenerationRequest = {
  text: string;
  voiceId?: string | undefined;
  language: string;
};

export interface VoiceGenerationProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(request: VoiceGenerationRequest): Promise<GeneratedAsset>;
  listVoices(): Promise<{ id: string; name: string; language: string }[]>;
}
