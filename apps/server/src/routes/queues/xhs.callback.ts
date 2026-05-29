import { getLogger } from '@logtape/logtape';
import { Elysia } from 'elysia';
import { prisma } from '../../config/prisma';
import { toXhsMcpPublishPayload } from '../../queues/publish-queue';
import { getChannelRouter } from '../../services/channel-router';
import { moveToPublished } from '../../services/content.service';
import { reportComplete, reportFail, reportProgress } from '../../services/queue-client';
import type { PublishJobPayload } from '../../types/publisher';

interface HtQueueCallbackPayload {
  jobId: string;
  name: string;
  data: {
    taskId: string;
    contentId: string;
    accountId: string;
    platform: string;
    publishLogId?: string;
    content: {
      title: string;
      description?: string;
      images?: string[];
      video?: string;
      tags?: string[];
      basePath?: string;
      scheduleAt?: string;
      visibility?: string;
      isOriginal?: boolean;
      products?: unknown;
    };
    action?: string;
    accountName?: string;
  };
}

async function publishViaMcp(
  data: HtQueueCallbackPayload['data'],
  taskId: string,
  startTime: number,
  log: ReturnType<typeof getLogger>
): Promise<{ success: boolean; error?: string; publishedUrl?: string }> {
  await reportProgress(taskId, 'resolving-publisher', 10, '正在选择发布渠道');

  const account = await prisma.account.findUnique({
    where: { id: data.accountId },
    select: { name: true },
  });
  const accountName = data.accountName || account?.name || data.accountId;

  const router = getChannelRouter();
  const payload = toXhsMcpPublishPayload({
    jobId: taskId,
    accountId: data.accountId,
    accountName,
    action: data.action || 'publish',
    content: data.content,
  });

  const publisher = router.resolve(payload);
  log.info('Resolved MCP publisher', { publisher: publisher.name });

  await reportProgress(taskId, 'publishing', 50, '正在通过 MCP 发布到小红书');
  const result = await publisher.publish(payload);

  if (!result.success) {
    throw new Error(result.error || 'MCP 发布失败');
  }

  return { success: true, publishedUrl: result.url };
}

