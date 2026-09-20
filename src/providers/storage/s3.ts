import { createHash, createHmac } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { PresignOptions, PutOptions, StorageProvider, StoredObject } from './types';

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** CDN or bucket origin used for URLs platform APIs must be able to fetch. */
  publicBaseUrl?: string | undefined;
};

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO, Backblaze B2) implemented
 * with SigV4 over fetch — no SDK dependency, so cold starts stay small and the
 * same code runs on any S3-compatible endpoint.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  constructor(private readonly config: S3Config) {}

  private endpointFor(key: string): URL {
    const base = this.config.endpoint.replace(/\/$/, '');
    return new URL(`${base}/${this.config.bucket}/${encodeKey(key)}`);
  }

  /** AWS Signature Version 4, header-based. */
  private sign(method: string, url: URL, payload: Buffer, headers: Record<string, string>): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(payload);

    const allHeaders: Record<string, string> = {
      ...headers,
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    const sortedKeys = Object.keys(allHeaders)
      .map((k) => k.toLowerCase())
      .sort();
    const canonicalHeaders = sortedKeys
      .map((k) => `${k}:${String(allHeaders[Object.keys(allHeaders).find((h) => h.toLowerCase() === k)!]).trim()}\n`)
      .join('');
    const signedHeaders = sortedKeys.join(';');

    const canonicalRequest = [
      method,
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.config.region}/${SERVICE}/aws4_request`;
    const stringToSign = [ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.config.secretKey}`, dateStamp), this.config.region), SERVICE),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    return {
      ...allHeaders,
      Authorization: `${ALGORITHM} Credential=${this.config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  private async send(method: string, key: string, payload: Buffer, extraHeaders: Record<string, string> = {}) {
    const url = this.endpointFor(key);
    const headers = this.sign(method, url, payload, extraHeaders);

    const response = await fetch(url, {
      method,
      headers,
      ...(payload.byteLength > 0 ? { body: new Uint8Array(payload) } : {}),
    });

    if (!response.ok && response.status !== 404) {
      throw new AppError('provider_unavailable', 'Storage is temporarily unavailable. Please try again.', {
        details: { status: response.status },
        retryable: true,
      });
    }
    return response;
  }

  async put(key: string, body: Buffer, options: PutOptions): Promise<StoredObject> {
    await this.send('PUT', key, body, {
      'content-type': options.contentType,
      'content-length': String(body.byteLength),
      ...(options.cacheControl ? { 'cache-control': options.cacheControl } : {}),
    });
    return { key, size: body.byteLength, contentType: options.contentType };
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.send('GET', key, Buffer.alloc(0));
    if (response.status === 404) throw new AppError('not_found', 'That file is no longer available.');
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.send('DELETE', key, Buffer.alloc(0));
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.send('HEAD', key, Buffer.alloc(0));
    return response.ok;
  }

  /**
   * Query-string SigV4 (`AWS4-HMAC-SHA256` presigned URL), valid for PUT.
   *
   * Only `host` is signed. Signing `content-type` as well would force the
   * browser to send a byte-identical header, and a mismatch there fails the
   * upload for a reason no user can act on. It is safe to leave unsigned
   * because the declared type is never trusted anyway: `validateUpload` reads
   * the magic bytes server-side before the object is accepted.
   */
  async presignPut(key: string, options: PresignOptions = {}): Promise<string> {
    const url = this.endpointFor(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.config.region}/${SERVICE}/aws4_request`;

    // AWS caps presigned URLs at seven days; the callers here want minutes.
    const expiresIn = Math.min(Math.max(options.expiresInSeconds ?? 600, 60), 604_800);

    url.searchParams.set('X-Amz-Algorithm', ALGORITHM);
    url.searchParams.set('X-Amz-Credential', `${this.config.accessKey}/${credentialScope}`);
    url.searchParams.set('X-Amz-Date', amzDate);
    url.searchParams.set('X-Amz-Expires', String(expiresIn));
    url.searchParams.set('X-Amz-SignedHeaders', 'host');
    // The canonical query string must be sorted by key.
    url.searchParams.sort();

    const canonicalRequest = [
      'PUT',
      url.pathname,
      url.searchParams.toString(),
      `host:${url.host}\n`,
      'host',
      // The body is not known at signing time, which is the whole point.
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.config.secretKey}`, dateStamp), this.config.region), SERVICE),
      'aws4_request',
    );

    url.searchParams.set(
      'X-Amz-Signature',
      createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex'),
    );

    return url.toString();
  }

  async urlFor(key: string): Promise<string> {
    return (await this.publicUrlFor(key)) ?? `/api/media/file/${encodeURIComponent(key)}`;
  }

  async publicUrlFor(key: string): Promise<string | null> {
    if (!this.config.publicBaseUrl) return null;
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${encodeKey(key)}`;
  }
}
