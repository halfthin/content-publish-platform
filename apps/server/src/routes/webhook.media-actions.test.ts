import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import {
  createInMemoryMediaActionStore,
  createMediaActionsService,
  createNoopMediaActionExecutor,
} from '../services/media-actions.service';
import { createMediaLibraryService } from '../services/media-library.service';
import { createMediaFixtureTree } from '../services/media-library.test-helpers';
import { createInMemoryOpenClawCallbackEventDeduper } from '../services/openclaw-callback-deduper';
import { createOpenClawResultStorageService } from '../services/openclaw-result-storage.service';
import { setupWebhookRoutes } from './webhook';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;
let app: Elysia;
let actionService: ReturnType<typeof createMediaActionsService>;
let contentDir: string;

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR6QAAAABJRU5ErkJggg==',
  'base64'
);

describe('media action webhook routes', () => {
  beforeEach(async () => {
    fixture = await createMediaFixtureTree();
    contentDir = await mkdtemp(join(tmpdir(), 'media-action-webhook-content-'));
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
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        openClawResultStorage: createOpenClawResultStorageService({
          contentBaseDir: contentDir,
        }),
      })
    );
  });

  afterEach(async () => {
    await fixture.cleanup();
    await rm(contentDir, { recursive: true, force: true });
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

  it('accepts the unified OpenClaw callback envelope for media actions', async () => {
    const created = await actionService.submit({
      actionType: 'image-to-image',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { mode: 'lifestyle' },
    });

    const res = await app.handle(
      new Request('http://localhost/api/webhook/media-actions/image-to-image/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer media-callback-token',
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-img-001',
          taskId: 'ext-img-001',
          source: 'openclaw',
          kind: 'media-action',
          actionType: 'image-to-image',
          status: 'needs-auth',
          refs: {
            mediaActionId: created.id,
          },
          result: {
            summary: '需要人工处理后重试',
            extra: {
              step: 'login',
            },
          },
          timestamp: new Date().toISOString(),
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toMatchObject({
      actionType: 'image-to-image',
      status: 'needs-auth',
      taskId: 'ext-img-001',
      upload: null,
    });

    const updated = await actionService.getAction(created.id);
    expect(updated?.status).toBe('NEEDS_AUTH');
    expect(updated?.callbackPayload?.result).toEqual({
      externalId: null,
      url: null,
      summary: '需要人工处理后重试',
      extra: {
        step: 'login',
      },
    });
  });

  it('accepts multipart media action callbacks and stores uploaded result images', async () => {
    const created = await actionService.submit({
      actionType: 'image-to-image',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { mode: 'lifestyle' },
    });

    const formData = new FormData();
    formData.set(
      'payload',
      JSON.stringify({
        version: '1.0',
        eventId: 'evt-img-upload-001',
        taskId: 'ext-img-upload-001',
        source: 'openclaw',
        kind: 'media-action',
        actionType: 'image-to-image',
        status: 'success',
        refs: {
          mediaActionId: created.id,
        },
        result: {
          summary: '生成完成',
        },
        timestamp: '2026-04-11T09:00:00.000Z',
      })
    );
    formData.append(
      'files',
      new File([TINY_PNG], 'generated-1.png', {
        type: 'image/png',
      })
    );
    formData.append(
      'files',
      new File([TINY_PNG], 'generated 2.png', {
        type: 'image/png',
      })
    );

    const res = await app.handle(
      new Request('http://localhost/api/webhook/media-actions/image-to-image/result', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer media-callback-token',
        },
        body: formData,
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      data: {
        eventId: 'evt-img-upload-001',
        taskId: 'ext-img-upload-001',
        actionType: 'image-to-image',
        status: 'success',
        upload: {
          fileCount: 2,
          directory: 'uploaded/openclaw/2026/04/11/ext-img-upload-001',
          manifestPath: 'uploaded/openclaw/2026/04/11/ext-img-upload-001/manifest.json',
        },
      },
    });

    const updated = await actionService.getAction(created.id);
    expect(updated?.status).toBe('SUCCESS');
    expect(updated?.callbackPayload?.result).toEqual(
      expect.objectContaining({
        summary: '生成完成',
        artifacts: [
          expect.objectContaining({
            kind: 'image',
            role: 'generated',
            meta: expect.objectContaining({
              relativePath: 'uploaded/openclaw/2026/04/11/ext-img-upload-001/01-generated-1.png',
            }),
          }),
          expect.objectContaining({
            kind: 'image',
            role: 'generated',
            meta: expect.objectContaining({
              relativePath: 'uploaded/openclaw/2026/04/11/ext-img-upload-001/02-generated-2.png',
            }),
          }),
        ],
        extra: expect.objectContaining({
          upload: expect.objectContaining({
            fileCount: 2,
            manifestPath: 'uploaded/openclaw/2026/04/11/ext-img-upload-001/manifest.json',
          }),
        }),
      })
    );
  });

  it('ignores duplicate media action callback events after the first successful processing', async () => {
    const created = await actionService.submit({
      actionType: 'image-to-image',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { mode: 'lifestyle' },
    });

    const request = () =>
      new Request('http://localhost/api/webhook/media-actions/image-to-image/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer media-callback-token',
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-img-dup-001',
          taskId: 'ext-img-dup-001',
          source: 'openclaw',
          kind: 'media-action',
          actionType: 'image-to-image',
          status: 'success',
          refs: {
            mediaActionId: created.id,
          },
          result: {
            summary: '生成完成',
          },
          timestamp: new Date().toISOString(),
        }),
      });

    const firstRes = await app.handle(request());
    const secondRes = await app.handle(request());
    const secondData = await secondRes.json();

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondData).toMatchObject({
      success: true,
      duplicate: true,
      data: {
        eventId: 'evt-img-dup-001',
        taskId: 'ext-img-dup-001',
        actionType: 'image-to-image',
        status: 'success',
      },
    });

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
