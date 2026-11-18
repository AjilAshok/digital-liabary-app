import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
};

describe('parseEnv', () => {
  it('applies documented defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN_MINUTES).toBe(480);
    expect(env.AUTH_COOKIE_NAME).toBe('dlms_session');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses comma-separated CORS origins', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'http://a.test, https://b.test ,' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'https://b.test']);
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects the example JWT secret', () => {
    expect(() =>
      parseEnv({ ...base, JWT_SECRET: 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS' }),
    ).toThrow(/example value/);
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('lists every invalid variable', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });
});
