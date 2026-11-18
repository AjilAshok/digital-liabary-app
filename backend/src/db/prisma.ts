import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

let client: PrismaClient | undefined;

/** Lazily created singleton Prisma client (PostgreSQL driver adapter, Prisma 7). */
export function getPrisma(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

export type { PrismaClient };
