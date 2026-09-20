import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

function key(): Buffer {
  // The configured secret is stretched to exactly 32 bytes; this accepts either
  // a base64 key or a long passphrase without changing the call sites.
  return createHash('sha256').update(env().ENCRYPTION_KEY, 'utf8').digest();
}

/**
 * Envelope encryption for data at rest (OAuth access/refresh tokens).
 * Format: v1.<iv>.<authTag>.<ciphertext>, all base64url.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted value');
  }
  const [, ivRaw, tagRaw, dataRaw] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function tryDecryptSecret(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  try {
    return decryptSecret(encoded);
  } catch {
    return null;
  }
}

/** URL-safe high-entropy token for sessions, invitations and OAuth state. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are looked up by hash so the database never holds a usable secret. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}
