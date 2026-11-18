import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, Errors } from '../../lib/errors.js';
import { paginated, paginationQuerySchema, toSkipTake } from '../../lib/pagination.js';
import { auditContext } from '../../lib/request-context.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermissions } from '../../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { recordAudit } from '../audit/audit.service.js';

export const LOCATION_LEVELS = ['buildings', 'floors', 'rooms', 'racks', 'shelves'] as const;
type Level = (typeof LOCATION_LEVELS)[number];

const levelParams = z.object({ level: z.enum(LOCATION_LEVELS) });
const locationIdParams = levelParams.extend({ id: z.uuid() });
const copyIdParams = z.object({ id: z.uuid() });
type Tx = Prisma.TransactionClient;

const createLocationSchema = z.object({
  parentId: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(20)
    .regex(/^[A-Za-z0-9._-]+$/, 'Code may contain letters, digits and . _ - only'),
  name: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  level: z.number().int().min(-10).max(200).nullable().optional(), // floor number, floors only
  capacity: z.number().int().min(0).max(100_000).nullable().optional(), // shelves only
});

const updateLocationSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9._-]+$/, 'Code may contain letters, digits and . _ - only')
      .optional(),
    name: z.string().trim().min(1).max(120).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    level: z.number().int().min(-10).max(200).nullable().optional(),
    capacity: z.number().int().min(0).max(100_000).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), 'Nothing to update');

const moveCopySchema = z.object({
  shelfId: z.uuid().nullable(),
  reason: z.string().trim().min(1, 'Reason is required').max(300),
});

const shelfReportQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});

export interface ShelfOption {
  id: string;
  /** "MAIN / G / GEN / R01 / S1" */
  path: string;
  label: string;
}

/** Flat list of active shelves with their full path, for pickers and filters. */
export async function listShelfOptions(): Promise<ShelfOption[]> {
  const shelves = await getPrisma().shelf.findMany({
    where: { archivedAt: null },
    include: {
      rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
    },
  });
  return shelves
    .map((s) => {
      const room = s.rack.room;
      const floor = room.floor;
      return {
        id: s.id,
        path: [floor.building.code, floor.code, room.code, s.rack.code, s.code].join(' / '),
        label: `${floor.building.name} · ${floor.name} · ${room.name} · Rack ${s.rack.code} · Shelf ${s.code}`,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }));
}

