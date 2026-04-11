import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import {
  createInMemoryMediaActionStore,
  createMediaActionsService,
  type MediaActionExecutor,
} from '../services/media-actions.service';
import { createMediaLibraryService } from '../services/media-library.service';
import { createMediaFixtureTree } from '../services/media-library.test-helpers';
import { setupMediaActionRoutes } from './media-actions';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;
let app: Elysia;
let enqueuedJobIds: string[];
let actionService: ReturnType<typeof createMediaActionsService>;
let uploadFixtureDir: string;

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR6QAAAABJRU5ErkJggg==',
  'base64'
);

describe('media action routes', () => {
  beforeEach(async () => {
    fixture = await createMediaFixtureTree();
    enqueuedJobIds = [];
    uploadFixtureDir = await mkdtemp(join(tmpdir(), 'media-action-upload-'));

    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const executor: MediaActionExecutor = {
      async enqueue(jobId) {
        enqueuedJobIds.push(jobId);
      },
    };
    actionService = createMediaActionsService({
      mediaService,
      store: createInMemoryMediaActionStore(),
      executor,
    });

    app = new Elysia().use(setupMediaActionRoutes({ actionService }));
  });

  afterEach(async () => {
    await fixture.cleanup();
    await rm(uploadFixtureDir, { recursive: true, force: true });
  });

  it('GET /api/media/actions/definitions returns definitions', async () => {
    const res = await app.handle(new Request('http://localhost/api/media/actions/definitions'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(3);
    expect(
      data.data.find((item: { type: string }) => item.type === 'image-to-image')
    ).toMatchObject({
      type: 'image-to-image',
      dispatchMethod: 'POST',
      dispatchPathname: '/webhooks/cpp/oc/vd-shoot',
    });
  });

  it('POST /api/media/actions creates and enqueues a job', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/media/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'wx-work-post',
          operator: '阿明',
          assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
          formData: { target: '摄影通知群' },
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('QUEUED');
    expect(enqueuedJobIds).toEqual([data.data.id]);
  });

  it('GET /api/media/actions returns recent jobs', async () => {
    await app.handle(
      new Request('http://localhost/api/media/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'image-to-image',
          assets: [
            { rootId: 'dapai', relativePath: '2026/04/09/A款/002.png' },
            { rootId: 'dapai', relativePath: '2026/04/09/B款/010.png' },
          ],
          formData: { mode: 'lookbook', count: 2, dryRun: false },
        }),
      })
    );

    const res = await app.handle(new Request('http://localhost/api/media/actions?limit=20'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
  });

  it('POST /api/media/actions validates image-to-image payload', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/media/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'image-to-image',
          assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
          formData: {},
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('GET /api/media/actions/:id returns a job', async () => {
    const createRes = await app.handle(
      new Request('http://localhost/api/media/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'wx-work-post',
          assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
        }),
      })
    );
    const created = await createRes.json();

    const res = await app.handle(
      new Request(`http://localhost/api/media/actions/${created.data.id}`)
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(created.data.id);
  });

  it('POST /api/media/actions/:id/retry clones a failed media action into a new queued job', async () => {
    const failedAction = await actionService.submit({
      actionType: 'image-to-image',
      operator: '阿明',
      assets: [
        { rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' },
        { rootId: 'dapai', relativePath: '2026/04/09/B款/010.png' },
      ],
      formData: { mode: 'lifestyle', count: 2, description: '重试原任务' },
      context: { workspaceDatePath: '2026/04/09' },
    });
    await actionService.updateStatus(failedAction.id, 'FAILED', {
      error: 'Gateway returned 404: Not Found',
    });

    const res = await app.handle(
      new Request(`http://localhost/api/media/actions/${failedAction.id}/retry`, {
        method: 'POST',
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).not.toBe(failedAction.id);
    expect(data.data.status).toBe('QUEUED');
    expect(data.data.formData).toMatchObject({
      mode: 'lifestyle',
      count: 2,
      description: '重试原任务',
    });
    expect(data.data.assets.map((item: { relativePath: string }) => item.relativePath)).toEqual([
      '2026/04/09/A款/001.png',
      '2026/04/09/B款/010.png',
    ]);
    expect(enqueuedJobIds).toEqual([failedAction.id, data.data.id]);

    const original = await actionService.getAction(failedAction.id);
    expect(original?.status).toBe('FAILED');
  });

  it('DELETE /api/media/actions/:id removes the task and uploaded result directory', async () => {
    const created = await actionService.submit({
      actionType: 'image-to-image',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { mode: 'lifestyle' },
    });

    const uploadDirectory = join(uploadFixtureDir, 'uploaded-result-001');
    const manifestAbsolutePath = join(uploadDirectory, 'manifest.json');
    const absolutePath = join(uploadDirectory, '01-generated-1.png');
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(absolutePath, TINY_PNG);
    await writeFile(manifestAbsolutePath, JSON.stringify({ ok: true }), 'utf-8');

    await actionService.updateStatus(created.id, 'SUCCESS', {
      callbackPayload: {
        actionType: 'image-to-image',
        status: 'success',
        result: {
          extra: {
            upload: {
              directory: 'uploaded/openclaw/2026/04/11/ext-task-delete-001',
              directoryAbsolutePath: uploadDirectory,
              manifestPath: 'uploaded/openclaw/2026/04/11/ext-task-delete-001/manifest.json',
              manifestAbsolutePath,
              files: [
                {
                  fieldName: 'files',
                  originalName: 'generated-1.png',
                  storedName: '01-generated-1.png',
                  relativePath:
                    'uploaded/openclaw/2026/04/11/ext-task-delete-001/01-generated-1.png',
                  absolutePath,
                  mimeType: 'image/png',
                  size: TINY_PNG.byteLength,
                },
              ],
            },
          },
        },
      },
    });

    const res = await app.handle(
      new Request(`http://localhost/api/media/actions/${created.id}`, {
        method: 'DELETE',
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      success: true,
      data: {
        id: created.id,
        removedUploadDirectory: 'uploaded/openclaw/2026/04/11/ext-task-delete-001',
      },
    });

    const getRes = await app.handle(
      new Request(`http://localhost/api/media/actions/${created.id}`)
    );
    expect(getRes.status).toBe(404);
    await expect(access(uploadDirectory)).rejects.toBeDefined();
  });

  it('GET /api/media/actions/:id/uploads/* serves uploaded result images for a media action', async () => {
    const created = await actionService.submit({
      actionType: 'image-to-image',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { mode: 'lifestyle' },
    });

    const relativePath = 'uploaded/openclaw/2026/04/11/ext-task-001/01-generated-1.png';
    const absolutePath = join(uploadFixtureDir, '01-generated-1.png');
    await writeFile(absolutePath, TINY_PNG);

    await actionService.updateStatus(created.id, 'SUCCESS', {
      externalTaskId: 'ext-task-001',
      callbackPayload: {
        actionType: 'image-to-image',
        status: 'success',
        result: {
          summary: '生成完成',
          extra: {
            upload: {
              directory: 'uploaded/openclaw/2026/04/11/ext-task-001',
              manifestPath: 'uploaded/openclaw/2026/04/11/ext-task-001/manifest.json',
              manifestAbsolutePath: join(uploadFixtureDir, 'manifest.json'),
              files: [
                {
                  fieldName: 'files',
                  originalName: 'generated-1.png',
                  storedName: '01-generated-1.png',
                  relativePath,
                  absolutePath,
                  mimeType: 'image/png',
                  size: TINY_PNG.byteLength,
                },
              ],
            },
          },
        },
      },
    });

    const res = await app.handle(
      new Request(`http://localhost/api/media/actions/${created.id}/uploads/${relativePath}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(TINY_PNG);
  });

  it('rejects upload file requests outside the recorded upload list', async () => {
    const created = await actionService.submit({
      actionType: 'image-to-image',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { mode: 'lifestyle' },
    });

    await actionService.updateStatus(created.id, 'SUCCESS', {
      callbackPayload: {
        actionType: 'image-to-image',
        status: 'success',
        result: {
          extra: {
            upload: {
              directory: 'uploaded/openclaw/2026/04/11/ext-task-002',
              manifestPath: 'uploaded/openclaw/2026/04/11/ext-task-002/manifest.json',
              files: [],
            },
          },
        },
      },
    });

    const res = await app.handle(
      new Request(
        `http://localhost/api/media/actions/${created.id}/uploads/uploaded/openclaw/2026/04/11/ext-task-002/not-found.png`
      )
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toEqual({
      success: false,
      error: 'Upload file not found',
    });
  });
});
