import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
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

describe('media action routes', () => {
  beforeEach(async () => {
    fixture = await createMediaFixtureTree();
    enqueuedJobIds = [];

    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const executor: MediaActionExecutor = {
      async enqueue(jobId) {
        enqueuedJobIds.push(jobId);
      },
    };
    const actionService = createMediaActionsService({
      mediaService,
      store: createInMemoryMediaActionStore(),
      executor,
    });

    app = new Elysia().use(setupMediaActionRoutes({ actionService }));
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('GET /api/media/actions/definitions returns definitions', async () => {
    const res = await app.handle(new Request('http://localhost/api/media/actions/definitions'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(3);
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
          actionType: 'notify-photographer',
          assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/002.png' }],
          formData: { target: '摄影师A', requirement: '补拍奶油风' },
        }),
      })
    );

    const res = await app.handle(new Request('http://localhost/api/media/actions?limit=20'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
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
});
