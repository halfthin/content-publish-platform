import { getLogger } from '@logtape/logtape';
import { Elysia } from 'elysia';
import { prisma } from '../../config/prisma';
import { moveToPublished } from '../../services/content.service';
import { getGatewayService } from '../../services/gateway.service';
import { reportComplete, reportFail, reportProgress } from '../../services/queue-client';
import { decryptCookies } from '../../utils/encryption';

// HT-queue callback payload
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

export function setupXhsCallbackRoutes() {
  const log = getLogger(['app', 'publish', 'xiaohongshu']);

  return new Elysia({ prefix: '/_internal/queues' }).post('/xhs', async ({ body }) => {
    let publisher: any;
    let taskId = '';
    let contentId = '';
    let accountId = '';
    let content: any;
    let startTime = 0;

    try {
      const { data } = body as HtQueueCallbackPayload;
      taskId = data.taskId;
      contentId = data.contentId;
      accountId = data.accountId;
      content = data.content;
      startTime = Date.now();

      if (!data?.taskId || !data?.contentId || !data?.accountId) {
        log.warn('Missing required fields in callback payload');
        return { success: false, error: 'Missing required fields' };
      }

      log.info('Processing xhs publish callback', { taskId, contentId, accountId });

      await reportProgress(taskId, 'decrypting-cookies', 5, '正在解密 Cookie');

      // 获取并解密 cookies
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { encryptedCookies: true, cookiePassword: true },
      });

      let cookies:
        | Array<{ name: string; value: string; domain: string; path?: string }>
        | undefined;
      if (account?.encryptedCookies) {
        const password =
          account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
        const decrypted = await decryptCookies(account.encryptedCookies, password);
        cookies = (Array.isArray(decrypted) ? decrypted : []).map((c: Record<string, unknown>) => ({
          name: String(c.name || ''),
          value: String(c.value || ''),
          domain: String(c.domain || ''),
          path: c.path ? String(c.path) : undefined,
        }));
      }

      const publishMode = process.env.PUBLISH_MODE || 'gateway';

      if (publishMode === 'gateway') {
        await reportProgress(taskId, 'calling-gateway', 30, '正在调用 Gateway 发布');

        const gatewayService = getGatewayService();
        const result = await gatewayService.publish({
          platform: 'xiaohongshu',
          contentId,
          accountId,
          publishLogId: data.publishLogId,
          contentPath: content.basePath || '',
          taskId,
          cookies,
        });

        if (!result.success) {
          if (data.publishLogId) {
            await prisma.publishLog
              .update({
                where: { id: data.publishLogId },
                data: { status: 'FAILED', errorMessage: result.error, completedAt: new Date() },
              })
              .catch(() => {});
          }
          await reportFail(taskId, 'GATEWAY_ERROR', result.error || 'Gateway publish failed');
          return { success: false, error: result.error };
        }

        // Gateway 接受任务，更新 PublishLog 为 RUNNING
        if (data.publishLogId) {
          await prisma.publishLog.update({
            where: { id: data.publishLogId },
            data: { status: 'RUNNING', externalTaskId: result.taskId },
          });
        }

        await reportProgress(taskId, 'gateway-accepted', 60, 'Gateway 已接受任务，等待回调');
        await reportComplete(taskId, {
          platform: 'xiaohongshu',
          taskId: result.taskId,
          duration: Date.now() - startTime,
          note: 'Gateway accepted, result will arrive via webhook callback',
        });

        return { success: true };
      }

      // Local mode
      await reportProgress(taskId, 'loading-browser', 10, '正在初始化浏览器');

      const { XiaohongshuPublisher } = await import('../../publishers/xiaohongshu');
      publisher = new XiaohongshuPublisher({
        accountId,
        headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
        timeout: 120000,
      });

      await publisher.initialize();

      if (account?.encryptedCookies) {
        await reportProgress(taskId, 'loading-cookies', 15, '正在加载 Cookie');
        const password =
          account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
        const loaded = await publisher.loadCookies(account.encryptedCookies, password);
        if (!loaded) {
          throw new Error('Cookie 加载失败');
        }
      }

      await reportProgress(taskId, 'checking-login', 20, '正在验证登录状态');
      const isLoggedIn = await publisher.checkLoginStatus();
      if (!isLoggedIn) {
        throw new Error('账号未登录或 Cookie 已过期');
      }

      await reportProgress(taskId, 'preparing-media', 40, '正在准备素材');
      await reportProgress(taskId, 'publishing', 70, '正在发布到小红书');

      const publishResult = await publisher.publish(data as unknown as Record<string, unknown>);

      if (!publishResult.success) {
        throw new Error(publishResult.error || '发布失败');
      }

      await reportProgress(taskId, 'saving-cookies', 95, '正在保存 Cookie');

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

      // 标记成功
      await prisma.publishLog.updateMany({
        where: { contentId, accountId },
        data: {
          status: 'SUCCESS',
          publishedUrl: publishResult.publishedUrl,
          completedAt: new Date(),
        },
      });
      await moveToPublished(contentId, 'xiaohongshu');
      await prisma.content.update({
        where: { id: contentId },
        data: { status: 'PUBLISHED', publishCount: { increment: 1 } },
      });

      await reportComplete(taskId, {
        platform: 'xiaohongshu',
        publishedUrl: publishResult.publishedUrl,
        duration: Date.now() - startTime,
        cookieUpdated: true,
      });

      await publisher.close();
      return { success: true };
    } catch (error) {
      if (typeof publisher !== 'undefined') {
        try {
          await publisher.close();
        } catch {}
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error('XHS publish failed', { taskId, error: errMsg });

      // 标记失败
      await prisma.publishLog
        .updateMany({
          where: { contentId, accountId },
          data: { status: 'FAILED', errorMessage: errMsg, completedAt: new Date() },
        })
        .catch(() => {});

      await reportFail(taskId, 'PUBLISH_FAILED', errMsg);
      return { success: false, error: errMsg };
    }
  });
}
