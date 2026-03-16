import { type Job, Queue, Worker } from 'bullmq';
import { createClient } from 'ioredis';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import { DouyinPublisher } from '../publishers/douyin';
import { WeiboPublisher } from '../publishers/weibo';
import { XiaohongshuPublisher } from '../publishers/xiaohongshu';

const logger = createLogger('publish-queue');

export interface PublishJobData {
  contentId: string;
  accountId: string;
  platform: 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat';
  content: {
    title: string;
    description?: string;
    images?: string[];
    video?: string;
    tags?: string[];
  };
  scheduledAt?: number;
  retryCount?: number;
}

export interface PublishJobResult {
  success: boolean;
  publishedUrl?: string;
  error?: string;
  errorCode?: string;
}

// 类型别名，方便发布器使用
export type PublishJob = Job<PublishJobData, PublishJobResult>;

const QUEUE_NAME = 'publish-jobs';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

/**
 * 发布队列管理类
 */
export class PublishQueue {
  private static instance: PublishQueue;
  private queue: Queue<PublishJobData, PublishJobResult>;
  private workers: Map<string, Worker<PublishJobData, PublishJobResult>> = new Map();
  private redisClient: ReturnType<typeof createClient>;

  private constructor() {
    this.redisClient = createClient(REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<PublishJobData, PublishJobResult>(QUEUE_NAME, {
      connection: this.redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 1000,
        },
      },
    });

