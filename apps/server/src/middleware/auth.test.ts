import { afterEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { setupAuthMiddleware } from './auth';

describe('鉴权 middleware', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createApp() {
    return new Elysia()
      .use(setupAuthMiddleware())
      .get('/health', () => ({ status: 'ok' }))
      .get('/ready', () => ({ status: 'ready' }))
      .get('/docs', () => 'docs')
      .get('/api/accounts', () => ({ success: true }))
      .post('/api/webhook/xhs/publish-result', () => ({ success: true }));
  }

  it('allows health without token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(new Request('http://localhost/health'));

    expect(res.status).toBe(200);
  });

  it('rejects protected api routes without token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(new Request('http://localhost/api/accounts'));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('allows protected api routes with correct bearer token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(
      new Request('http://localhost/api/accounts', {
        headers: { Authorization: 'Bearer prod-api-auth-token-32-characters-minimum' },
      })
    );

    expect(res.status).toBe(200);
  });

  it('does not apply management token to webhook routes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(
      new Request('http://localhost/api/webhook/xhs/publish-result', { method: 'POST' })
    );

    expect(res.status).toBe(200);
  });

  it('hides docs when EXPOSE_DOCS is false in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';
    process.env.EXPOSE_DOCS = 'false';

    const res = await createApp().handle(new Request('http://localhost/docs'));

    expect(res.status).toBe(404);
  });
});
