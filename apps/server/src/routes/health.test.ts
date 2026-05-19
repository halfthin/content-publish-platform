import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { setupHealthRoutes } from './health';

describe('health routes', () => {
  it('GET /health returns liveness status', async () => {
    const app = new Elysia().use(setupHealthRoutes());

    const res = await app.handle(new Request('http://localhost/health'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(typeof data.timestamp).toBe('string');
  });

  it('GET /ready returns ready when all checks pass', async () => {
    const app = new Elysia().use(
      setupHealthRoutes({
        checks: {
          env: async () => ({ status: 'ok' }),
          database: async () => ({ status: 'ok' }),
          redis: async () => ({ status: 'ok' }),
          contentDir: async () => ({ status: 'ok' }),
          gateway: async () => ({ status: 'ok' }),
        },
      })
    );

    const res = await app.handle(new Request('http://localhost/ready'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      status: 'ready',
      checks: {
        env: { status: 'ok' },
        database: { status: 'ok' },
        redis: { status: 'ok' },
        contentDir: { status: 'ok' },
        gateway: { status: 'ok' },
      },
    });
  });

  it('GET /ready returns 503 when one check fails', async () => {
    const app = new Elysia().use(
      setupHealthRoutes({
        checks: {
          env: async () => ({ status: 'ok' }),
          database: async () => ({ status: 'error', message: 'database unreachable' }),
          redis: async () => ({ status: 'ok' }),
          contentDir: async () => ({ status: 'ok' }),
          gateway: async () => ({ status: 'ok' }),
        },
      })
    );

    const res = await app.handle(new Request('http://localhost/ready'));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe('unready');
    expect(data.checks.database).toEqual({ status: 'error', message: 'database unreachable' });
  });
});
