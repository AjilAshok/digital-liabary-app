import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, checkPasswordStrength } from '../../lib/password.js';

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be at most 120 characters')
    .transform((v) => v.replace(/\s+/g, ' ')),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(PASSWORD_MAX_LENGTH),
    newPassword: z
      .string()
      .max(PASSWORD_MAX_LENGTH)
      .superRefine((value, ctx) => {
        const problems = checkPasswordStrength(value);
        if (problems.length > 0) {
          ctx.addIssue({ code: 'custom', message: `Password needs ${problems.join(', ')}` });
        }
      }),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
