import { Elysia, t } from 'elysia';
import { gatewayConfig } from '../config/gateway';
import { createLogger } from '../config/logger';
import { getMediaActionGatewayConfig } from '../config/media-actions';
import { prisma } from '../config/prisma';
import { moveToPublished } from '../services/content.service';
import {
  createMediaActionsService,
  createRedisMediaActionStore,
  type MediaActionsService,
} from '../services/media-actions.service';
import { createMediaLibraryService } from '../services/media-library.service';

const logger = createLogger('webhook-route');

// 用于存储 check-login 回调的 pending 状态
const pendingCheckLoginCallbacks = new Map<
  string,
  {
    resolve: (result: CheckLoginResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }
>();

export interface CheckLoginResult {
  success: boolean;
  loggedIn: boolean;
  username?: string;
  error?: string;
  qrcodeUrl?: string;
}

interface CheckLoginCallbackPayload {
  taskId: string;
  platform: string;
  accountId: string;
  success: boolean;
  loggedIn: boolean;
  username?: string;
  error?: string;
  qrcodeUrl?: string;
  checkedAt: string;
}

interface SetupWebhookRoutesOptions {
  mediaActionsService?: MediaActionsService;
  mediaActionCallbackToken?: string;
}

function validateOptionalBearerToken(
  authHeader: string | undefined,
  expectedToken: string
): boolean {
  if (!expectedToken) {
    return true;
  }

  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === expectedToken;
}

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
export function setupWebhookRoutes(options: SetupWebhookRoutesOptions = {}) {
  const mediaActionGatewayConfig = getMediaActionGatewayConfig();
  const mediaActionsService =
    options.mediaActionsService ||
    createMediaActionsService({
      mediaService: createMediaLibraryService(),
      store: createRedisMediaActionStore(),
    });

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

      // media action 回调
      .post(
        '/media-actions/:actionType/result',
        async ({ body, headers, params, set }) => {
          const isAuthorized = validateOptionalBearerToken(
            headers.authorization,
            options.mediaActionCallbackToken || mediaActionGatewayConfig.fromGatewayToken
          );

          if (!isAuthorized) {
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
          }

          try {
            await mediaActionsService.handleCallback({
              ...(body as Record<string, unknown>),
              actionType: params.actionType,
            } as Parameters<MediaActionsService['handleCallback']>[0]);
            return { success: true };
          } catch (error) {
            if (error instanceof Error && 'status' in error) {
              set.status = Number((error as { status: number }).status || 500);
              return { success: false, error: error.message };
            }
            set.status = 500;
            return { success: false, error: 'Internal error' };
          }
        },
        {
          body: t.Object({
            jobId: t.Optional(t.String()),
            taskId: t.Optional(t.String()),
            actionType: t.Optional(t.String()),
            status: t.Union([
              t.Literal('queued'),
              t.Literal('running'),
              t.Literal('success'),
              t.Literal('failed'),
            ]),
            error: t.Optional(t.String()),
            result: t.Optional(t.Record(t.String(), t.Any())),
            timestamp: t.Optional(t.String()),
          }),
          params: t.Object({
            actionType: t.String(),
          }),
        }
      )
      // check-login 回调
      .post(
        '/:platform/check-login-result',
        async ({ body, headers, set }) => {
          const authHeader = headers.authorization;

          if (!validateCallbackToken(authHeader)) {
            logger.warn('Invalid callback token for check-login', {
              received: authHeader?.substring(0, 10),
            });
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
          }

          const payload = body as CheckLoginCallbackPayload;

          logger.info('Received check-login callback', {
            taskId: payload.taskId,
            accountId: payload.accountId,
            loggedIn: payload.loggedIn,
            success: payload.success,
          });

          // 查找待处理的回调
          const pending = pendingCheckLoginCallbacks.get(payload.taskId);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve({
              success: payload.success,
              loggedIn: payload.loggedIn,
              username: payload.username,
              error: payload.error,
              qrcodeUrl: payload.qrcodeUrl,
            });
            pendingCheckLoginCallbacks.delete(payload.taskId);
          } else {
            // 更新账号登录状态
            try {
              await prisma.account.update({
                where: { id: payload.accountId },
                data: {
                  loginStatus: payload.loggedIn ? 'LOGGED_IN' : 'EXPIRED',
                },
              });
              logger.info('Account login status updated from callback', {
                accountId: payload.accountId,
                loginStatus: payload.loggedIn ? 'LOGGED_IN' : 'EXPIRED',
              });
            } catch (error) {
              logger.warn('Failed to update account login status', {
                accountId: payload.accountId,
                error: String(error),
              });
            }
          }

          return { success: true };
        },
        {
          body: t.Object({
            taskId: t.String(),
            platform: t.String(),
            accountId: t.String(),
            success: t.Boolean(),
            loggedIn: t.Boolean(),
            username: t.Optional(t.String()),
            error: t.Optional(t.String()),
            qrcodeUrl: t.Optional(t.String()),
            checkedAt: t.String(),
          }),
          params: t.Object({
            platform: t.String(),
          }),
        }
      )
  );
}

// 导出 pending 回调管理器，供 gateway.service.ts 使用
export function addPendingCheckLoginCallback(
  taskId: string,
  timeoutMs: number = 60000
): Promise<CheckLoginResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCheckLoginCallbacks.delete(taskId);
      reject(new Error('Check-login timeout'));
    }, timeoutMs);

    pendingCheckLoginCallbacks.set(taskId, { resolve, reject, timeout });
  });
}
