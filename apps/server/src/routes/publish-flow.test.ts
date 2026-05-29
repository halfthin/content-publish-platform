import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { createInMemoryAccountCheckLoginCallbackStore } from '../services/account-check-login-callbacks.service';
import { createInMemoryOpenClawCallbackEventDeduper } from '../services/openclaw-callback-deduper';

const contentRecord = {
  id: 'content-001',
  title: '测试标题',
  status: 'PENDING',
  relativePath: 'inbox/content-001',
};

const approveResult = {
  content: { ...contentRecord, status: 'APPROVED' },
  plan: {
    id: 'plan-001',
    title: '测试标题',
    platform: 'xiaohongshu',
    accountId: 'account-001',
    status: 'PENDING',
  },
};

const publishLogRecord = {
  id: 'publish-log-001',
  contentId: 'content-001',
  accountId: 'account-001',
  platform: 'xiaohongshu',
  status: 'QUEUED',
};

const contentFindUniqueMock = mock(async () => contentRecord);
const accountFindUniqueMock = mock(async () => null);
const accountUpdateMock = mock(async () => null);
const publishLogCreateMock = mock(async () => publishLogRecord);
const publishLogUpdateMock = mock(async (_args: unknown) => publishLogRecord);
const contentUpdateMock = mock(async (_args: unknown) => ({
  ...contentRecord,
  status: 'PUBLISHED',
}));
const publishLogFindUniqueMock = mock(async () => publishLogRecord);
const publishLogFindFirstMock = mock(async () => null);
const publishLogFindManyMock = mock(async () => []);
const moveToPublishedMock = mock(async () => undefined);
const enqueuePublishMock = mock(async () => ({ jobId: 'job-001', taskId: 'task-001' }));

mock.module('../config/prisma', () => ({
  prisma: {
    content: { findUnique: contentFindUniqueMock, update: contentUpdateMock },
    account: { findUnique: accountFindUniqueMock, update: accountUpdateMock },
    publishLog: {
      create: publishLogCreateMock,
      update: publishLogUpdateMock,
      findUnique: publishLogFindUniqueMock,
      findFirst: publishLogFindFirstMock,
      findMany: publishLogFindManyMock,
    },
  },
}));

mock.module('../services/queue-client', () => ({
  enqueuePublish: enqueuePublishMock,
}));

mock.module('../services/content.service', () => ({
  getContentById: contentFindUniqueMock,
  moveToPublished: moveToPublishedMock,
  approveContent: mock(async () => approveResult),
  getContents: mock(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
  rejectContent: mock(async () => contentRecord),
  scanInbox: mock(async () => undefined),
}));

describe('simulated publish flow', () => {
  let setupContentsRoutes: typeof import('./contents').setupContentsRoutes;
  let setupWebhookRoutes: typeof import('./webhook').setupWebhookRoutes;

  beforeAll(async () => {
    ({ setupContentsRoutes } = await import('./contents'));
    ({ setupWebhookRoutes } = await import('./webhook'));
  });

  beforeEach(() => {
    contentFindUniqueMock.mockClear();
    accountFindUniqueMock.mockClear();
    accountUpdateMock.mockClear();
    publishLogCreateMock.mockClear();
    publishLogUpdateMock.mockClear();
    publishLogFindUniqueMock.mockClear();
    publishLogFindFirstMock.mockClear();
    publishLogFindManyMock.mockClear();
    contentUpdateMock.mockClear();
    moveToPublishedMock.mockClear();
    enqueuePublishMock.mockClear();
  });

  it('queues approved content and applies a success webhook callback', async () => {
    const app = new Elysia().use(setupContentsRoutes()).use(
      setupWebhookRoutes({
        mediaActionsService: {
          getDefinitions: () => [],
          submit: mock(async () => {
            throw new Error('not used');
          }),
          getAction: mock(async () => null),
          listRecent: mock(async () => []),
          updateStatus: mock(async () => {
            throw new Error('not used');
          }),
          handleCallback: mock(async () => {
            throw new Error('not used');
          }),
        },
        gatewayCallbackToken: 'gateway-callback-token',
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore: createInMemoryAccountCheckLoginCallbackStore(),
      })
    );

    const approveRes = await app.handle(
      new Request('http://localhost/api/contents/content-001/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'xiaohongshu',
          accountId: 'account-001',
          reviewedBy: 'test',
        }),
      })
    );
    const approveData = await approveRes.json();

    expect(approveRes.status).toBe(200);
    expect(approveData.success).toBe(true);
    expect(approveData.data.content).toBeDefined();
    expect(approveData.data.plan).toBeDefined();
    expect(enqueuePublishMock).toHaveBeenCalledWith(
      'xiaohongshu',
      expect.objectContaining({
        contentId: 'content-001',
        accountId: 'account-001',
        platform: 'xiaohongshu',
        publishPlanId: 'plan-001',
        action: 'publish',
      })
    );

    const webhookRes = await app.handle(
      new Request('http://localhost/api/webhook/xhs/publish-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer gateway-callback-token',
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-flow-001',
          kind: 'publish',
          taskId: 'gateway-task-001',
          actionType: 'xiaohongshu.publish',
          status: 'success',
          refs: {
            publishLogId: 'publish-log-001',
            contentId: 'content-001',
            accountId: 'account-001',
          },
          result: { url: 'https://www.xiaohongshu.com/explore/test-note' },
        }),
      })
    );
    const webhookData = await webhookRes.json();

    expect(webhookRes.status).toBe(200);
    expect(webhookData.success).toBe(true);
    expect(publishLogUpdateMock).toHaveBeenCalledWith({
      where: { id: 'publish-log-001' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        externalTaskId: 'gateway-task-001',
        publishedUrl: 'https://www.xiaohongshu.com/explore/test-note',
      }),
    });
    expect(contentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'content-001' },
      data: { status: 'PUBLISHED', publishCount: { increment: 1 } },
    });
    expect(moveToPublishedMock).toHaveBeenCalledWith('content-001');
  });
});
