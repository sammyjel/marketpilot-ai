import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@/lib/errors';
import type { PutOptions, StorageProvider, StoredObject } from './types';

/**
 * Filesystem driver for development and self-hosting.
 *
 * Keys are treated as opaque: they are normalised and confined to the root
 * directory, so a crafted key can never escape via `../`.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(process.cwd(), root);
  }

  private resolve(key: string): string {
    const normalised = path.normalize(key).replace(/^([/\\])+/, '');
    const target = path.resolve(this.root, normalised);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new AppError('validation_failed', 'Invalid storage key.');
    }
    return target;
  }

  async put(key: string, body: Buffer, options: PutOptions): Promise<StoredObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    // Content type is kept beside the object so `get` can serve it back.
    await writeFile(`${target}.meta`, JSON.stringify({ contentType: options.contentType }), 'utf8');
    return { key, size: body.byteLength, contentType: options.contentType };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      throw new AppError('not_found', 'That file is no longer available.');
    }
  }

  async contentTypeOf(key: string): Promise<string | null> {
    try {
      const raw = await readFile(`${this.resolve(key)}.meta`, 'utf8');
      const parsed = JSON.parse(raw) as { contentType?: string };
      return parsed.contentType ?? null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
    await rm(`${this.resolve(key)}.meta`, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async urlFor(key: string): Promise<string> {
    // Served by the authenticated /api/media/file route, never as a static path.
    return `/api/media/file/${encodeURIComponent(key)}`;
  }

  async presignPut(): Promise<null> {
    // Nothing outside this process can write to the local disk, so there is no
    // URL to hand the browser. Callers fall back to posting bytes through the
    // server, which is fine at development sizes.
    return null;
  }

  async publicUrlFor(): Promise<string | null> {
    // A localhost path is not reachable by a platform's media fetcher.
    return null;
  }

  static keyFor(organizationId: string, kind: string, extension: string): string {
    const random = createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .slice(0, 24);
    const safeExtension = extension.replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase();
    return `${organizationId}/${kind}/${random}${safeExtension ? `.${safeExtension}` : ''}`;
  }
}
