import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import { XiaohongshuPublisher } from '../publishers/xiaohongshu';
import { decryptCookies } from '../utils/encryption';
import { CronJob } from 'cron';

const logger = createLogger('cookie-refresh-service');

export interface CookieHealthMetrics {
  ageScore: number;          // Cookie年龄 (0-30分)
  usageScore: number;        // 使用频率 (0-30分)
  successRateScore: number;  // 发布成功率 (0-40分)
  totalScore: number;        // 总分 (0-100分)
  healthLevel: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'EXPIRED';
  warningMessage?: string;
}

export interface RefreshResult {
  accountId: string;
  accountName: string;
  success: boolean;
  newCookies?: string;
  error?: string;
  healthScore?: number;
}

/**
 * 小红书Cookie刷新服务
 * 专注小红书平台，微博和抖音功能延后
 */
export class CookieRefreshService {
  private cronJob: CronJob | null = null;
  private isRunning = false;

  constructor(
    private cronExpression = '0 2 * * *', // 每天凌晨2点
    private healthThreshold = 70, // 健康度阈值
    private warningDays = 3, // 提前3天预警
    private maxRefreshAttempts = 3 // 最大刷新尝试次数
  ) {}

  /**
   * 启动定时任务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('CookieRefreshService is already running');
      return;
    }

    this.cronJob = new CronJob(
      this.cronExpression,
      async () => {
        await this.checkAllXiaohongshuAccounts();
      },
      null, // onComplete
      true, // start
      'Asia/Shanghai'
    );

    this.isRunning = true;
    logger.info('CookieRefreshService started', { cronExpression: this.cronExpression });
  }

  /**
   * 停止定时任务
   */
  async stop(): Promise<void> {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.isRunning = false;
    logger.info('CookieRefreshService stopped');
  }