export function locationsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/tree', requirePermissions(PERMISSIONS.LOCATIONS_READ), async (_req, res) => {
    const buildings = await getPrisma().building.findMany({
      where: { archivedAt: null },
      orderBy: { code: 'asc' },
      include: {
        floors: {
          where: { archivedAt: null },
          orderBy: [{ level: 'asc' }, { code: 'asc' }],
          include: {
            rooms: {
              where: { archivedAt: null },
              orderBy: { code: 'asc' },
              include: {
                racks: {
                  where: { archivedAt: null },
                  orderBy: { code: 'asc' },
                  include: {
                    shelves: {
                      where: { archivedAt: null },
                      orderBy: { code: 'asc' },
                      include: {
                        _count: {
                          select: {
                            copies: { where: { archivedAt: null, status: { not: 'DISCARDED' } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    res.json({
      data: buildings.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        address: b.address,
        floors: b.floors.map((f) => ({
          id: f.id,
          code: f.code,
          name: f.name,
          level: f.level,
          rooms: f.rooms.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            racks: r.racks.map((k) => ({
              id: k.id,
              code: k.code,
              name: k.name,
              shelves: k.shelves.map((s) => ({
                id: s.id,
                code: s.code,
                name: s.name,
                capacity: s.capacity,
                copies: s._count.copies,
              })),
            })),
          })),
        })),
      })),
    });
  });

  router.get('/shelves', requirePermissions(PERMISSIONS.LOCATIONS_READ), async (_req, res) => {
    res.json({ data: await listShelfOptions() });
  });

  router.get(
    '/reports/shelves',
    requirePermissions(PERMISSIONS.LOCATIONS_READ),
    validateQuery(shelfReportQuerySchema),
    async (_req, res) => {
      const query = res.locals['query'] as z.infer<typeof shelfReportQuerySchema>;
      const where: Prisma.ShelfWhereInput = {
        archivedAt: null,
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const prisma = getPrisma();
      const [shelves, total] = await prisma.$transaction([
        prisma.shelf.findMany({
          where,
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          ...toSkipTake(query),
          include: {
            rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
          },
        }),
        prisma.shelf.count({ where }),
      ]);
      const shelfIds = shelves.map((shelf) => shelf.id);
      const counts = shelfIds.length
        ? await prisma.$queryRaw<
            {
              shelfId: string;
              titles: number;
              copies: number;
              available: number;
              issued: number;
              reserved: number;
              oldStock: number;
              newStock: number;
            }[]
          >`
            SELECT c."shelfId"::text AS "shelfId",
                   count(DISTINCT e."bookId") FILTER (WHERE c.status <> 'DISCARDED')::int AS titles,
                   count(DISTINCT c.id) FILTER (WHERE c.status <> 'DISCARDED')::int AS copies,
                   count(DISTINCT c.id) FILTER (WHERE c.status = 'AVAILABLE')::int AS available,
                   count(DISTINCT c.id) FILTER (WHERE c.status = 'ISSUED')::int AS issued,
                   count(DISTINCT c.id) FILTER (WHERE c.status = 'RESERVED')::int AS reserved,
                   count(DISTINCT c.id) FILTER (WHERE c.status <> 'DISCARDED' AND c."acquisitionType" = 'LEGACY_OLD_STOCK')::int AS "oldStock",
                   count(DISTINCT c.id) FILTER (WHERE c.status <> 'DISCARDED' AND c."acquisitionType" = 'PURCHASED_NEW')::int AS "newStock"
            FROM book_copies c
            JOIN book_editions e ON e.id = c."editionId" AND e."archivedAt" IS NULL
            WHERE c."shelfId"::text = ANY(${shelfIds}) AND c."archivedAt" IS NULL
            GROUP BY c."shelfId"`
        : [];
      const countByShelf = new Map(counts.map((entry) => [entry.shelfId, entry]));
      res.json(
        paginated(
          shelves.map((shelf) => {
            const room = shelf.rack.room;
            const floor = room.floor;
            const counts = countByShelf.get(shelf.id);
            return {
              id: shelf.id,
              code: shelf.code,
              name: shelf.name ?? shelf.code,
              capacity: shelf.capacity,
              path: [floor.building.code, floor.code, room.code, shelf.rack.code, shelf.code].join(
                ' / ',
              ),
              titles: counts?.titles ?? 0,
              copies: counts?.copies ?? 0,
              available: counts?.available ?? 0,
              issued: counts?.issued ?? 0,
              reserved: counts?.reserved ?? 0,
              oldStock: counts?.oldStock ?? 0,
              newStock: counts?.newStock ?? 0,
            };
          }),
          total,
          query,
        ),
      );
    },
  );

  router.post(
    '/:level',
    requirePermissions(PERMISSIONS.LOCATIONS_MANAGE),
    validateParams(levelParams),
    validateBody(createLocationSchema),
    async (req, res) => {
      const { level } = res.locals['params'] as z.infer<typeof levelParams>;
      const input = req.body as z.infer<typeof createLocationSchema>;
      assertFieldsForLevel(level, input);
      const created = await createLocation(level, input);
      await recordAudit(
        {
          action: 'location.created',
          entityType: level,
          entityId: created.id,
          after: { code: input.code, name: created.name },
        },
        auditContext(req),
      );
      res.status(201).json(created);
    },
  );

  router.patch(
    '/:level/:id',
    requirePermissions(PERMISSIONS.LOCATIONS_MANAGE),
    validateParams(locationIdParams),
    validateBody(updateLocationSchema),
    async (req, res) => {
      const { level, id } = res.locals['params'] as z.infer<typeof locationIdParams>;
      const input = req.body as z.infer<typeof updateLocationSchema>;
      assertFieldsForLevel(level, input);
      const updated = await updateLocation(level, id, input);
      await recordAudit(
        {
          action: 'location.updated',
          entityType: level,
          entityId: id,
          after: input,
        },
        auditContext(req),
      );
      res.json(updated);
    },
  );

  router.post(
    '/copies/:id/move',
    requirePermissions(PERMISSIONS.LOCATIONS_MANAGE),
    validateParams(copyIdParams),
    validateBody(moveCopySchema),
    async (req, res) => {
      const { id } = res.locals['params'] as z.infer<typeof copyIdParams>;
      const input = req.body as z.infer<typeof moveCopySchema>;
      res.json(await moveCopy(id, input, auditContext(req)));
    },
  );

  return router;
}

async function createLocation(level: Level, input: z.infer<typeof createLocationSchema>) {
  const prisma = getPrisma();
  const code = input.code.toUpperCase();
  const name = input.name || code;
  const needParent = level !== 'buildings';
  if (needParent && !input.parentId) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
      { path: 'parentId', message: 'Parent location is required', code: 'custom' },
    ]);
  }
  const parentId = input.parentId!;
  const duplicate = (where: string) =>
    new AppError(409, 'DUPLICATE_LOCATION_CODE', `Code ${code} already exists ${where}`);

  switch (level) {
    case 'buildings': {
      if (await prisma.building.findUnique({ where: { code } })) throw duplicate('as a building');
      const b = await prisma.building.create({
        data: { code, name, address: input.address ?? null },
      });
      return { id: b.id, code: b.code, name: b.name, address: b.address };
    }
    case 'floors': {
      if (!(await prisma.building.findUnique({ where: { id: parentId } })))
        throw Errors.notFound('Building not found');
      if (
        await prisma.floor.findUnique({
          where: { buildingId_code: { buildingId: parentId, code } },
        })
      )
        throw duplicate('in this building');
      const f = await prisma.floor.create({
        data: { buildingId: parentId, code, name, level: input.level ?? null },
      });
      return { id: f.id, code: f.code, name: f.name };
    }
    case 'rooms': {
      if (!(await prisma.floor.findUnique({ where: { id: parentId } })))
        throw Errors.notFound('Floor not found');
      if (await prisma.room.findUnique({ where: { floorId_code: { floorId: parentId, code } } }))
        throw duplicate('on this floor');
      const r = await prisma.room.create({ data: { floorId: parentId, code, name } });
      return { id: r.id, code: r.code, name: r.name };
    }
    case 'racks': {
      if (!(await prisma.room.findUnique({ where: { id: parentId } })))
        throw Errors.notFound('Room not found');
      if (await prisma.rack.findUnique({ where: { roomId_code: { roomId: parentId, code } } }))
        throw duplicate('in this room');
      const k = await prisma.rack.create({
        data: { roomId: parentId, code, name: input.name ?? null },
      });
      return { id: k.id, code: k.code, name: k.name ?? k.code };
    }
    case 'shelves': {
      if (!(await prisma.rack.findUnique({ where: { id: parentId } })))
        throw Errors.notFound('Rack not found');
      if (await prisma.shelf.findUnique({ where: { rackId_code: { rackId: parentId, code } } }))
        throw duplicate('on this rack');
      const s = await prisma.shelf.create({
        data: {
          rackId: parentId,
          code,
          name: input.name ?? null,
          capacity: input.capacity ?? null,
        },
      });
      return { id: s.id, code: s.code, name: s.name ?? s.code };
    }
  }
}

async function updateLocation(
  level: Level,
  id: string,
  input: z.infer<typeof updateLocationSchema>,
) {
  const prisma = getPrisma();
  const code = input.code?.toUpperCase();
  const duplicate = (scope: string) =>
    new AppError(409, 'DUPLICATE_LOCATION_CODE', `Code ${code} already exists ${scope}`);

  switch (level) {
    case 'buildings': {
      const before = await prisma.building.findFirst({ where: { id, archivedAt: null } });
      if (!before) throw Errors.notFound('Building not found');
      if (code && code !== before.code && (await prisma.building.findUnique({ where: { code } })))
        throw duplicate('as a building');
      return prisma.building.update({
        where: { id },
        data: {
          ...(code ? { code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
        },
        select: { id: true, code: true, name: true, address: true },
      });
    }
    case 'floors': {
      const before = await prisma.floor.findFirst({ where: { id, archivedAt: null } });
      if (!before) throw Errors.notFound('Floor not found');
      if (
        code &&
        code !== before.code &&
        (await prisma.floor.findUnique({
          where: { buildingId_code: { buildingId: before.buildingId, code } },
        }))
      )
        throw duplicate('in this building');
      return prisma.floor.update({
        where: { id },
        data: {
          ...(code ? { code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
        },
        select: { id: true, code: true, name: true, level: true },
      });
    }
    case 'rooms': {
      const before = await prisma.room.findFirst({ where: { id, archivedAt: null } });
      if (!before) throw Errors.notFound('Room not found');
      if (
        code &&
        code !== before.code &&
        (await prisma.room.findUnique({
          where: { floorId_code: { floorId: before.floorId, code } },
        }))
      )
        throw duplicate('on this floor');
      return prisma.room.update({
        where: { id },
        data: {
          ...(code ? { code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
        select: { id: true, code: true, name: true },
      });
    }
    case 'racks': {
      const before = await prisma.rack.findFirst({ where: { id, archivedAt: null } });
      if (!before) throw Errors.notFound('Rack not found');
      if (
        code &&
        code !== before.code &&
        (await prisma.rack.findUnique({ where: { roomId_code: { roomId: before.roomId, code } } }))
      )
        throw duplicate('in this room');
      return prisma.rack.update({
        where: { id },
        data: {
          ...(code ? { code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
        select: { id: true, code: true, name: true },
      });
    }
    case 'shelves': {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id::text FROM shelves WHERE id = ${id}::uuid FOR UPDATE`;
        if (locked.length === 0) throw Errors.notFound('Shelf not found');
        const before = await tx.shelf.findFirst({
          where: { id, archivedAt: null },
          include: {
            rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
          },
        });
        if (!before) throw Errors.notFound('Shelf not found');
        if (
          before.rack.archivedAt ||
          before.rack.room.archivedAt ||
          before.rack.room.floor.archivedAt ||
          before.rack.room.floor.building.archivedAt
        )
          throw Errors.notFound('Shelf is under an inactive location');
        if (
          code &&
          code !== before.code &&
          (await tx.shelf.findUnique({ where: { rackId_code: { rackId: before.rackId, code } } }))
        )
          throw duplicate('on this rack');
        if (input.capacity !== undefined && input.capacity !== null) {
          const held = await tx.bookCopy.count({
            where: { shelfId: id, archivedAt: null, status: { not: 'DISCARDED' } },
          });
          if (input.capacity < held) {
            throw new AppError(
              409,
              'SHELF_CAPACITY_TOO_SMALL',
              `Shelf currently holds ${held} copies`,
            );
          }
        }
        return tx.shelf.update({
          where: { id },
          data: {
            ...(code ? { code } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          },
          select: { id: true, code: true, name: true, capacity: true },
        });
      });
    }
  }
}

function assertFieldsForLevel(
  level: Level,
  input: { address?: unknown; level?: unknown; capacity?: unknown },
): void {
  const allowed: Record<Level, readonly string[]> = {
    buildings: ['address'],
    floors: ['level'],
    rooms: [],
    racks: [],
    shelves: ['capacity'],
  };
  for (const field of ['address', 'level', 'capacity'] as const) {
    if (input[field] !== undefined && !allowed[level].includes(field)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
        { path: field, message: `${field} is not valid for ${level}`, code: 'custom' },
      ]);
    }
  }
}

async function assertShelfCapacity(
  tx: Tx,
  shelfId: string | null,
  additionalCopies: number,
  excludeCopyId?: string,
): Promise<void> {
  if (!shelfId) return;
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM shelves WHERE id = ${shelfId}::uuid AND "archivedAt" IS NULL FOR UPDATE`;
  if (locked.length === 0) throw Errors.notFound('Active shelf not found');
  const shelf = await tx.shelf.findFirst({
    where: { id: shelfId, archivedAt: null },
    include: {
      rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
    },
  });
  if (!shelf) throw Errors.notFound('Active shelf not found');
  if (
    shelf.rack.archivedAt ||
    shelf.rack.room.archivedAt ||
    shelf.rack.room.floor.archivedAt ||
    shelf.rack.room.floor.building.archivedAt
  )
    throw Errors.notFound('Shelf is under an inactive location');
  if (shelf.capacity === null) return;
  const occupied = await tx.bookCopy.count({
    where: {
      shelfId,
      archivedAt: null,
      status: { not: 'DISCARDED' },
      ...(excludeCopyId ? { id: { not: excludeCopyId } } : {}),
    },
  });
  if (occupied + additionalCopies > shelf.capacity) {
    throw new AppError(
      409,
      'SHELF_CAPACITY_REACHED',
      `Shelf capacity is ${shelf.capacity} copies and ${occupied} are currently assigned`,
    );
  }
}

async function moveCopy(
  id: string,
  input: z.infer<typeof moveCopySchema>,
  ctx: ReturnType<typeof auditContext>,
) {
  return getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM book_copies WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) throw Errors.notFound('Copy not found');
    const copy = await tx.bookCopy.findUniqueOrThrow({ where: { id } });
    if (copy.archivedAt || copy.status === 'DISCARDED')
      throw Errors.conflict('Discarded copies cannot be moved');
    if (copy.status === 'ISSUED' || copy.status === 'RESERVED') {
      throw Errors.conflict(
        `This copy is ${copy.status.toLowerCase()} and cannot be moved between shelves`,
      );
    }
    if (copy.shelfId === input.shelfId) {
      return {
        id,
        accessionNumber: copy.accessionNumber,
        fromShelfId: copy.shelfId,
        toShelfId: copy.shelfId,
      };
    }
    await assertShelfCapacity(tx, input.shelfId, 1, id);
    await tx.bookCopy.update({ where: { id }, data: { shelfId: input.shelfId } });
    await tx.copyHistory.create({
      data: {
        copyId: id,
        eventType: 'MOVED',
        fromShelfId: copy.shelfId,
        toShelfId: input.shelfId,
        reason: input.reason,
        changedById: ctx.userId ?? null,
      },
    });
    await recordAudit(
      {
        action: 'copy.moved',
        entityType: 'BookCopy',
        entityId: id,
        before: { shelfId: copy.shelfId },
        after: { shelfId: input.shelfId },
        metadata: { accessionNumber: copy.accessionNumber, reason: input.reason },
      },
      ctx,
      tx,
    );
    return {
      id,
      accessionNumber: copy.accessionNumber,
      fromShelfId: copy.shelfId,
      toShelfId: input.shelfId,
    };
  });
}
