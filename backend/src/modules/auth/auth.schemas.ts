import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../../lib/password.js';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Enter a valid email address' }))
    .pipe(z.string().max(254)),
  // Length is capped to bound hashing cost; strength is enforced when passwords are set, not at login.
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export type LoginInput = z.infer<typeof loginSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