  /**
   * 检查所有小红书账号的Cookie健康度
   */
  async checkAllXiaohongshuAccounts(): Promise<void> {
    logger.info('Starting cookie health check for all xiaohongshu accounts');

    try {
      // 只获取小红书平台的账号
      const accounts = await prisma.account.findMany({
        where: {
          platform: 'xiaohongshu',
          status: 'ACTIVE',
          encryptedCookies: { not: null },
        },
        include: {
          publishLogs: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 最近30天
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      logger.info(`Found ${accounts.length} xiaohongshu accounts to check`);

      const results: RefreshResult[] = [];
      
      // 分批处理，避免同时打开太多浏览器
      const batchSize = 3;
      for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(account => this.checkAndRefreshAccount(account))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const account = batch[index];
            results.push({
              accountId: account.id,
              accountName: account.name,
              success: false,
              error: result.reason.message,
            });
          }
        });

        // 批次间延迟，避免请求过于密集
        if (i + batchSize < accounts.length) {
          await this.sleep(2000);
        }
      }

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const warningCount = results.filter(r => r.healthScore && r.healthScore < this.healthThreshold).length;

      logger.info('Cookie health check completed', {
        total: accounts.length,
        success: successCount,
        failed: accounts.length - successCount,
        warnings: warningCount,
      });

      // 发送通知（后续实现）
      await this.sendNotifications(results);

    } catch (error) {
      logger.error('Failed to check all xiaohongshu accounts', { error: String(error) });
    }
  }

  /**
   * 检查并刷新单个账号的Cookie
   */
  async checkAndRefreshAccount(account: any): Promise<RefreshResult> {
    const result: RefreshResult = {
      accountId: account.id,
      accountName: account.name,
      success: false,
    };

    try {
      // 1. 评估Cookie健康度
      const healthMetrics = await this.evaluateXiaohongshuCookieHealth(account);
      result.healthScore = healthMetrics.totalScore;

      // 2. 更新健康度分数到数据库
      await prisma.account.update({
        where: { id: account.id },
        data: {
          cookieHealthScore: healthMetrics.totalScore,
          lastCookieCheckAt: new Date(),
          cookieExpiryWarning: healthMetrics.healthLevel === 'WARNING' || healthMetrics.healthLevel === 'CRITICAL',
        },
      });

      // 3. 根据健康度决定是否刷新
      if (healthMetrics.healthLevel === 'CRITICAL' || healthMetrics.healthLevel === 'EXPIRED') {
        logger.info('Attempting to refresh cookies for account', {
          accountId: account.id,
          healthLevel: healthMetrics.healthLevel,
          healthScore: healthMetrics.totalScore,
        });

        const refreshSuccess = await this.refreshXiaohongshuCookies(account.id);
        result.success = refreshSuccess;

        if (refreshSuccess) {
          // 更新刷新记录
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookieRefreshAttempts: { increment: 1 },
              cookieLastRefreshAt: new Date(),
            },
          });
        }
      } else {
        result.success = true; // 健康度良好，不需要刷新
      }

      // 4. 记录警告信息
      if (healthMetrics.warningMessage) {
        result.error = healthMetrics.warningMessage;
      }

    } catch (error) {
      logger.error('Failed to check and refresh account', {
        accountId: account.id,
        error: String(error),
      });
      result.error = String(error);
    }

    return result;
  }

  /**
   * 小红书专用Cookie健康度评估
   */
  async evaluateXiaohongshuCookieHealth(account: any): Promise<CookieHealthMetrics> {
    const metrics: CookieHealthMetrics = {
      ageScore: 30,
      usageScore: 30,
      successRateScore: 40,
      totalScore: 100,
      healthLevel: 'HEALTHY',
    };

    // 如果没有Cookie，直接返回最低分
    if (!account.encryptedCookies) {
      return {
        ageScore: 0,
        usageScore: 0,
        successRateScore: 0,
        totalScore: 0,
        healthLevel: 'EXPIRED',
        warningMessage: '账号未配置Cookie',
      };
    }

    // 1. Cookie年龄评估 (0-30分)
    if (account.cookieUpdatedAt) {
      const ageInDays = Math.floor((Date.now() - new Date(account.cookieUpdatedAt).getTime()) / (1000 * 60 * 60 * 24));
      
      if (ageInDays <= 7) {
        metrics.ageScore = 30; // 7天内，满分
      } else if (ageInDays <= 14) {
        metrics.ageScore = 20; // 7-14天，20分
      } else if (ageInDays <= 21) {
        metrics.ageScore = 10; // 14-21天，10分
      } else {
        metrics.ageScore = 0; // 超过21天，0分
      }

      // 设置健康等级
      if (ageInDays > 21) {
        metrics.healthLevel = 'EXPIRED';
        metrics.warningMessage = `Cookie已过期${ageInDays - 21}天`;
      } else if (ageInDays > 14) {
        metrics.healthLevel = 'CRITICAL';
        metrics.warningMessage = `Cookie即将过期，剩余${21 - ageInDays}天`;
      } else if (ageInDays > 7) {
        metrics.healthLevel = 'WARNING';
        metrics.warningMessage = `Cookie已使用${ageInDays}天，建议近期刷新`;
      }
    }

    // 2. 使用频率评估 (0-30分)
    const publishLogs = account.publishLogs || [];
    const recentLogs = publishLogs.filter((log: any) => 
      new Date(log.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    if (recentLogs.length >= 5) {
      metrics.usageScore = 30; // 7天内发布5次以上，满分
    } else if (recentLogs.length >= 3) {
      metrics.usageScore = 20; // 3-4次，20分
    } else if (recentLogs.length >= 1) {
      metrics.usageScore = 10; // 1-2次，10分
    } else {
      metrics.usageScore = 0; // 未使用，0分
    }

    // 3. 发布成功率评估 (0-40分)
    const successLogs = recentLogs.filter((log: any) => log.status === 'SUCCESS');
    const successRate = recentLogs.length > 0 ? successLogs.length / recentLogs.length : 1;

    if (successRate >= 0.9) {
      metrics.successRateScore = 40; // 成功率90%以上，满分
    } else if (successRate >= 0.7) {
      metrics.successRateScore = 30; // 70-89%，30分
    } else if (successRate >= 0.5) {
      metrics.successRateScore = 20; // 50-69%，20分
    } else if (successRate > 0) {
      metrics.successRateScore = 10; // 1-49%，10分
    } else {
      metrics.successRateScore = 0; // 0%，0分
    }

    // 计算总分
    metrics.totalScore = metrics.ageScore + metrics.usageScore + metrics.successRateScore;

    // 年龄评估优先：如果年龄已经标记为EXPIRED，保持EXPIRED
    // 否则根据总分调整健康等级
    if (metrics.healthLevel === 'EXPIRED') {
      // 保持EXPIRED，不根据总分调整
    } else if (metrics.totalScore < 30) {
      metrics.healthLevel = 'EXPIRED';
    } else if (metrics.totalScore < 50) {
      metrics.healthLevel = 'CRITICAL';
    } else if (metrics.totalScore < 70) {
      metrics.healthLevel = 'WARNING';
    } else {
      metrics.healthLevel = 'HEALTHY';
    }

    return metrics;
  }

  /**
   * 刷新小红书Cookie
   */
  async refreshXiaohongshuCookies(accountId: string): Promise<boolean> {
    let publisher: XiaohongshuPublisher | null = null;

    try {
      // 1. 获取账号信息
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });

      if (!account || !account.encryptedCookies) {
        logger.error('Account not found or no cookies', { accountId });
        return false;
      }

      // 2. 检查刷新次数限制
      if (account.cookieRefreshAttempts && account.cookieRefreshAttempts >= this.maxRefreshAttempts) {
        logger.warn('Max refresh attempts reached', { accountId, attempts: account.cookieRefreshAttempts });
        return false;
      }

      // 3. 初始化发布器
      publisher = new XiaohongshuPublisher({
        accountId,
        headless: true,
        timeout: 60000,
      });

      await publisher.initialize();

      // 4. 加载现有Cookie
      const password = account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
      const loaded = await publisher.loadCookies(account.encryptedCookies, password);

      if (!loaded) {
        logger.error('Failed to load existing cookies', { accountId });
        return false;
      }

      // 5. 检查登录状态
      const isLoggedIn = await publisher.checkLoginStatus();
      
      if (!isLoggedIn) {
        logger.warn('Account not logged in, attempting to re-login', { accountId });
        
        // 尝试重新登录（需要人工介入的场景）
        // 这里可以添加自动登录逻辑，但小红书通常需要验证码
        // 目前先返回false，标记需要人工介入
        return false;
      }

      // 6. 保存更新后的Cookie
      const newCookies = await publisher.saveCookies(password);
      
      if (newCookies) {
        // 更新数据库
        await prisma.account.update({
          where: { id: accountId },
          data: {
            encryptedCookies: newCookies,
            cookieUpdatedAt: new Date(),
            cookieHealthScore: 100, // 刷新后恢复满分
            cookieExpiryWarning: false,
          },
        });

        logger.info('Cookies refreshed successfully', { accountId });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to refresh xiaohongshu cookies', {
        accountId,
        error: String(error),
      });
      return false;
    } finally {
      if (publisher) {
        try {
          await publisher.close();
        } catch (closeError) {
          logger.warn('Failed to close publisher', { accountId, error: String(closeError) });
        }
      }
    }
  }

  /**
   * 手动触发健康度检查（用于测试）
   */
  async manualCheck(): Promise<RefreshResult[]> {
    logger.info('Manual cookie health check triggered');
    return this.checkAllXiaohongshuAccounts() as any;
  }

  /**
   * 手动刷新指定账号（用于测试）
   */
  async manualRefresh(accountId: string): Promise<RefreshResult> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    return this.checkAndRefreshAccount(account);
  }

  /**
   * 发送通知（待实现）
   */
  private async sendNotifications(results: RefreshResult[]): Promise<void> {
    // TODO: 实现WebSocket通知、邮件通知等
    const criticalAccounts = results.filter(r => 
      r.healthScore && r.healthScore < 50 && !r.success
    );

    if (criticalAccounts.length > 0) {
      logger.warn('Critical accounts need manual intervention', {
        count: criticalAccounts.length,
        accounts: criticalAccounts.map(a => ({ id: a.accountId, name: a.accountName })),
      });
    }
  }

  /**
   * 工具函数：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}