import { PrismaClient } from '@prisma/client';
import { log } from './logger';

declare const global: typeof globalThis;

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

const isTest = process.env.NODE_ENV === 'test' || process.env.TEST_DATABASE === 'sqlite';

// Specify datasourceUrl in schema.prisma or use default env var
// For testing with SQLite, provide sqlite URL
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isTest ? [] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
export async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
    log.info('Prisma disconnected');
  } catch (error) {
    log.error('Error disconnecting Prisma:', error);
  }
}

export default prisma;
