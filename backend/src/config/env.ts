import { z } from 'zod';

const intFromEnv = (def: number, min = 0) => z.coerce.number().int().min(min).default(def);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFromEnv(3000, 1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((v) => !v.startsWith('CHANGE_ME'), {
      message: 'JWT_SECRET still has the example value',
    }),
  JWT_EXPIRES_IN_MINUTES: intFromEnv(480, 5),
  JWT_ISSUER: z.string().min(1).default('digital-library'),
  AUTH_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('dlms_session'),
  AUTH_MAX_FAILED_LOGINS: intFromEnv(5, 1),
  AUTH_LOCKOUT_MINUTES: intFromEnv(15, 1),
  LOGIN_RATE_LIMIT_MAX: intFromEnv(20, 1),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: intFromEnv(15, 1),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: intFromEnv(0, 0),

  /** Root folder for uploaded files (covers, invoices). Relative paths resolve from the backend folder. */
  STORAGE_DIR: z.string().min(1).default('storage'),
  FRONTEND_DIST_DIR: z.string().optional(),
  OCR_PROVIDER: z.enum(['google-vision', 'disabled']).default('google-vision'),
  GOOGLE_CLOUD_VISION_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses and caches process.env. Throws a readable error listing every invalid variable. */
export function getEnv(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** Test helper: forget the cached configuration. */
export function resetEnvCache(): void {
  cached = undefined;
}
