import { Router } from 'express';
import { getPrisma } from '../../db/prisma.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermissions } from '../../middleware/authorize.js';
import { PERMISSIONS } from '../../security/permissions.js';

/** Read-only roles & permissions listing (role editing arrives with user management). */
export function rolesRouter(): Router {
  const router = Router();

  router.get('/', authenticate, requirePermissions(PERMISSIONS.ROLES_READ), async (_req, res) => {
    const roles = await getPrisma().role.findMany({
      orderBy: { code: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    res.json({
      data: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        userCount: r._count.users,
        permissions: r.permissions.map((rp) => rp.permission.code).sort(),
      })),
    });
  });

  router.get(
    '/permissions',
    authenticate,
    requirePermissions(PERMISSIONS.ROLES_READ),
    async (_req, res) => {
      const permissions = await getPrisma().permission.findMany({
        orderBy: [{ group: 'asc' }, { code: 'asc' }],
      });
      res.json({
        data: permissions.map((p) => ({
          code: p.code,
          description: p.description,
          group: p.group,
        })),
      });
    },
  );

  return router;
}
