import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { setupPublishRoutes } from './publish';

const describeIfIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

describe('generic publish routes', () => {
  it('POST /api/publish returns 400 when routing fields are missing', async () => {
    const app = new Elysia().use(setupPublishRoutes());

    const res = await app.handle(
      new Request('http://localhost/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'xiaohongshu', accountId: 'account-1' }),
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ success: false, error: 'platform, accountId, action required' });
  });

  it('GET /api/publish/:jobId returns 404', async () => {
    const app = new Elysia().use(setupPublishRoutes());

    const res = await app.handle(new Request('http://localhost/api/publish/missing-job'));
    expect(res.status).toBe(404);
  });
});

describeIfIntegration('generic publish routes (integration)', () => {
  it('POST /api/publish returns 202 with taskId/streamUrl/statusUrl', async () => {
    const app = new Elysia().use(setupPublishRoutes());

    const res = await app.handle(
      new Request('http://localhost/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'xiaohongshu',
          accountId: 'account-1',
          accountName: 'xhs-1',
          action: 'publish',
          payload: {
            title: '标题',
            description: '正文',
            images: ['/data/1.png'],
            tags: ['tag1'],
          },
        }),
      })
    );

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.taskId).toBeDefined();
    expect(data.data.streamUrl).toContain('/api/queue-proxy/tasks/');
    expect(data.data.statusUrl).toContain('/api/queue-proxy/tasks/');
  });
});
