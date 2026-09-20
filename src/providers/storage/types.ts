/**
 * Object storage contract. The application only ever sees this interface, so
 * moving from the local disk driver to S3/R2 is a configuration change.
 */
export type StoredObject = {
  key: string;
  size: number;
  contentType: string;
};

export type PutOptions = {
  contentType: string;
  /** Cache-Control for drivers that serve bytes directly. */
  cacheControl?: string;
  metadata?: Record<string, string>;
};

export type PresignOptions = {
  /** Advisory only: the bytes are re-inspected server-side before they count. */
  contentType?: string;
  expiresInSeconds?: number;
};

export interface StorageProvider {
  readonly name: string;

  put(key: string, body: Buffer, options: PutOptions): Promise<StoredObject>;

  get(key: string): Promise<Buffer>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /**
   * A URL the browser can load. Local storage returns an app route; S3 returns
   * either a CDN URL or a time-limited signed URL.
   */
  urlFor(key: string, options?: { expiresInSeconds?: number }): Promise<string>;

  /**
   * A publicly reachable HTTPS URL, required by platform APIs that fetch media
   * themselves (Instagram, Pinterest). Returns null when the current driver
   * cannot produce one — callers must handle that rather than pretend.
   */
  publicUrlFor(key: string): Promise<string | null>;

  /**
   * A short-lived URL the browser can PUT bytes to directly, bypassing the
   * application server entirely.
   *
   * This exists because serverless hosts cap request bodies well below the
   * media limits this app allows — Netlify at roughly 6 MB against a 200 MB
   * video ceiling. Uploading straight to the bucket sidesteps that cap.
   *
   * Returns null when the driver has no such concept (the local disk driver),
   * and callers must fall back to posting bytes through the server.
   */
  presignPut(key: string, options: PresignOptions): Promise<string | null>;
}
