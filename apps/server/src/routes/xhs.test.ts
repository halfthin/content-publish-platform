import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import type { PublishJobData } from '../queues/publish-queue';
import { setupXhsRoutes } from './xhs';

const addJobMock = mock(async (jobData: PublishJobData) => ({ id: 'job-xhs-123', data: jobData }));

describe('xhs routes', () => {
  beforeEach(() => {
    addJobMock.mockClear();
  });

  function createApp() {
    return new Elysia().use(
      setupXhsRoutes({
        getQueue: () => ({ addJob: addJobMock }),
      })
    );
  }

  it('POST /api/xhs/publish forwards optional MCP publishing fields to the queue', async () => {
    const app = createApp();

    const res = await app.handle(
      new Request('http://localhost/api/xhs/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'account-1',
          accountName: 'xhs-1',
          title: '标题',
          content: '正文',
          images: ['/data/1.png'],
          tags: ['tag1'],
          scheduleAt: '2026-05-15T10:00:00.000Z',
          visibility: 'public',
          isOriginal: true,
          products: [{ id: 'sku-1' }],
        }),
      })
    );

    const data = await res.json();
    const queuedJob = addJobMock.mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, data: { jobId: 'job-xhs-123', status: 'QUEUED' } });
    expect(queuedJob.accountName).toBe('xhs-1');
    expect(queuedJob.action).toBe('publish');
    expect(queuedJob.content).toEqual({
      title: '标题',
      description: '正文',
      images: ['/data/1.png'],
      tags: ['tag1'],
      scheduleAt: '2026-05-15T10:00:00.000Z',
      visibility: 'public',
      isOriginal: true,
      products: [{ id: 'sku-1' }],
    });
  });

  it('POST /api/xhs/publish/video forwards video action and visibility to the queue', async () => {
    const app = createApp();

    const res = await app.handle(
      new Request('http://localhost/api/xhs/publish/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'account-1',
          accountName: 'xhs-1',
          title: '视频标题',
          content: '视频正文',
          video: '/data/video.mp4',
          tags: ['video'],
          visibility: 'private',
          products: [{ id: 'sku-video' }],
        }),
      })
    );

    const data = await res.json();
    const queuedJob = addJobMock.mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, data: { jobId: 'job-xhs-123', status: 'QUEUED' } });
    expect(queuedJob.accountName).toBe('xhs-1');
    expect(queuedJob.action).toBe('publish_video');
    expect(queuedJob.content).toEqual({
      title: '视频标题',
      description: '视频正文',
      video: '/data/video.mp4',
      tags: ['video'],
      visibility: 'private',
      products: [{ id: 'sku-video' }],
    });
  });
});
