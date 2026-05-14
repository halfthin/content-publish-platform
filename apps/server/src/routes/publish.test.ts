import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import type { PublishJobData } from '../queues/publish-queue';
import { setupPublishRoutes } from './publish';

const addJobMock = mock(async (jobData: PublishJobData) => ({ id: 'job-123', data: jobData }));
const getJobStateMock = mock(async () => 'waiting');

describe('generic publish routes', () => {
  beforeEach(() => {
    addJobMock.mockClear();
    getJobStateMock.mockClear();
  });

  it('POST /api/publish forwards Publisher routing and XHS MCP payload fields to the queue', async () => {
    const app = new Elysia().use(
      setupPublishRoutes({
        getQueue: () => ({ addJob: addJobMock, getJobState: getJobStateMock }),
      })
    );

    const res = await app.handle(
      new Request('http://localhost/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'xiaohongshu',
          accountId: 'account-1',
          accountName: 'xhs-1',
          action: 'publish',
          payload: {
            title: '标题',
            description: '正文',
            images: ['/data/1.png'],
            tags: ['tag1'],
            scheduleAt: '2026-05-15T10:00:00.000Z',
            visibility: 'public',
            isOriginal: true,
            products: [{ id: 'sku-1' }],
          },
        }),
      })
    );

    const data = await res.json();
    const queuedJob = addJobMock.mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, data: { jobId: 'job-123', status: 'QUEUED' } });
    expect(queuedJob.platform).toBe('xiaohongshu');
    expect(queuedJob.accountId).toBe('account-1');
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
});
