import { AppError } from '@/lib/errors';
import { ASPECT_DIMENSIONS, type GeneratedAsset, type ImageGenerationProvider, type ImageGenerationRequest } from './types';

/**
 * Deterministic image compositor.
 *
 * This is NOT an AI image generator and never claims to be. It lays the real
 * product photograph onto a generated gradient background in the requested
 * aspect ratio, with optional brand-coloured text overlay and logo.
 *
 * That makes it genuinely useful in two ways:
 *   1. In mock mode it produces real, usable marketing images without spending
 *      credits, and the product is pixel-identical to what the user uploaded.
 *   2. In production it is the correct choice whenever preserving the product
 *      exactly matters more than an invented scene — which, for product
 *      marketing, is most of the time.
 *
 * Every asset it produces is labelled `composited` so the interface can say
 * plainly how it was made.
 */
export class CompositorImageProvider implements ImageGenerationProvider {
  readonly name = 'compositor';
  readonly preservesProduct = true;

  isConfigured(): boolean {
    return true;
  }

  /** Stable pseudo-random from the prompt, so the same brief looks the same. */
  private seedFrom(text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private backgroundSvg(width: number, height: number, colors: string[], seed: number): string {
    const primary = colors[0] ?? '#4f46e5';
    const secondary = colors[1] ?? '#f8fafc';
    const angle = seed % 180;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" gradientTransform="rotate(${angle})">
          <stop offset="0%" stop-color="${primary}" stop-opacity="0.18"/>
          <stop offset="55%" stop-color="${secondary}" stop-opacity="1"/>
          <stop offset="100%" stop-color="${primary}" stop-opacity="0.10"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="${secondary}"/>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <ellipse cx="${width / 2}" cy="${height * 0.42}" rx="${width * 0.42}" ry="${height * 0.3}" fill="url(#glow)"/>
    </svg>`;
  }

  private overlaySvg(width: number, height: number, text: string, color: string): string {
    // Wrapped at a width that stays readable at thumbnail size.
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    const maxChars = Math.max(12, Math.floor(width / 42));

    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars) {
        if (current) lines.push(current.trim());
        current = word;
      } else {
        current = `${current} ${word}`;
      }
    }
    if (current) lines.push(current.trim());

    const fontSize = Math.round(width / 16);
    const lineHeight = Math.round(fontSize * 1.25);
    const blockHeight = lines.length * lineHeight;
    const top = height - blockHeight - Math.round(height * 0.07);

    const tspans = lines
      .map(
        (line, index) =>
          `<tspan x="${width / 2}" y="${top + index * lineHeight + fontSize}">${this.escapeXml(line)}</tspan>`,
      )
      .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" y="${top - Math.round(fontSize * 0.7)}" width="${width}" height="${blockHeight + fontSize}"
            fill="${color}" fill-opacity="0.92"/>
      <text text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
            font-size="${fontSize}" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${tspans}</text>
    </svg>`;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedAsset> {
    const sharp = (await import('sharp')).default;
    const { width, height } = ASPECT_DIMENSIONS[request.aspectRatio];
    const seed = this.seedFrom(request.prompt);
    const colors = request.brandColors?.length ? request.brandColors : ['#4f46e5', '#f8fafc'];

    const layers: { input: Buffer; gravity?: string; top?: number; left?: number }[] = [];

    if (request.productImage) {
      // The product is only ever resized, never re-rendered or restyled.
      const productWidth = Math.round(width * 0.72);
      const productHeight = Math.round(height * 0.58);

      try {
        const product = await sharp(request.productImage.buffer)
          .rotate()
          .resize(productWidth, productHeight, { fit: 'inside', withoutEnlargement: false })
          .png()
          .toBuffer();

        const meta = await sharp(product).metadata();
        layers.push({
          input: product,
          top: Math.round(height * 0.16),
          left: Math.round((width - (meta.width ?? productWidth)) / 2),
        });
      } catch (error) {
        throw new AppError('invalid_media', 'That product image could not be composed.', { cause: error });
      }
    }

    if (request.logo) {
      const logo = await sharp(request.logo.buffer)
        .resize(Math.round(width * 0.18), Math.round(height * 0.08), { fit: 'inside' })
        .png()
        .toBuffer();
      layers.push({ input: logo, top: Math.round(height * 0.04), left: Math.round(width * 0.05) });
    }

    if (request.overlayText) {
      layers.push({
        input: Buffer.from(this.overlaySvg(width, height, request.overlayText, colors[0] ?? '#4f46e5')),
        top: 0,
        left: 0,
      });
    }

    const buffer = await sharp(Buffer.from(this.backgroundSvg(width, height, colors, seed)))
      .composite(layers)
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    return {
      buffer,
      mimeType: 'image/jpeg',
      width,
      height,
      costMicros: 0,
      producedBy: 'composited',
    };
  }
}
