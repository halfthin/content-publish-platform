import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import {
  createInMemoryMediaActionStore,
  createMediaActionsService,
  createNoopMediaActionExecutor,
} from '../services/media-actions.service';
import { createMediaLibraryService } from '../services/media-library.service';
import { createMediaFixtureTree } from '../services/media-library.test-helpers';
import { setupWebhookRoutes } from './webhook';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;
let app: Elysia;
let actionService: ReturnType<typeof createMediaActionsService>;

describe('media action webhook routes', () => {
  beforeEach(async () => {
    fixture = await createMediaFixtureTree();
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    actionService = createMediaActionsService({
      mediaService,
      store: createInMemoryMediaActionStore(),
      executor: createNoopMediaActionExecutor(),
    });
    app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: actionService,
        mediaActionCallbackToken: 'media-callback-token',
      })
    );
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('updates a media action from webhook callback', async () => {
    const created = await actionService.submit({
      actionType: 'wx-work-post',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
    });
    await actionService.updateStatus(created.id, 'DISPATCHED', { externalTaskId: 'ext-001' });

    const res = await app.handle(
      new Request('http://localhost/api/webhook/media-actions/wx-work-post/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer media-callback-token',
        },
        body: JSON.stringify({
          taskId: 'ext-001',
          actionType: 'wx-work-post',
          status: 'success',
          result: { posted: true },
          timestamp: new Date().toISOString(),
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const updated = await actionService.getAction(created.id);
    expect(updated?.status).toBe('SUCCESS');
  });

  it('rejects invalid media action webhook token', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/webhook/media-actions/wx-work-post/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
        body: JSON.stringify({
          taskId: 'ext-001',
          actionType: 'wx-work-post',
          status: 'failed',
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });
});
