import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { PublishQueue } from './publish-queue';

const describeIfIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

// Mock publishers
const mockXiaohongshuPublisher = {
  initialize: mock(() => Promise.resolve()),
  loadCookies: mock(() => Promise.resolve(true)),
  checkLoginStatus: mock(() => Promise.resolve(true)),
  publish: mock(() =>
    Promise.resolve({
      success: true,
      publishedUrl: 'https://www.xiaohongshu.com/explore/1234567890',
    })
  ),
  saveCookies: mock(() => Promise.resolve('encrypted-cookie-data')),
  close: mock(() => Promise.resolve()),
};

const mockWeiboPublisher = {
  initialize: mock(() => Promise.resolve()),
  loadCookies: mock(() => Promise.resolve(true)),
  checkLoginStatus: mock(() => Promise.resolve(true)),
  publish: mock(() =>
    Promise.resolve({
      success: true,
      publishedUrl: 'https://weibo.com/1234567890',
    })
  ),
  saveCookies: mock(() => Promise.resolve('encrypted-cookie-data')),
  close: mock(() => Promise.resolve()),
};

// Mock the modules
mock.module('../publishers/xiaohongshu', () => ({
  XiaohongshuPublisher: mock(() => mockXiaohongshuPublisher),
}));

mock.module('../publishers/weibo', () => ({
  WeiboPublisher: mock(() => mockWeiboPublisher),
}));

describeIfIntegration('PublishQueue', () => {
  let publishQueue: PublishQueue;

  beforeEach(() => {
    // Reset mocks
    mockXiaohongshuPublisher.initialize.mockClear();
    mockXiaohongshuPublisher.loadCookies.mockClear();
    mockXiaohongshuPublisher.checkLoginStatus.mockClear();
    mockXiaohongshuPublisher.publish.mockClear();
    mockXiaohongshuPublisher.saveCookies.mockClear();
    mockXiaohongshuPublisher.close.mockClear();

    mockWeiboPublisher.initialize.mockClear();
    mockWeiboPublisher.loadCookies.mockClear();
    mockWeiboPublisher.checkLoginStatus.mockClear();
    mockWeiboPublisher.publish.mockClear();
    mockWeiboPublisher.saveCookies.mockClear();
    mockWeiboPublisher.close.mockClear();

    // Get singleton instance
    publishQueue = PublishQueue.getInstance();
  });

  afterEach(async () => {
    // Clean up
    await publishQueue.close();
  });

  describe('Singleton pattern', () => {
    test('should return same instance', () => {
      const instance1 = PublishQueue.getInstance();
      const instance2 = PublishQueue.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Queue initialization', () => {
    test('should initialize with default options', () => {
      expect(publishQueue).toBeDefined();
      expect(publishQueue).toHaveProperty('queue');
      expect(publishQueue).toHaveProperty('workers');
    });

    test('should have correct queue name', () => {
      expect((publishQueue as unknown as { queue: { name: string } }).queue.name).toBe(
        'publish-jobs'
      );
    });
  });

  describe('Job processing', () => {
    test('should add job to queue', async () => {
      const jobData = {
        contentId: 'test-content-123',
        accountId: 'test-account-456',
        platform: 'xiaohongshu' as const,
        content: {
          title: 'Test Title',
          description: 'Test Description',
          images: ['image1.jpg', 'image2.jpg'],
          tags: ['test', '小红书'],
        },
      };

      const job = await publishQueue.addJob(jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    test('should handle different platforms', async () => {
      const xiaohongshuJob = await publishQueue.addJob({
        contentId: 'content-1',
        accountId: 'account-1',
        platform: 'xiaohongshu',
        content: {
          title: '小红书测试',
          description: '测试内容',
          images: ['test.jpg'],
          tags: ['test'],
        },
      });

      const weiboJob = await publishQueue.addJob({
        contentId: 'content-2',
        accountId: 'account-2',
        platform: 'weibo',
        content: {
          title: '微博测试',
          description: '测试内容',
          images: ['test.jpg'],
          tags: ['test'],
        },
      });

      expect(xiaohongshuJob.data.platform).toBe('xiaohongshu');
      expect(weiboJob.data.platform).toBe('weibo');
    });
  });

  describe('Error handling', () => {
    test('should handle invalid platform', async () => {
      const invalidJobData = {
        contentId: 'test-content',
        accountId: 'test-account',
        platform: 'invalid_platform',
        content: {
          title: 'Test',
          description: 'Test',
          images: [],
          tags: [],
        },
      };

      try {
        await publishQueue.addJob(invalidJobData as never);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle missing required fields', async () => {
      const incompleteJobData = {
        contentId: 'test-content',
        // Missing accountId
        platform: 'xiaohongshu' as const,
        content: {
          title: 'Test',
          description: 'Test',
          images: [],
          tags: [],
        },
      };

      try {
        await publishQueue.addJob(incompleteJobData as never);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Job status tracking', () => {
    test('should get job status', async () => {
      const jobData = {
        contentId: 'status-test',
        accountId: 'status-account',
        platform: 'xiaohongshu' as const,
        content: {
          title: 'Status Test',
          description: 'Testing status',
          images: [],
          tags: [],
        },
      };

      const job = await publishQueue.addJob(jobData);
      const status = await publishQueue.getJobState(String(job.id));

      expect(status).toBeDefined();
      expect(['waiting', 'active', 'completed', 'failed']).toContain(status);
    });

    test('should return null for non-existent job', async () => {
      const status = await publishQueue.getJobState('non-existent-job-id');
      expect(status).toBeNull();
    });
  });

  describe('Queue statistics', () => {
    test('should get queue stats', async () => {
      const stats = await publishQueue.getStats();

      expect(stats).toBeDefined();
      expect(stats.waiting).toBeGreaterThanOrEqual(0);
      expect(stats.active).toBeGreaterThanOrEqual(0);
      expect(stats.completed).toBeGreaterThanOrEqual(0);
      expect(stats.failed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cleanup', () => {
    test('should close queue and worker', async () => {
      await publishQueue.close();

      // Verify queue is closed
      expect((publishQueue as unknown as { queue: { closed: boolean } }).queue.closed).toBe(true);
      const workers = (publishQueue as unknown as { workers: Map<string, { closed: boolean }> })
        .workers;
      expect(Array.from(workers.values()).every((worker) => worker.closed)).toBe(true);
    });
  });
});
