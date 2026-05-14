import { describe, expect, it } from 'bun:test';
import { toXhsMcpPublishPayload } from './publish-queue';

describe('XHS MCP publish queue payload mapping', () => {
  it('uses queued accountName/action and forwards optional publishing fields to the Publisher payload', () => {
    const payload = toXhsMcpPublishPayload({
      jobId: 'job-1',
      accountId: 'account-1',
      accountName: 'xhs-1',
      action: 'publish',
      content: {
        title: '标题',
        description: '正文',
        images: ['/data/1.png'],
        tags: ['tag1'],
        scheduleAt: '2026-05-15T10:00:00.000Z',
        visibility: 'public',
        isOriginal: true,
        products: [{ id: 'sku-1' }],
      },
    });

    expect(payload.accountName).toBe('xhs-1');
    expect(payload.action).toBe('publish');
    expect(payload.payload).toEqual({
      title: '标题',
      content: '正文',
      images: ['/data/1.png'],
      video: undefined,
      tags: ['tag1'],
      scheduleAt: '2026-05-15T10:00:00.000Z',
      visibility: 'public',
      isOriginal: true,
      products: [{ id: 'sku-1' }],
    });
  });

  it('defaults the action to publish_video when content includes video', () => {
    const payload = toXhsMcpPublishPayload({
      jobId: 'job-2',
      accountId: 'account-1',
      accountName: 'xhs-1',
      content: {
        title: '视频标题',
        description: '视频正文',
        video: '/data/video.mp4',
        tags: ['video'],
        visibility: 'private',
        products: [{ id: 'sku-video' }],
      },
    });

    expect(payload.action).toBe('publish_video');
    expect(payload.payload).toMatchObject({
      title: '视频标题',
      content: '视频正文',
      video: '/data/video.mp4',
      tags: ['video'],
      visibility: 'private',
      products: [{ id: 'sku-video' }],
    });
  });
});
