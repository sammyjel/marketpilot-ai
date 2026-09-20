import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import { LocalStorageProvider } from './local';
import { S3StorageProvider } from './s3';
import type { StorageProvider } from './types';

export type { StorageProvider, StoredObject } from './types';
export { LocalStorageProvider } from './local';

let cached: StorageProvider | undefined;

/** Resolves the configured driver. Called through `storage()` everywhere. */
export function storage(): StorageProvider {
  if (cached) return cached;
  const config = env();

  if (config.STORAGE_DRIVER === 's3') {
    if (!config.STORAGE_ENDPOINT || !config.STORAGE_BUCKET || !config.STORAGE_ACCESS_KEY || !config.STORAGE_SECRET_KEY) {
      throw new AppError(
        'provider_unavailable',
        'Object storage is not fully configured. Set STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY.',
      );
    }
    cached = new S3StorageProvider({
      endpoint: config.STORAGE_ENDPOINT,
      region: config.STORAGE_REGION,
      bucket: config.STORAGE_BUCKET,
      accessKey: config.STORAGE_ACCESS_KEY,
      secretKey: config.STORAGE_SECRET_KEY,
      publicBaseUrl: config.STORAGE_PUBLIC_URL,
    });
  } else {
    cached = new LocalStorageProvider(config.STORAGE_LOCAL_DIR);
  }

  return cached;
}

/** Test seam. */
export function setStorageProvider(provider: StorageProvider | undefined): void {
  cached = provider;
}

export function storageKey(organizationId: string, kind: string, extension: string): string {
  return LocalStorageProvider.keyFor(organizationId, kind, extension);
}
