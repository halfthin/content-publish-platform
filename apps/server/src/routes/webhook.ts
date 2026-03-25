import { Elysia, t } from 'elysia';
import { gatewayConfig } from '../config/gateway';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import { moveToPublished } from '../services/content.service';

const logger = createLogger('webhook-route');

/**
 * 验证回调认证
 */
function validateCallbackToken(authHeader: string | undefined): boolean {
  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === gatewayConfig.fromGatewayToken;
}

/**
 * Webhook 路由
 */
export function setupWebhookRoutes() {
  return (
    new Elysia({ prefix: '/api/webhook' })
      // 通用的发布结果回调 (支持 xhs, weibo, douyin 等平台)
      // URL 中用短名称 (xhs)，但回调 payload 中 platform 是完整名称 (xiaohongshu)
      .post(
        '/:platform/publish-result',
        async ({ body, headers, set, params }) => {
          const authHeader = headers.authorization;
          const _urlPlatform = params.platform; // xhs, weibo, douyin (用于路由)

          if (!validateCallbackToken(authHeader)) {
            logger.warn('Invalid callback token', {
              received: authHeader?.substring(0, 10),
            });
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
          }

          const payload = body as {
            taskId: string;
            contentId: string;
            accountId: string;
            platform: string;
            status: 'success' | 'failed' | 'needs-auth';
            publishedId?: string;
            url?: string;
            error?: string;
            timestamp?: string;
          };

          logger.info('Received publish result callback', {
            taskId: payload.taskId,
            contentId: payload.contentId,
            status: payload.status,
          });

          try {
            // 查找对应的 PublishLog
            const publishLogs = await prisma.publishLog.findMany({
              where: {
                contentId: payload.contentId,
                accountId: payload.accountId,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            });

            const publishLog = publishLogs[0];

            if (!publishLog) {
              logger.warn('PublishLog not found', {
                contentId: payload.contentId,
                accountId: payload.accountId,
              });
              // 不返回错误，因为可能是旧任务
              return { success: true, message: 'PublishLog not found, ignored' };
            }

            // 更新 PublishLog
            if (payload.status === 'success') {
              await prisma.publishLog.update({
                where: { id: publishLog.id },
                data: {
                  status: 'SUCCESS',
                  publishedUrl: payload.url || payload.publishedId,
                  completedAt: new Date(),
                },
              });

              // 更新 Content 状态
              await prisma.content.update({
                where: { id: payload.contentId },
                data: {
                  status: 'PUBLISHED',
                  publishCount: { increment: 1 },
                },
              });

              // 移动到已发布目录
              try {
                await moveToPublished(payload.contentId, payload.platform);
              } catch (moveError) {
                logger.warn('Failed to move to published directory', {
                  contentId: payload.contentId,
                  error: String(moveError),
                });
              }

              logger.info('Content published successfully', {
                contentId: payload.contentId,
                url: payload.url,
              });
            } else {
              await prisma.publishLog.update({
                where: { id: publishLog.id },
                data: {
                  status: payload.status === 'needs-auth' ? 'NEEDS_AUTH' : 'FAILED',
                  errorMessage: payload.error,
                  completedAt: new Date(),
                },
              });

              await prisma.content.update({
                where: { id: payload.contentId },
                data: {
                  status: 'FAILED',
                },
              });

              logger.warn('Content publish failed', {
                contentId: payload.contentId,
                error: payload.error,
              });
            }

            return { success: true };
          } catch (error) {
            logger.error('Error processing publish callback', {
              error: String(error),
            });
            set.status = 500;
            return { success: false, error: 'Internal error' };
          }
        },
        {
          body: t.Object({
            taskId: t.String(),
            contentId: t.String(),
            accountId: t.String(),
            platform: t.String(), // 回调中的 platform 可能与 URL params 不同
            status: t.Union([t.Literal('success'), t.Literal('failed'), t.Literal('needs-auth')]),
            publishedId: t.Optional(t.String()),
            url: t.Optional(t.String()),
            error: t.Optional(t.String()),
            timestamp: t.Optional(t.String()),
          }),
          params: t.Object({
            platform: t.String(),
          }),
        }
      )
  );
}
