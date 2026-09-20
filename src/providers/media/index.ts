import { env } from '@/lib/env';
import { CompositorImageProvider } from './compositor';
import { OpenAiImageProvider, StabilityImageProvider } from './image-providers';
import { ReplicateVideoProvider, UnavailableVideoProvider } from './video';
import { ElevenLabsVoiceProvider, UnavailableVoiceProvider } from './voice';
import type { ImageGenerationProvider, VideoGenerationProvider, VoiceGenerationProvider } from './types';

export type * from './types';
export { ASPECT_DIMENSIONS } from './types';

let imageProvider: ImageGenerationProvider | undefined;
let videoProvider: VideoGenerationProvider | undefined;
let voiceProvider: VoiceGenerationProvider | undefined;

/**
 * Image generation.
 *
 * The compositor is used in mock mode and whenever no model key is set. It is a
 * real generator — it produces usable marketing images from the actual product
 * photo — so mock mode is never a dead end.
 */
export function imageGenerator(): ImageGenerationProvider {
  if (imageProvider) return imageProvider;
  const config = env();

  if (config.MOCK_EXTERNAL_SERVICES || config.IMAGE_PROVIDER === 'mock' || !config.IMAGE_PROVIDER_API_KEY) {
    imageProvider = new CompositorImageProvider();
  } else if (config.IMAGE_PROVIDER === 'stability') {
    imageProvider = new StabilityImageProvider(config.IMAGE_PROVIDER_API_KEY);
  } else {
    imageProvider = new OpenAiImageProvider(config.IMAGE_PROVIDER_API_KEY);
  }

  return imageProvider;
}

/** Always available: the compositor never alters the supplied product. */
export function productSafeImageGenerator(): ImageGenerationProvider {
  return new CompositorImageProvider();
}

export function videoGenerator(): VideoGenerationProvider {
  if (videoProvider) return videoProvider;
  const config = env();

  videoProvider =
    config.MOCK_EXTERNAL_SERVICES || config.VIDEO_PROVIDER === 'mock' || !config.VIDEO_PROVIDER_API_KEY
      ? new UnavailableVideoProvider()
      : new ReplicateVideoProvider(config.VIDEO_PROVIDER_API_KEY);

  return videoProvider;
}

export function voiceGenerator(): VoiceGenerationProvider {
  if (voiceProvider) return voiceProvider;
  const config = env();

  voiceProvider =
    config.MOCK_EXTERNAL_SERVICES || config.VOICE_PROVIDER === 'mock' || !config.VOICE_PROVIDER_API_KEY
      ? new UnavailableVoiceProvider()
      : new ElevenLabsVoiceProvider(config.VOICE_PROVIDER_API_KEY);

  return voiceProvider;
}

export type MediaCapabilities = {
  image: { available: true; provider: string; preservesProduct: boolean };
  video: { available: boolean; provider: string; reason?: string };
  voice: { available: boolean; provider: string; reason?: string };
};

/** What the UI shows so a user is never offered a button that cannot work. */
export function mediaCapabilities(): MediaCapabilities {
  const image = imageGenerator();
  const video = videoGenerator();
  const voice = voiceGenerator();

  return {
    image: { available: true, provider: image.name, preservesProduct: image.preservesProduct },
    video: {
      available: video.isConfigured(),
      provider: video.name,
      ...(video.isConfigured()
        ? {}
        : { reason: 'No video provider is configured. Storyboards and scripts are still generated.' }),
    },
    voice: {
      available: voice.isConfigured(),
      provider: voice.name,
      ...(voice.isConfigured() ? {} : { reason: 'No voice provider is configured. Voice-over scripts are still generated.' }),
    },
  };
}

/** Test seam. */
export function resetMediaProviders(): void {
  imageProvider = undefined;
  videoProvider = undefined;
  voiceProvider = undefined;
}
