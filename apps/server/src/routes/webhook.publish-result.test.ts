import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import {
  type AccountCheckLoginCallbackStore,
  createInMemoryAccountCheckLoginCallbackStore,
} from '../services/account-check-login-callbacks.service';
import { createInMemoryOpenClawCallbackEventDeduper } from '../services/openclaw-callback-deduper';

const publishLogFindUniqueMock = mock(async () => null);
const publishLogFindFirstMock = mock(async () => null);
const publishLogFindManyMock = mock(async () => []);
const publishLogUpdateMock = mock(async () => ({}));
const contentUpdateMock = mock(async () => ({}));
const accountUpdateMock = mock(async () => ({}));
const moveToPublishedMock = mock(async () => undefined);

mock.module('../config/prisma', () => ({
  prisma: {
    publishLog: {
      findUnique: publishLogFindUniqueMock,
      findFirst: publishLogFindFirstMock,
      findMany: publishLogFindManyMock,
      update: publishLogUpdateMock,
    },
    content: {
      update: contentUpdateMock,
    },
    account: {
      update: accountUpdateMock,
    },
  },
}));

mock.module('../services/content.service', () => ({
  moveToPublished: moveToPublishedMock,
}));

describe('publish result webhook routes', () => {
  let setupWebhookRoutes: typeof import('./webhook').setupWebhookRoutes;
  let addPendingCheckLoginCallback: typeof import('./webhook').addPendingCheckLoginCallback;
  let callbackToken = '';
  let accountCheckLoginCallbackStore: AccountCheckLoginCallbackStore;

  function createStubActionService() {
    return {
      getDefinitions: () => [],
      submit: mock(async () => {
        throw new Error('not implemented');
      }),
      getAction: mock(async () => null),
      listRecent: mock(async () => []),
      updateStatus: mock(async () => {
        throw new Error('not implemented');
      }),
      handleCallback: mock(async () => {
        throw new Error('not implemented');
      }),
    };
  }

  beforeAll(async () => {
    process.env.CPP_FROM_GATEWAY_TOKEN = 'gateway-callback-token';
    ({ setupWebhookRoutes, addPendingCheckLoginCallback } = await import('./webhook'));
    ({
      gatewayConfig: { fromGatewayToken: callbackToken },
    } = await import('../config/gateway'));
  });

  beforeEach(() => {
    accountCheckLoginCallbackStore = createInMemoryAccountCheckLoginCallbackStore();
    publishLogFindUniqueMock.mockClear();
    publishLogFindFirstMock.mockClear();
    publishLogFindManyMock.mockClear();
    publishLogUpdateMock.mockClear();
    contentUpdateMock.mockClear();
    accountUpdateMock.mockClear();
    moveToPublishedMock.mockClear();
  });

  it('accepts the unified envelope and resolves publish logs from refs.publishLogId', async () => {
    publishLogFindUniqueMock.mockImplementationOnce(async () => ({
      id: 'plog-001',
      contentId: 'content-001',
      accountId: 'account-001',
      platform: 'xiaohongshu',
    }));

    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const res = await app.handle(
      new Request('http://localhost/api/webhook/xhs/publish-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-001',
          taskId: 'gw-task-001',
          source: 'gateway',
          kind: 'publish',
          actionType: 'xiaohongshu.publish',
          status: 'success',
          refs: {
            publishLogId: 'plog-001',
            contentId: 'content-001',
            accountId: 'account-001',
          },
          target: {
            platform: 'xiaohongshu',
          },
          result: {
            externalId: 'note-123',
            url: 'https://www.xiaohongshu.com/explore/123',
          },
          timestamp: '2026-04-11T12:00:00.000Z',
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(publishLogFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'plog-001' },
    });
    expect(publishLogUpdateMock).toHaveBeenCalledWith({
      where: { id: 'plog-001' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        externalTaskId: 'gw-task-001',
        publishedUrl: 'https://www.xiaohongshu.com/explore/123',
        callbackPayload: expect.objectContaining({
          raw: expect.objectContaining({
            eventId: 'evt-001',
          }),
          normalized: expect.objectContaining({
            eventId: 'evt-001',
          }),
        }),
      }),
    });
    expect(contentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'content-001' },
      data: {
        status: 'PUBLISHED',
        publishCount: { increment: 1 },
      },
    });
    expect(moveToPublishedMock).toHaveBeenCalledWith('content-001', 'xiaohongshu');
  });

  it('continues to support legacy publish callbacks via contentId + accountId fallback', async () => {
    publishLogFindManyMock.mockImplementationOnce(async () => [
      {
        id: 'plog-002',
        contentId: 'content-002',
        accountId: 'account-002',
        platform: 'wechat',
      },
    ]);

    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const res = await app.handle(
      new Request('http://localhost/api/webhook/wechat/publish-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          taskId: 'gw-task-002',
          contentId: 'content-002',
          accountId: 'account-002',
          platform: 'wechat',
          status: 'needs-auth',
          error: 'need login',
          timestamp: '2026-04-11T12:10:00.000Z',
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(publishLogFindManyMock).toHaveBeenCalledWith({
      where: {
        contentId: 'content-002',
        accountId: 'account-002',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(publishLogUpdateMock).toHaveBeenCalledWith({
      where: { id: 'plog-002' },
      data: expect.objectContaining({
        status: 'NEEDS_AUTH',
        externalTaskId: 'gw-task-002',
        errorMessage: 'need login',
        callbackPayload: expect.objectContaining({
          raw: expect.objectContaining({
            taskId: 'gw-task-002',
          }),
          normalized: expect.objectContaining({
            taskId: 'gw-task-002',
          }),
        }),
      }),
    });
    expect(contentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'content-002' },
      data: {
        status: 'FAILED',
      },
    });
  });

  it('can resolve publish logs from externalTaskId when refs are absent', async () => {
    publishLogFindFirstMock.mockImplementationOnce(async () => ({
      id: 'plog-004',
      contentId: 'content-004',
      accountId: 'account-004',
      platform: 'xiaohongshu',
    }));

    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const res = await app.handle(
      new Request('http://localhost/api/webhook/xhs/publish-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-004',
          taskId: 'gw-task-004',
          source: 'gateway',
          kind: 'publish',
          actionType: 'xiaohongshu.publish',
          status: 'running',
          timestamp: '2026-04-11T12:15:00.000Z',
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(publishLogFindFirstMock).toHaveBeenCalledWith({
      where: {
        externalTaskId: 'gw-task-004',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(publishLogUpdateMock).toHaveBeenCalledWith({
      where: { id: 'plog-004' },
      data: expect.objectContaining({
        status: 'RUNNING',
        externalTaskId: 'gw-task-004',
      }),
    });
  });

  it('ignores duplicate publish callback events after the first successful processing', async () => {
    publishLogFindUniqueMock.mockImplementation(async () => ({
      id: 'plog-003',
      contentId: 'content-003',
      accountId: 'account-003',
      platform: 'xiaohongshu',
    }));

    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const request = () =>
      new Request('http://localhost/api/webhook/xhs/publish-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-dup-001',
          taskId: 'gw-task-003',
          source: 'gateway',
          kind: 'publish',
          actionType: 'xiaohongshu.publish',
          status: 'success',
          refs: {
            publishLogId: 'plog-003',
            contentId: 'content-003',
            accountId: 'account-003',
          },
          result: {
            url: 'https://www.xiaohongshu.com/explore/dup',
          },
          timestamp: '2026-04-11T12:20:00.000Z',
        }),
      });

    const firstRes = await app.handle(request());
    const secondRes = await app.handle(request());
    const secondData = await secondRes.json();

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondData).toEqual({
      success: true,
      duplicate: true,
    });
    expect(publishLogUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('resolves pending check-login callbacks from the unified envelope', async () => {
    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const pending = addPendingCheckLoginCallback('check-task-001', 3000);

    const res = await app.handle(
      new Request('http://localhost/api/webhook/xhs/check-login-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-check-001',
          taskId: 'check-task-001',
          source: 'gateway',
          kind: 'account',
          actionType: 'xiaohongshu.check-login',
          status: 'success',
          refs: {
            accountId: 'account-check-001',
          },
          result: {
            summary: '已登录',
            extra: {
              success: true,
              loggedIn: true,
              username: '测试账号',
            },
          },
          timestamp: '2026-04-11T12:40:00.000Z',
        }),
      })
    );
    const data = await res.json();
    const pendingResult = await pending;
    const storedSnapshot = await accountCheckLoginCallbackStore.get('account-check-001');

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(pendingResult).toEqual({
      success: true,
      loggedIn: true,
      username: '测试账号',
      error: undefined,
      qrcodeUrl: undefined,
    });
    expect(storedSnapshot?.callbackPayload.raw).toEqual(
      expect.objectContaining({
        eventId: 'evt-check-001',
      })
    );
    expect(accountUpdateMock).not.toHaveBeenCalled();
  });

  it('continues to support legacy check-login callbacks and updates account status', async () => {
    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const res = await app.handle(
      new Request('http://localhost/api/webhook/xhs/check-login-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          taskId: 'check-task-002',
          platform: 'xiaohongshu',
          accountId: 'account-check-002',
          success: true,
          loggedIn: false,
          username: '测试账号2',
          qrcodeUrl: 'https://example.com/qrcode-2.png',
          checkedAt: '2026-04-11T12:41:00.000Z',
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(accountUpdateMock).toHaveBeenCalledWith({
      where: { id: 'account-check-002' },
      data: {
        loginStatus: 'EXPIRED',
      },
    });
  });

  it('ignores duplicate check-login callback events after the first successful processing', async () => {
    const app = new Elysia().use(
      setupWebhookRoutes({
        mediaActionsService: createStubActionService(),
        callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
        accountCheckLoginCallbackStore,
      })
    );

    const request = () =>
      new Request('http://localhost/api/webhook/xhs/check-login-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-check-dup-001',
          taskId: 'check-task-dup-001',
          source: 'gateway',
          kind: 'account',
          actionType: 'xiaohongshu.check-login',
          status: 'needs-auth',
          refs: {
            accountId: 'account-check-dup-001',
          },
          result: {
            url: 'https://example.com/qrcode-dup.png',
            extra: {
              success: true,
              loggedIn: false,
              qrcodeUrl: 'https://example.com/qrcode-dup.png',
            },
          },
          timestamp: '2026-04-11T12:42:00.000Z',
        }),
      });

    const firstRes = await app.handle(request());
    const secondRes = await app.handle(request());
    const secondData = await secondRes.json();

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondData).toEqual({
      success: true,
      duplicate: true,
    });
    expect(accountUpdateMock).toHaveBeenCalledTimes(1);
  });
});
