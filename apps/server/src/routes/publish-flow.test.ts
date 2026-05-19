import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { createInMemoryAccountCheckLoginCallbackStore } from '../services/account-check-login-callbacks.service';
import { createInMemoryOpenClawCallbackEventDeduper } from '../services/openclaw-callback-deduper';

const contentRecord = {
  id: 'content-001',
  title: '测试标题',
  description: '测试正文',
  type: 'IMAGE',
  status: 'APPROVED',
  basePath: '/tmp/content/approved/content-001',
  images: ['/tmp/content/approved/content-001/1.png'],
  video: null,
  tags: ['测试'],
};

const accountRecord = {
  id: 'account-001',
  name: 'xhs-1',
  platform: 'xiaohongshu',
  status: 'ACTIVE',
  encryptedCookies: 'encrypted-cookies',
};

const publishLogRecord = {
  id: 'publish-log-001',
  contentId: 'content-001',
  accountId: 'account-001',
  platform: 'xiaohongshu',
  status: 'QUEUED',
};

const contentFindUniqueMock = mock(async () => contentRecord);
const accountFindUniqueMock = mock(async () => accountRecord);
const publishLogCreateMock = mock(async () => publishLogRecord);
const publishLogUpdateMock = mock(async (_args: unknown) => publishLogRecord);
const contentUpdateMock = mock(async (_args: unknown) => ({
  ...contentRecord,
  status: 'PUBLISHED',
}));
const publishLogFindUniqueMock = mock(async () => publishLogRecord);
const publishLogFindFirstMock = mock(async () => null);
const publishLogFindManyMock = mock(async () => []);
const addPublishJobMock = mock(async () => ({ id: 'job-001' }));
const moveToPublishedMock = mock(async () => undefined);

mock.module('../config/prisma', () => ({
  prisma: {
    content: { findUnique: contentFindUniqueMock, update: contentUpdateMock },
    account: { findUnique: accountFindUniqueMock },
    publishLog: {
      create: publishLogCreateMock,
      update: publishLogUpdateMock,
      findUnique: publishLogFindUniqueMock,
      findFirst: publishLogFindFirstMock,
      findMany: publishLogFindManyMock,
    },
  },
}));

mock.module('../queues/publish-queue', () => ({
  addPublishJob: addPublishJobMock,
}));

mock.module('../services/content.service', () => ({
  getContentById: contentFindUniqueMock,
  moveToPublished: moveToPublishedMock,
  approveContent: mock(async () => contentRecord),
  getContents: mock(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
  moveToApproved: mock(async () => undefined),
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
    publishLogCreateMock.mockClear();
    publishLogUpdateMock.mockClear();
    publishLogFindUniqueMock.mockClear();
    publishLogFindFirstMock.mockClear();
    publishLogFindManyMock.mockClear();
    contentUpdateMock.mockClear();
    addPublishJobMock.mockClear();
    moveToPublishedMock.mockClear();
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

    const publishRes = await app.handle(
      new Request('http://localhost/api/contents/content-001/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'xiaohongshu', accountId: 'account-001' }),
      })
    );
    const publishData = await publishRes.json();

    expect(publishRes.status).toBe(200);
    expect(publishData.success).toBe(true);
    expect(publishLogCreateMock).toHaveBeenCalled();
    expect(addPublishJobMock).toHaveBeenCalled();
    expect(contentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'content-001' },
      data: { status: 'PUBLISHING' },
    });

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
    expect(moveToPublishedMock).toHaveBeenCalledWith('content-001', 'xiaohongshu');
  });
});
