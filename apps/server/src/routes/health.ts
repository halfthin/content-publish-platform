import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Elysia } from 'elysia';
import { validateEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { getRedisClient } from '../config/redis';

type CheckStatus = 'ok' | 'warn' | 'error';

export interface ReadinessCheckResult {
  status: CheckStatus;
  message?: string;
}

export type ReadinessCheck = () => Promise<ReadinessCheckResult>;

export interface HealthRouteOptions {
  checks?: Record<string, ReadinessCheck>;
}

async function envCheck(): Promise<ReadinessCheckResult> {
  const result = validateEnv();
  if (!result.valid) {
    return { status: 'error', message: result.errors.join('; ') };
  }
  return result.warnings.length > 0
    ? { status: 'warn', message: result.warnings.join('; ') }
    : { status: 'ok' };
}

async function databaseCheck(): Promise<ReadinessCheckResult> {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok' };
}

async function redisCheck(): Promise<ReadinessCheckResult> {
  const redis = getRedisClient();
  const pong = await redis.ping();
  return pong === 'PONG' ? { status: 'ok' } : { status: 'error', message: `Unexpected ${pong}` };
}

async function contentDirCheck(): Promise<ReadinessCheckResult> {
  const root = resolve(process.cwd(), process.env.CONTENT_DIR || './content');
  await mkdir(join(root, 'inbox'), { recursive: true });
  await mkdir(join(root, 'approved'), { recursive: true });
  await mkdir(join(root, 'published'), { recursive: true });
  await access(root);
  return { status: 'ok' };
}

async function gatewayCheck(): Promise<ReadinessCheckResult> {
  if (process.env.PUBLISH_MODE === 'local') {
    return { status: 'warn', message: 'PUBLISH_MODE=local' };
  }
  if (!process.env.OPENCLAW_GATEWAY_URL) {
    return { status: 'warn', message: 'OPENCLAW_GATEWAY_URL is not configured' };
  }
  return { status: 'ok' };
}

const defaultChecks: Record<string, ReadinessCheck> = {
  env: envCheck,
  database: databaseCheck,
  redis: redisCheck,
  contentDir: contentDirCheck,
  gateway: gatewayCheck,
};

export function setupHealthRoutes(options: HealthRouteOptions = {}) {
  const checks = options.checks || defaultChecks;

  return new Elysia()
    .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
    .get('/ready', async ({ set }) => {
      const entries = await Promise.all(
        Object.entries(checks).map(async ([name, check]) => {
          try {
            return [name, await check()] as const;
          } catch (error) {
            return [name, { status: 'error', message: String(error) }] as const;
          }
        })
      );
      const results = Object.fromEntries(entries);
      const hasError = entries.some(([, result]) => result.status === 'error');

      if (hasError) {
        set.status = 503;
      }

      return {
        status: hasError ? 'unready' : 'ready',
        checks: results,
        timestamp: new Date().toISOString(),
      };
    });
}
