import type { PrismaClient } from '../generated/prisma/client.js';
import { checkPasswordStrength, hashPassword } from '../lib/password.js';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSION_DESCRIPTIONS,
  permissionGroup,
  type RoleCode,
} from '../security/permissions.js';

/**
 * Idempotently synchronises the permission catalogue and system roles.
 * - Permissions are upserted from code.
 * - ADMIN always receives every permission.
 * - Other system roles receive their DEFAULT permissions only when missing (never removed),
 *   so admin customisations survive re-seeding.
 */
export async function seedAccessControl(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const code of ALL_PERMISSIONS) {
      await tx.permission.upsert({
        where: { code },
        update: { description: PERMISSION_DESCRIPTIONS[code], group: permissionGroup(code) },
        create: { code, description: PERMISSION_DESCRIPTIONS[code], group: permissionGroup(code) },
      });
    }
    const permissionRows = await tx.permission.findMany({ select: { id: true, code: true } });
    const idByCode = new Map(permissionRows.map((p) => [p.code, p.id]));

    for (const [code, def] of Object.entries(DEFAULT_ROLES) as [
      RoleCode,
      (typeof DEFAULT_ROLES)[RoleCode],
    ][]) {
      const role = await tx.role.upsert({
        where: { code },
        update: { isSystem: true },
        create: { code, name: def.name, description: def.description, isSystem: true },
      });
      await tx.rolePermission.createMany({
        data: def.permissions.map((p) => ({ roleId: role.id, permissionId: idByCode.get(p)! })),
        skipDuplicates: true,
      });
    }
  });
}

export interface SeedUserInput {
  email: string;
  password: string;
  fullName: string;
  roleCode: RoleCode;
}

/** Creates a user with a role if the email is not registered yet. Never overwrites an existing password. */
export async function ensureUser(
  prisma: PrismaClient,
  input: SeedUserInput,
): Promise<{ id: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { id: existing.id, created: false };

  const problems = checkPasswordStrength(input.password);
  if (problems.length > 0) {
    throw new Error(`Seed password for ${email} is too weak — needs ${problems.join(', ')}`);
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { code: input.roleCode } });
  const user = await prisma.user.create({
    data: {
      email,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      roles: { create: { roleId: role.id } },
    },
  });
  return { id: user.id, created: true };
}
