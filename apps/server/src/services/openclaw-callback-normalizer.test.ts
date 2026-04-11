import { describe, expect, it } from 'bun:test';
import { normalizeOpenClawCallback } from './openclaw-callback-normalizer';

describe('openclaw-callback-normalizer', () => {
  it('normalizes legacy publish callbacks into the unified envelope', () => {
    const normalized = normalizeOpenClawCallback(
      {
        taskId: 'gw-task-001',
        contentId: 'content-001',
        accountId: 'account-001',
        platform: 'xiaohongshu',
        status: 'success',
        publishedId: 'note-123',
        url: 'https://www.xiaohongshu.com/explore/123',
        timestamp: '2026-04-11T10:00:00.000Z',
      },
      {
        kind: 'publish',
        platform: 'xhs',
      }
    );

    expect(normalized).toEqual({
      version: '1.0',
      eventId: 'publish:gw-task-001:success:2026-04-11T10:00:00.000Z',
      taskId: 'gw-task-001',
      source: 'gateway',
      kind: 'publish',
      actionType: 'xiaohongshu.publish',
      status: 'success',
      refs: {
        publishLogId: null,
        contentId: 'content-001',
        accountId: 'account-001',
      },
      target: {
        platform: 'xiaohongshu',
        channel: null,
      },
      result: {
        externalId: 'note-123',
        url: 'https://www.xiaohongshu.com/explore/123',
        summary: 'Publish callback succeeded',
        extra: null,
      },
      error: null,
      timestamp: '2026-04-11T10:00:00.000Z',
    });
  });

  it('normalizes legacy media-action callbacks into the unified envelope', () => {
    const normalized = normalizeOpenClawCallback(
      {
        jobId: 'media-job-001',
        taskId: 'gw-task-002',
        status: 'success',
        result: {
          posted: true,
        },
      },
      {
        kind: 'media-action',
        actionType: 'wx-work-post',
      }
    );

    expect(normalized.version).toBe('1.0');
    expect(normalized.kind).toBe('media-action');
    expect(normalized.actionType).toBe('wx-work-post');
    expect(normalized.refs?.mediaActionId).toBe('media-job-001');
    expect(normalized.result?.extra).toEqual({ posted: true });
  });

  it('passes through the new unified envelope format', () => {
    const normalized = normalizeOpenClawCallback(
      {
        version: '1.0',
        eventId: 'evt-001',
        taskId: 'gw-task-003',
        source: 'openclaw',
        kind: 'media-action',
        actionType: 'image-to-image',
        status: 'success',
        refs: {
          mediaActionId: 'media-job-002',
        },
        target: {
          platform: 'openclaw',
        },
        result: {
          summary: '生成 2 张图片',
          artifacts: [
            {
              kind: 'image',
              role: 'generated',
              path: '/mnt/dapai-s/result-1.png',
            },
          ],
          extra: {
            outputDir: '/mnt/dapai-s',
          },
        },
        timestamp: '2026-04-11T11:00:00.000Z',
      },
      {
        kind: 'media-action',
        actionType: 'image-to-image',
      }
    );

    expect(normalized.eventId).toBe('evt-001');
    expect(normalized.source).toBe('openclaw');
    expect(normalized.result?.summary).toBe('生成 2 张图片');
    expect(normalized.result?.artifacts?.[0]?.path).toBe('/mnt/dapai-s/result-1.png');
  });

  it('builds a stable fallback eventId for legacy callbacks without timestamp', () => {
    const first = normalizeOpenClawCallback(
      {
        taskId: 'gw-task-no-ts',
        contentId: 'content-no-ts',
        accountId: 'account-no-ts',
        platform: 'wechat',
        status: 'failed',
        error: 'network error',
      },
      {
        kind: 'publish',
        platform: 'wechat',
      }
    );

    const second = normalizeOpenClawCallback(
      {
        taskId: 'gw-task-no-ts',
        contentId: 'content-no-ts',
        accountId: 'account-no-ts',
        platform: 'wechat',
        status: 'failed',
        error: 'network error',
      },
      {
        kind: 'publish',
        platform: 'wechat',
      }
    );

    expect(first.eventId).toBe('publish:gw-task-no-ts:failed:no-timestamp');
    expect(second.eventId).toBe(first.eventId);
  });

  it('normalizes legacy check-login callbacks into the unified envelope', () => {
    const normalized = normalizeOpenClawCallback(
      {
        taskId: 'check-task-001',
        platform: 'xiaohongshu',
        accountId: 'account-001',
        success: true,
        loggedIn: false,
        username: '测试账号',
        qrcodeUrl: 'https://example.com/qrcode.png',
        checkedAt: '2026-04-11T12:30:00.000Z',
      },
      {
        kind: 'account',
        platform: 'xhs',
      }
    );

    expect(normalized).toEqual({
      version: '1.0',
      eventId: 'account:check-task-001:needs-auth:2026-04-11T12:30:00.000Z',
      taskId: 'check-task-001',
      source: 'gateway',
      kind: 'account',
      actionType: 'xiaohongshu.check-login',
      status: 'needs-auth',
      refs: {
        accountId: 'account-001',
      },
      target: {
        platform: 'xiaohongshu',
        channel: null,
      },
      result: {
        externalId: null,
        url: 'https://example.com/qrcode.png',
        summary: 'Check-login requires authentication',
        extra: {
          success: true,
          loggedIn: false,
          username: '测试账号',
          qrcodeUrl: 'https://example.com/qrcode.png',
        },
      },
      error: null,
      timestamp: '2026-04-11T12:30:00.000Z',
    });
  });
});
