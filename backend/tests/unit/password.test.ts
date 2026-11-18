import { describe, expect, it } from 'vitest';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('Correct-Horse-9');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Correct-Horse-9')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('salts each hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('Same-Pass-123'),
      hashPassword('Same-Pass-123'),
    ]);
    expect(a).not.toEqual(b);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('password strength', () => {
  it('accepts a long password with three character classes', () => {
    expect(checkPasswordStrength('library-Admin-2026')).toEqual([]);
  });

  it('rejects short passwords', () => {
    expect(checkPasswordStrength('Ab1!')).toContainEqual(expect.stringContaining('10 characters'));
  });

  it('rejects low-variety passwords', () => {
    expect(checkPasswordStrength('alllowercaseletters')).toHaveLength(1);
  });
});
