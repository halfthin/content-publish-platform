import { randomUUID } from 'node:crypto';
import { type Job, Queue, Worker } from 'bullmq';
import { createClient } from 'ioredis';
import { gatewayConfig, validateGatewayConfig } from '../config/gateway';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import { DouyinPublisher } from '../publishers/douyin';
import { WeiboPublisher } from '../publishers/weibo';
import { XiaohongshuPublisher } from '../publishers/xiaohongshu';
import { getChannelRouter } from '../services/channel-router';
import { moveToPublished } from '../services/content.service';
import { getGatewayService } from '../services/gateway.service';
import { getProgressEventBus } from '../services/progress-event-bus';
import { decryptCookies } from '../utils/encryption';

const logger = createLogger('publish-queue');

export interface PublishJobData {
  contentId: string;
  accountId: string;
  publishLogId?: string;
  platform: 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat';
  content: {
    title: string;
    description?: string;
    images?: string[];
    video?: string;
    tags?: string[];
    basePath?: string; // 添加: 内容目录绝对路径 (APPROVED 目录)
  };
  scheduledAt?: number;
  retryCount?: number;
  taskId?: string; // 添加: Gateway 任务ID
}

export interface PublishJobResult {
  success: boolean;
  publishedUrl?: string;
  error?: string;
  errorCode?: string;
}

export interface AddPublishJobOptions {
  delay?: number;
  jobId?: string;
}

// 类型别名，方便发布器使用
export type PublishJob = Job<PublishJobData, PublishJobResult>;

const QUEUE_NAME = 'publish-jobs';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

function sanitizeConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '<invalid redis url>';
  }
}

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

    logger.info('Publish queue initialized', { redis: sanitizeConnectionUrl(REDIS_URL) });
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
    options?: AddPublishJobOptions
  ): Promise<Job<PublishJobData, PublishJobResult, string>> {
    // 生成 taskId 用于 Gateway 追踪
    const taskId = jobData.taskId || randomUUID();

    const job = await this.queue.add(jobData.platform, jobData, {
      jobId: options?.jobId || `${jobData.contentId}-${jobData.accountId}-${taskId}`,
      delay: options?.delay || 0,
    });

    logger.info('Job added to queue', {
      jobId: job.id,
      platform: jobData.platform,
      contentId: jobData.contentId,
      accountId: jobData.accountId,
      taskId,
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
    // 初始化 Gateway 配置
    validateGatewayConfig();

    if (gatewayConfig.isGatewayMode) {
      // Gateway 模式: 所有平台共用一个 worker，调用 Gateway
      this.startWorker('gateway', async (job) => {
        return this.processGatewayJob(job);
      });
      logger.info('All platform workers will use Gateway mode');
    } else {
      // 本地模式: 各平台独立 worker
      this.startWorker('xiaohongshu', async (job) => {
        return this.processXiaohongshuJob(job);
      });
      this.startWorker('weibo', async (job) => {
        return this.processWeiboJob(job);
      });
      this.startWorker('douyin', async (job) => {
        return this.processDouyinJob(job);
      });
      logger.info('Workers started in local Playwright mode');
    }

    // xhs-mcp worker 始终启动（独立于 Gateway 模式）
    this.startWorker('xiaohongshu-mcp', async (job) => {
      return this.processXhsMcpJob(job);
    });
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

  private async markPublishSuccess(
    contentId: string,
    accountId: string,
    platform: string,
    publishedUrl?: string
  ): Promise<void> {
    await prisma.publishLog.updateMany({
      where: {
        contentId,
        accountId,
      },
      data: {
        status: 'SUCCESS',
        publishedUrl,
        completedAt: new Date(),
      },
    });

    await moveToPublished(contentId, platform);

    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'PUBLISHED',
        publishCount: { increment: 1 },
      },
    });
  }

  private async markPublishFailure(
    contentId: string,
    accountId: string,
    errorMessage?: string,
    errorCode?: string
  ): Promise<void> {
    await prisma.publishLog.updateMany({
      where: {
        contentId,
        accountId,
      },
      data: {
        status: 'FAILED',
        errorMessage,
        errorCode,
        completedAt: new Date(),
      },
    });

    await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'FAILED',
      },
    });
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

      if (result.success) {
        await this.markPublishSuccess(
          job.data.contentId,
          job.data.accountId,
          job.data.platform,
          result.publishedUrl
        );
      } else {
        await this.markPublishFailure(
          job.data.contentId,
          job.data.accountId,
          result.error,
          result.errorCode
        );
      }

      return result;
    } catch (error) {
      logger.error('Xiaohongshu job failed', {
        jobId: job.id,
        error: String(error),
      });

      await this.markPublishFailure(
        job.data.contentId,
        job.data.accountId,
        String(error),
        'PROCESSING_FAILED'
      );

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

      if (result.success) {
        await this.markPublishSuccess(
          job.data.contentId,
          job.data.accountId,
          job.data.platform,
          result.publishedUrl
        );
      } else {
        await this.markPublishFailure(
          job.data.contentId,
          job.data.accountId,
          result.error,
          result.errorCode
        );
      }

      return result;
    } catch (error) {
      logger.error('Weibo job failed', {
        jobId: job.id,
        error: String(error),
      });

      await this.markPublishFailure(
        job.data.contentId,
        job.data.accountId,
        String(error),
        'PROCESSING_FAILED'
      );

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

      if (result.success) {
        await this.markPublishSuccess(
          job.data.contentId,
          job.data.accountId,
          job.data.platform,
          result.publishedUrl
        );
      } else {
        await this.markPublishFailure(
          job.data.contentId,
          job.data.accountId,
          result.error,
          result.errorCode
        );
      }

      return result;
    } catch (error) {
      logger.error('Douyin job failed', {
        jobId: job.id,
        error: String(error),
      });

      await this.markPublishFailure(
        job.data.contentId,
        job.data.accountId,
        String(error),
        'PROCESSING_FAILED'
      );

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
   * 处理 Gateway 模式发布
   */
  private async processGatewayJob(
    job: Job<PublishJobData, PublishJobResult>
  ): Promise<PublishJobResult> {
    const { contentId, accountId, platform, content } = job.data;

    logger.info('Processing Gateway publish', {
      jobId: job.id,
      contentId,
      accountId,
      platform,
    });

    // 验证 basePath 存在
    if (!content.basePath) {
      return {
        success: false,
        error: 'Content basePath not found, content may not be approved',
        errorCode: 'NO_CONTENT_PATH',
      };
    }

    // 获取账号的 cookies 并解密
    let cookies: Array<{ name: string; value: string; domain: string; path?: string }> | undefined;
    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { encryptedCookies: true, cookiePassword: true },
      });

      if (account?.encryptedCookies) {
        const password =
          account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
        const decryptedCookies = await decryptCookies(account.encryptedCookies, password);
        // 转换为简化的 cookie 格式
        cookies = (Array.isArray(decryptedCookies) ? decryptedCookies : []).map((c) => ({
          name: String(c.name || ''),
          value: String(c.value || ''),
          domain: String(c.domain || ''),
          path: c.path ? String(c.path) : undefined,
        }));
        logger.debug('Cookies decrypted for Gateway publish', { accountId });
      }
    } catch (error) {
      logger.error('Failed to decrypt cookies for Gateway publish', {
        accountId,
        error: String(error),
      });
      // cookies 获取失败不影响主要流程，继续发布
    }

    const gatewayService = getGatewayService();

    // 调用 Gateway
    const result = await gatewayService.publish({
      platform,
      contentId,
      accountId,
      publishLogId: job.data.publishLogId,
      contentPath: content.basePath,
      taskId: job.data.taskId,
      cookies,
    });

    if (!result.success) {
      logger.error('Gateway publish call failed', {
        contentId,
        error: result.error,
      });

      // 标记为失败
      await this.markPublishFailure(contentId, accountId, result.error, 'GATEWAY_ERROR');

      return {
        success: false,
        error: result.error,
        errorCode: 'GATEWAY_ERROR',
      };
    }

    // Gateway 接受任务，任务将通过 webhook 回调通知结果
    // 更新 PublishLog 状态为 RUNNING
    if (job.data.publishLogId) {
      await prisma.publishLog.update({
        where: { id: job.data.publishLogId },
        data: {
          status: 'RUNNING',
          externalTaskId: result.taskId,
        },
      });
    } else {
      await prisma.publishLog.updateMany({
        where: { contentId, accountId },
        data: {
          status: 'RUNNING',
          externalTaskId: result.taskId,
        },
      });
    }

    logger.info('Gateway publish task accepted', {
      contentId,
      taskId: result.taskId,
    });

    // 注意: 实际结果通过 webhook 回调更新
    // 这里返回成功，让 job 完成
    return {
      success: true,
      // 不设置 publishedUrl，实际结果通过回调获取
    };
  }

  private async processXhsMcpJob(
    job: Job<PublishJobData, PublishJobResult>
  ): Promise<PublishJobResult> {
    const { contentId, accountId, platform, content } = job.data;

    // 仅处理小红书任务
    if (platform !== 'xiaohongshu') {
      return {
        success: false,
        error: `Unsupported platform: ${platform}`,
        errorCode: 'WRONG_PLATFORM',
      };
    }

    logger.info('Processing XHS MCP job', { jobId: job.id, contentId, accountId });

    try {
      // 查数据库获取账号名称，用于匹配 MCP 实例
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { name: true },
      });
      const accountName = account?.name || accountId;

      const router = getChannelRouter();
      const payload: PublishJobPayload = {
        id: job.id || '',
        platform: 'xiaohongshu',
        accountId,
        accountName,
        action: content.video ? 'publish_video' : 'publish',
        payload: {
          title: content.title,
          content: content.description,
          images: content.images,
          video: content.video,
          tags: content.tags,
        },
        createdAt: new Date(),
      };

      const publisher = router.resolve(payload);
      const result = await publisher.publish(payload);

      getProgressEventBus().emit({
        type: 'publish',
        jobId: job.id || undefined,
        platform: 'xiaohongshu',
        status: result.success ? 'SUCCESS' : 'FAILED',
        progress: result.success ? 100 : 0,
        data: result,
      });

      if (result.success) {
        await this.markPublishSuccess(contentId, accountId, 'xiaohongshu', result.url);
      } else {
        await this.markPublishFailure(contentId, accountId, result.error, result.errorCode);
      }

      return result;
    } catch (error) {
      logger.error('XHS MCP job failed', { jobId: job.id, error: String(error) });
      await this.markPublishFailure(contentId, accountId, String(error), 'MCP_ERROR');
      return {
        success: false,
        error: String(error),
        errorCode: 'MCP_ERROR',
      };
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

export function getPublishQueue(): PublishQueue {
  return PublishQueue.getInstance();
}

// 导出便捷函数
export async function addPublishJob(jobData: PublishJobData, options?: AddPublishJobOptions) {
  return getPublishQueue().addJob(jobData, options);
}

export function startAllWorkers() {
  getPublishQueue().startAllWorkers();
}