    logger.info('Publish queue initialized', { redis: REDIS_URL });
  }

  /**
   * 获取单例实例
   */
  static getInstance(): PublishQueue {
    if (!PublishQueue.instance) {
      PublishQueue.instance = new PublishQueue();
    }
    return PublishQueue.instance;
  }

  /**
   * 添加发布任务
   */
  async addJob(
    jobData: PublishJobData,
    options?: {
      delay?: number;
      jobId?: string;
    }
  ): Promise<Job<PublishJobData, PublishJobResult, string>> {
    const job = await this.queue.add(jobData.platform, jobData, {
      jobId: options?.jobId || `${jobData.contentId}-${jobData.accountId}`,
      delay: options?.delay || 0,
    });

    logger.info('Job added to queue', {
      jobId: job.id,
      platform: jobData.platform,
      contentId: jobData.contentId,
      accountId: jobData.accountId,
    });

    return job;
  }

  /**
   * 启动 Worker
   */
  startWorker(
    platform: string,
    processor: (job: Job<PublishJobData, PublishJobResult>) => Promise<PublishJobResult>
  ): void {
    if (this.workers.has(platform)) {
      logger.warn('Worker already exists', { platform });
      return;
    }

    const worker = new Worker<PublishJobData, PublishJobResult>(QUEUE_NAME, processor, {
      connection: this.redisClient,
      concurrency: 1, // 每个平台并发 1 个任务
    });

    // 任务完成
    worker.on('completed', (job, result) => {
      logger.info('Job completed', {
        jobId: job.id,
        platform,
        success: result.success,
      });
    });

    // 任务失败
    worker.on('failed', (job, error) => {
      logger.error('Job failed', {
        jobId: job?.id,
        platform,
        error: String(error),
      });
    });

    // 任务重试
    worker.on('retries', (job, error) => {
      logger.warn('Job retrying', {
        jobId: job?.id,
        platform,
        attempts: job?.attemptsMade,
        error: String(error),
      });
    });

    this.workers.set(platform, worker);
    logger.info('Worker started', { platform });
  }

  /**
   * 启动所有平台 Worker
   */
  startAllWorkers(): void {
    // 小红书 Worker
    this.startWorker('xiaohongshu', async (job) => {
      return this.processXiaohongshuJob(job);
    });

    // 微博 Worker
    this.startWorker('weibo', async (job) => {
      return this.processWeiboJob(job);
    });

    // 抖音 Worker
    this.startWorker('douyin', async (job) => {
      return this.processDouyinJob(job);
    });

    // 其他平台 Worker（待实现）
    // this.startWorker('bilibili', ...);
    // this.startWorker('wechat', ...);
  }

  /**
   * 更新账号的Cookie
   */
  private async updateAccountCookies(accountId: string, encryptedCookies: string): Promise<void> {
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          encryptedCookies,
          cookieUpdatedAt: new Date(),
        },
      });

      logger.info('Account cookies updated', { accountId });
    } catch (error) {
      logger.error('Failed to update account cookies', {
        accountId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * 处理小红书任务
   */
  private async processXiaohongshuJob(
    job: Job<PublishJobData, PublishJobResult>
  ): Promise<PublishJobResult> {
    logger.info('Processing Xiaohongshu job', {
      jobId: job.id,
      contentId: job.data.contentId,
      accountId: job.data.accountId,
    });

    const publisher = new XiaohongshuPublisher({
      accountId: job.data.accountId,
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      timeout: 120000,
    });

    let account: { encryptedCookies: string; cookiePassword: string | null } | null = null;

    try {
      // 1. 初始化浏览器
      await publisher.initialize();

      // 2. 从数据库获取账号的 Cookie
      account = await prisma.account.findUnique({
        where: { id: job.data.accountId },
        select: { encryptedCookies: true, cookiePassword: true },
      });

      if (!account?.encryptedCookies) {
        logger.error('No cookies found for account', { accountId: job.data.accountId });
        return {
          success: false,
          error: '账号未配置 Cookie，请先在 Cookie 配置页面设置',
          errorCode: 'NO_COOKIES',
        };
      }

      // 3. 加载 Cookie
      const password =
        account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
      const loaded = await publisher.loadCookies(account.encryptedCookies, password);

      if (!loaded) {
        logger.error('Failed to load cookies', { accountId: job.data.accountId });
        return {
          success: false,
          error: 'Cookie 加载失败，可能已过期',
          errorCode: 'COOKIE_LOAD_FAILED',
        };
      }

      // 4. 验证登录状态
      const isLoggedIn = await publisher.checkLoginStatus();
      if (!isLoggedIn) {
        logger.error('Account not logged in', { accountId: job.data.accountId });
        return {
          success: false,
          error: '账号未登录或 Cookie 已过期',
          errorCode: 'NOT_LOGGED_IN',
        };
      }

      // 5. 执行发布
      const result = await publisher.publish(job.data);

      // 6. 更新发布日志
      if (result.success) {
        await prisma.publishLog.updateMany({
          where: {
            contentId: job.data.contentId,
            accountId: job.data.accountId,
          },
          data: {
            status: 'SUCCESS',
            publishedUrl: result.publishedUrl,
            publishedAt: new Date(),
          },
        });

        // 更新内容状态
        await prisma.content.update({
          where: { id: job.data.contentId },
          data: {
            status: 'PUBLISHED',
            publishCount: { increment: 1 },
          },
        });
      } else {
        await prisma.publishLog.updateMany({
          where: {
            contentId: job.data.contentId,
            accountId: job.data.accountId,
          },
          data: {
            status: 'FAILED',
            errorMessage: result.error,
          },
        });
      }

      return result;
    } catch (error) {
      logger.error('Xiaohongshu job failed', {
        jobId: job.id,
        error: String(error),
      });

      // 更新发布日志
      await prisma.publishLog.updateMany({
        where: {
          contentId: job.data.contentId,
          accountId: job.data.accountId,
        },
        data: {
          status: 'FAILED',
          errorMessage: String(error),
        },
      });

      return {
        success: false,
        error: String(error),
        errorCode: 'PROCESSING_FAILED',
      };
    } finally {
      try {
        // 方案A: 发布后自动保存Cookie（被动更新）
        // 只有在发布器已初始化且有账号信息时才尝试保存Cookie
        if (publisher && account) {
          const password =
            account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';

          // 尝试保存当前浏览器上下文中的Cookie
          const newCookies = await publisher.saveCookies(password);

          if (newCookies) {
            // 更新数据库中的Cookie
            await this.updateAccountCookies(job.data.accountId, newCookies);

            logger.info('Cookies saved after publish', {
              accountId: job.data.accountId,
              jobId: job.id,
            });
          }
        }
      } catch (saveError) {
        // 保存Cookie失败不影响主要发布流程，只记录警告
        logger.warn('Failed to save cookies after publish', {
          accountId: job.data.accountId,
          error: String(saveError),
        });
      }

      // 关闭浏览器
      await publisher.close();
    }
  }

  /**
   * 处理微博任务
   */
  private async processWeiboJob(
    job: Job<PublishJobData, PublishJobResult>
  ): Promise<PublishJobResult> {
    logger.info('Processing Weibo job', {
      jobId: job.id,
      contentId: job.data.contentId,
      accountId: job.data.accountId,
    });

    const publisher = new WeiboPublisher({
      accountId: job.data.accountId,
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      timeout: 120000,
    });

    let account: { encryptedCookies: string; cookiePassword: string | null } | null = null;

    try {
      // 1. 初始化浏览器
      await publisher.initialize();

      // 2. 从数据库获取账号的 Cookie
      account = await prisma.account.findUnique({
        where: { id: job.data.accountId },
        select: { encryptedCookies: true, cookiePassword: true },
      });

      if (!account?.encryptedCookies) {
        logger.error('No cookies found for account', { accountId: job.data.accountId });
        return {
          success: false,
          error: '账号未配置 Cookie，请先在 Cookie 配置页面设置',
          errorCode: 'NO_COOKIES',
        };
      }

      // 3. 加载 Cookie
      const password =
        account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
      const loaded = await publisher.loadCookies(account.encryptedCookies, password);

      if (!loaded) {
        logger.error('Failed to load cookies', { accountId: job.data.accountId });
        return {
          success: false,
          error: 'Cookie 加载失败，可能已过期',
          errorCode: 'COOKIE_LOAD_FAILED',
        };
      }

      // 4. 执行发布
      const result = await publisher.publish(job.data);

      return result;
    } catch (error) {
      logger.error('Weibo job failed', {
        jobId: job.id,
        error: String(error),
      });

      return {
        success: false,
        error: String(error),
        errorCode: 'PROCESSING_FAILED',
      };
    } finally {
      try {
        // 方案A: 发布后自动保存Cookie（被动更新）
        if (publisher && account) {
          const password =
            account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';

          // 尝试保存当前浏览器上下文中的Cookie
          const newCookies = await publisher.saveCookies(password);

          if (newCookies) {
            // 更新数据库中的Cookie
            await this.updateAccountCookies(job.data.accountId, newCookies);

            logger.info('Cookies saved after Weibo publish', {
              accountId: job.data.accountId,
              jobId: job.id,
            });
          }
        }
      } catch (saveError) {
        // 保存Cookie失败不影响主要发布流程，只记录警告
        logger.warn('Failed to save cookies after Weibo publish', {
          accountId: job.data.accountId,
          error: String(saveError),
        });
      }

      // 关闭浏览器
      await publisher.close();
    }
  }

  /**
   * 处理抖音任务
   */
  private async processDouyinJob(
    job: Job<PublishJobData, PublishJobResult>
  ): Promise<PublishJobResult> {
    logger.info('Processing Douyin job', {
      jobId: job.id,
      contentId: job.data.contentId,
      accountId: job.data.accountId,
    });

    const publisher = new DouyinPublisher({
      accountId: job.data.accountId,
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      timeout: 180000, // 抖音视频发布耗时较长
    });

    let account: { encryptedCookies: string; cookiePassword: string | null } | null = null;

    try {
      // 1. 初始化浏览器
      await publisher.initialize();

      // 2. 从数据库获取账号的 Cookie
      account = await prisma.account.findUnique({
        where: { id: job.data.accountId },
        select: { encryptedCookies: true, cookiePassword: true },
      });

      if (!account?.encryptedCookies) {
        logger.error('No cookies found for account', { accountId: job.data.accountId });
        return {
          success: false,
          error: '账号未配置 Cookie，请先在 Cookie 配置页面设置',
          errorCode: 'NO_COOKIES',
        };
      }

      // 3. 加载 Cookie
      const password =
        account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
      const loaded = await publisher.loadCookies(account.encryptedCookies, password);

      if (!loaded) {
        logger.error('Failed to load cookies', { accountId: job.data.accountId });
        return {
          success: false,
          error: 'Cookie 加载失败，可能已过期',
          errorCode: 'COOKIE_LOAD_FAILED',
        };
      }

      // 4. 执行发布
      const result = await publisher.publish(job.data);

      return result;
    } catch (error) {
      logger.error('Douyin job failed', {
        jobId: job.id,
        error: String(error),
      });

      return {
        success: false,
        error: String(error),
        errorCode: 'PROCESSING_FAILED',
      };
    } finally {
      try {
        // 方案A: 发布后自动保存Cookie（被动更新）
        if (publisher && account) {
          const password =
            account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';

          // 尝试保存当前浏览器上下文中的Cookie
          const newCookies = await publisher.saveCookies(password);

          if (newCookies) {
            // 更新数据库中的Cookie
            await this.updateAccountCookies(job.data.accountId, newCookies);

            logger.info('Cookies saved after Douyin publish', {
              accountId: job.data.accountId,
              jobId: job.id,
            });
          }
        }
      } catch (saveError) {
        // 保存Cookie失败不影响主要发布流程，只记录警告
        logger.warn('Failed to save cookies after Douyin publish', {
          accountId: job.data.accountId,
          error: String(saveError),
        });
      }

      // 关闭浏览器
      await publisher.close();
    }
  }

  /**
   * 获取任务状态
   */
  async getJobState(jobId: string): Promise<string | undefined> {
    const job = await this.queue.getJob(jobId);
    return job?.getState();
  }

  /**
   * 获取队列统计
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * 暂停队列
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * 恢复队列
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info('Queue resumed');
  }

  /**
   * 关闭队列和所有 Worker
   */
  async close(): Promise<void> {
    // 关闭所有 Worker
    for (const [platform, worker] of this.workers.entries()) {
      await worker.close();
      logger.info('Worker closed', { platform });
    }
    this.workers.clear();

    // 关闭队列
    await this.queue.close();
    logger.info('Queue closed');

    // 关闭 Redis 连接
    await this.redisClient.quit();
  }
}

// 导出单例
export const publishQueue = PublishQueue.getInstance();

// 导出便捷函数
export async function addPublishJob(jobData: PublishJobData, options?: any) {
  return publishQueue.addJob(jobData, options);
}

export function startAllWorkers() {
  publishQueue.startAllWorkers();
}
