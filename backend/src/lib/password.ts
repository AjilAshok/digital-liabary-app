import argon2 from 'argon2';

/**
 * Argon2id parameters (OWASP Password Storage Cheat Sheet minimum: m=19 MiB, t=2, p=1).
 * Parameters are encoded in each hash, so they can be raised later without breaking old hashes.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns comparable CPU time when the account does not exist, so response timing
 * does not reveal which email addresses are registered.
 */
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(await dummyHash, plain);
}

/** Basic strength policy: length + at least three of four character classes. */
export function checkPasswordStrength(plain: string): string[] {
  const problems: string[] = [];
  if (plain.length < PASSWORD_MIN_LENGTH)
    problems.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (plain.length > PASSWORD_MAX_LENGTH)
    problems.push(`at most ${PASSWORD_MAX_LENGTH} characters`);
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(plain)).length;
  if (classes < 3) problems.push('three of: lowercase, uppercase, digit, symbol');
  return problems;
}