export function setupXhsCallbackRoutes() {
  const log = getLogger(['app', 'publish', 'xiaohongshu']);

  return new Elysia({ prefix: '/_internal/queues' }).post('/xhs', async ({ body }) => {
    let taskId = '';
    let contentId = '';
    let accountId = '';
    let publishPlanId = '';
    let startTime = 0;
    let useFallback = false;

    try {
      const { data } = body as HtQueueCallbackPayload;
      taskId = data.taskId;
      contentId = data.contentId;
      accountId = data.accountId;
      publishPlanId = data.publishPlanId || '';
      startTime = Date.now();

      if (!data?.taskId || !data?.contentId || !data?.accountId) {
        log.warn('Missing required fields in callback payload');
        return { success: false, error: 'Missing required fields' };
      }

      log.info('Processing xhs publish callback', { taskId, contentId, accountId });
      await reportProgress(taskId, 'preparing', 5, '准备发布');

      try {
        const result = await publishViaMcp(data, taskId, startTime, log);
        if (!result.success) throw new Error(result.error || 'MCP publish failed');

        // 标记 PublishLog 成功
        await prisma.publishLog.updateMany({
          where: { contentId, accountId },
          data: { status: 'SUCCESS', publishedUrl: result.publishedUrl, completedAt: new Date() },
        });

        // 标记 PublishPlan 完成
        if (publishPlanId) {
          await prisma.publishPlan.update({
            where: { id: publishPlanId },
            data: { status: 'DONE', publishedUrl: result.publishedUrl, finishedAt: new Date() },
          });
        }

        // 检查是否所有发布计划都已完成
        const remaining = await prisma.publishPlan.count({
          where: { contentId, status: { notIn: ['DONE'] } },
        });
        if (remaining === 0) {
          await moveToPublished(contentId);
          await prisma.content.update({
            where: { id: contentId },
            data: { status: 'PUBLISHED', publishCount: { increment: 1 } },
          });
        }

        await reportComplete(taskId, {
          platform: 'xiaohongshu',
          publishedUrl: result.publishedUrl,
          duration: Date.now() - startTime,
        });

        return { success: true };
      } catch (mcpError) {
        const isNoPublisher = String(mcpError).includes('No publisher found');
        if (!isNoPublisher) throw mcpError;

        // 没有 MCP publisher，降级到本地 Playwright
        log.warn('No MCP publisher found, falling back to local Playwright', { taskId });
        useFallback = true;
      }

      // Fallback: local Playwright
      await reportProgress(taskId, 'loading-browser', 15, '正在初始化本地浏览器');

      const { XiaohongshuPublisher } = await import('../../publishers/xiaohongshu');
      const publisher = new XiaohongshuPublisher({
        accountId,
        headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
        timeout: 120000,
      });
      await publisher.initialize();

      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { encryptedCookies: true, cookiePassword: true },
      });

      if (account?.encryptedCookies) {
        await reportProgress(taskId, 'loading-cookies', 20, '正在加载 Cookie');
        const password =
          account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
        const loaded = await publisher.loadCookies(account.encryptedCookies, password);
        if (!loaded) throw new Error('Cookie 加载失败');
      }

      await reportProgress(taskId, 'checking-login', 25, '正在验证登录状态');
      const isLoggedIn = await publisher.checkLoginStatus();
      if (!isLoggedIn) throw new Error('账号未登录或 Cookie 已过期');

      await reportProgress(taskId, 'publishing', 60, '正在通过本地 Playwright 发布');
      const publishResult = await publisher.publish(data as unknown as Record<string, unknown>);
      if (!publishResult.success) throw new Error(publishResult.error || '发布失败');

      // 保存更新后的 Cookie
      try {
        if (account?.encryptedCookies) {
          const password =
            account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
          const newCookies = await publisher.saveCookies(password);
          if (newCookies) {
            await prisma.account.update({
              where: { id: accountId },
              data: { encryptedCookies: newCookies, cookieUpdatedAt: new Date() },
            });
          }
        }
      } catch (e) {
        log.warn('Failed to save cookies after publish', { error: String(e) });
      }

      await prisma.publishLog.updateMany({
        where: { contentId, accountId },
        data: {
          status: 'SUCCESS',
          publishedUrl: publishResult.publishedUrl,
          completedAt: new Date(),
        },
      });

      // 标记 PublishPlan 完成
      if (publishPlanId) {
        await prisma.publishPlan.update({
          where: { id: publishPlanId },
          data: {
            status: 'DONE',
            publishedUrl: publishResult.publishedUrl,
            finishedAt: new Date(),
          },
        });
      }

      // 检查是否所有发布计划都已完成
      const remaining = await prisma.publishPlan.count({
        where: { contentId, status: { notIn: ['DONE'] } },
      });
      if (remaining === 0) {
        await moveToPublished(contentId);
        await prisma.content.update({
          where: { id: contentId },
          data: { status: 'PUBLISHED', publishCount: { increment: 1 } },
        });
      }

      await reportComplete(taskId, {
        platform: 'xiaohongshu',
        publishedUrl: publishResult.publishedUrl,
        duration: Date.now() - startTime,
        fallback: true,
      });

      await publisher.close();
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error('XHS publish failed', { taskId, error: errMsg });

      await prisma.publishLog
        .updateMany({
          where: { contentId, accountId },
          data: { status: 'FAILED', errorMessage: errMsg, completedAt: new Date() },
        })
        .catch(() => {});

      if (publishPlanId) {
        await prisma.publishPlan
          .update({
            where: { id: publishPlanId },
            data: { status: 'FAILED', errorMessage: errMsg, finishedAt: new Date() },
          })
          .catch(() => {});
      }

      await reportFail(taskId, 'PUBLISH_FAILED', errMsg);
      return { success: false, error: errMsg };
    }
  });
}
