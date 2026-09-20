import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, generateToken, hashToken, tryDecryptSecret } from '@/lib/crypto';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/server/auth/password';
import { can, capabilitiesFor } from '@/server/auth/permissions';
import { checkRateLimit, resetRateLimits } from '@/server/services/rate-limit';
import { AppError, toPublicError } from '@/lib/errors';

describe('password hashing', () => {
  it('produces a verifiable hash that is not the password', async () => {
    const hash = await hashPassword('correct horse battery 42');
    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('correct horse battery 42', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery 42');
    await expect(verifyPassword('wrong horse battery 42', hash)).resolves.toBe(false);
  });

  it('salts each hash so identical passwords differ', async () => {
    const [a, b] = await Promise.all([hashPassword('same password 1'), hashPassword('same password 1')]);
    expect(a).not.toBe(b);
  });

  it('returns false rather than throwing for absent or malformed hashes', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$a$b$c$d$e')).resolves.toBe(false);
  });

  it('enforces a minimum strength', () => {
    expect(validatePasswordStrength('short')).toBeTruthy();
    expect(validatePasswordStrength('alllettersonly')).toBeTruthy();
    expect(validatePasswordStrength('1234567890')).toBeTruthy();
    expect(validatePasswordStrength('goodpassword1')).toBeNull();
  });
});

describe('secret encryption', () => {
  it('round-trips a value', () => {
    const encrypted = encryptSecret('ya29.a0AfH6SMB-platform-token');
    expect(encrypted).not.toContain('ya29');
    expect(decryptSecret(encrypted)).toBe('ya29.a0AfH6SMB-platform-token');
  });

  it('produces different ciphertext each time', () => {
    expect(encryptSecret('same value')).not.toBe(encryptSecret('same value'));
  });

  it('refuses tampered ciphertext instead of returning garbage', () => {
    const encrypted = encryptSecret('sensitive');
    const parts = encrypted.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from('evil').toString('base64url')}`;
    expect(() => decryptSecret(tampered)).toThrow();
    expect(tryDecryptSecret(tampered)).toBeNull();
  });
});

describe('token hashing', () => {
  it('never stores the raw token', () => {
    const token = generateToken(32);
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
    expect(hashToken(token)).toBe(hash);
  });
});

describe('permission matrix', () => {
  it('lets only admins and owners approve and publish', () => {
    expect(can('viewer', 'campaign:approve')).toBe(false);
    expect(can('editor', 'campaign:approve')).toBe(false);
    expect(can('admin', 'campaign:approve')).toBe(true);
    expect(can('owner', 'campaign:approve')).toBe(true);

    expect(can('editor', 'campaign:publish')).toBe(false);
    expect(can('admin', 'campaign:publish')).toBe(true);
  });

  it('keeps billing and org management with the owner', () => {
    expect(can('admin', 'billing:manage')).toBe(false);
    expect(can('owner', 'billing:manage')).toBe(true);
    expect(can('admin', 'org:manage')).toBe(false);
    expect(can('owner', 'org:manage')).toBe(true);
  });

  it('gives a viewer read access only', () => {
    const viewer = capabilitiesFor('viewer');
    expect(viewer).toContain('org:read');
    expect(viewer.some((capability) => capability.endsWith(':write'))).toBe(false);
  });

  it('is strictly cumulative from viewer to owner', () => {
    const roles = ['viewer', 'editor', 'admin', 'owner'] as const;
    for (let i = 1; i < roles.length; i += 1) {
      for (const capability of capabilitiesFor(roles[i - 1]!)) {
        expect(can(roles[i]!, capability)).toBe(true);
      }
    }
  });
});

describe('rate limiting', () => {
  it('blocks after the configured number of attempts', () => {
    resetRateLimits();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(() => checkRateLimit('login', '198.51.100.7')).not.toThrow();
    }
    expect(() => checkRateLimit('login', '198.51.100.7')).toThrow(AppError);
  });

  it('tracks identifiers independently', () => {
    resetRateLimits();
    for (let attempt = 0; attempt < 10; attempt += 1) checkRateLimit('login', '198.51.100.1');
    expect(() => checkRateLimit('login', '198.51.100.2')).not.toThrow();
  });
});

describe('error surfacing', () => {
  it('never leaks an internal message to the client', () => {
    const internal = new Error('connection string postgres://user:hunter2@db');
    const surfaced = toPublicError(internal);
    expect(surfaced.code).toBe('internal_error');
    expect(surfaced.message).not.toContain('hunter2');
  });

  it('passes through a deliberate user-facing message', () => {
    const surfaced = toPublicError(new AppError('connection_expired', 'Your Facebook connection has expired.'));
    expect(surfaced.code).toBe('connection_expired');
    expect(surfaced.message).toContain('Facebook');
  });

  it('marks provider faults retryable and user faults not', () => {
    expect(new AppError('provider_rate_limited', 'slow down').retryable).toBe(true);
    expect(new AppError('validation_failed', 'bad input').retryable).toBe(false);
  });
});
