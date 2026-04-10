import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  createInMemoryMediaActionStore,
  createMediaActionsService,
  createNoopMediaActionExecutor,
} from './media-actions.service';
import { createMediaLibraryService } from './media-library.service';
import { createMediaFixtureTree } from './media-library.test-helpers';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;

beforeEach(async () => {
  fixture = await createMediaFixtureTree();
});

afterEach(async () => {
  await fixture.cleanup();
});

describe('media-actions.service', () => {
  it('returns action definitions', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaActionsService({
      mediaService,
      store: createInMemoryMediaActionStore(),
      executor: createNoopMediaActionExecutor(),
    });

    expect(service.getDefinitions().map((item) => item.type)).toEqual([
      'wx-work-post',
      'wechat-article',
      'notify-photographer',
    ]);
  });

  it('submits an action and snapshots asset metadata', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaActionsService({
      mediaService,
      store: createInMemoryMediaActionStore(),
      executor: createNoopMediaActionExecutor(),
    });

    const summary = await service.submit({
      actionType: 'wx-work-post',
      operator: '阿明',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
      formData: { target: '摄影通知群', text: '今日选片' },
      context: { workspaceDatePath: '2026/04/09' },
    });

    expect(summary.status).toBe('QUEUED');
    expect(summary.assets).toHaveLength(1);
    expect(summary.assets[0]?.fileUrl).toContain('/api/media/file/');
    expect(summary.assets[0]?.filename).toBe('001.png');
  });

  it('lists recent actions latest first', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const store = createInMemoryMediaActionStore();
    const service = createMediaActionsService({
      mediaService,
      store,
      executor: createNoopMediaActionExecutor(),
    });

    const first = await service.submit({
      actionType: 'wx-work-post',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
    });
    const second = await service.submit({
      actionType: 'notify-photographer',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/002.png' }],
      formData: { target: '摄影师 A', requirement: '奶油风补拍' },
    });

    const recent = await service.listRecent();
    expect(recent[0]?.id).toBe(second.id);
    expect(recent[1]?.id).toBe(first.id);
  });

  it('updates action status from webhook callback', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const store = createInMemoryMediaActionStore();
    const service = createMediaActionsService({
      mediaService,
      store,
      executor: createNoopMediaActionExecutor(),
    });

    const summary = await service.submit({
      actionType: 'wx-work-post',
      assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/001.png' }],
    });

    await service.updateStatus(summary.id, 'DISPATCHED', { externalTaskId: 'ext-123' });
    const updated = await service.handleCallback({
      taskId: 'ext-123',
      actionType: 'wx-work-post',
      status: 'success',
      result: { posted: true },
    });

    expect(updated.status).toBe('SUCCESS');
    expect(updated.callbackPayload?.status).toBe('success');
  });

  it('rejects empty asset selections', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaActionsService({
      mediaService,
      store: createInMemoryMediaActionStore(),
      executor: createNoopMediaActionExecutor(),
    });

    expect(service.submit({ actionType: 'wx-work-post', assets: [] })).rejects.toMatchObject({
      status: 400,
    });
  });
});
