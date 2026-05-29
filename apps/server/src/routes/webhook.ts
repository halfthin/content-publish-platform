import { Elysia, t } from 'elysia';
import { gatewayConfig } from '../config/gateway';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import {
  type AccountCheckLoginCallbackStore,
  createRedisAccountCheckLoginCallbackStore,
} from '../services/account-check-login-callbacks.service';
import { moveToPublished } from '../services/content.service';
import {
  createRedisOpenClawCallbackEventDeduper,
  type OpenClawCallbackEventDeduper,
} from '../services/openclaw-callback-deduper';
import {
  normalizeOpenClawCallback,
  OpenClawCallbackNormalizationError,
} from '../services/openclaw-callback-normalizer';
import type { OpenClawCallbackEnvelopeV1 } from '../types/openclaw-callback';

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

export interface SetupWebhookRoutesOptions {
  gatewayCallbackToken?: string;
  callbackEventDeduper?: OpenClawCallbackEventDeduper;
  accountCheckLoginCallbackStore?: AccountCheckLoginCallbackStore;
  openClawResultStorage?: OpenClawResultStorageService;
  prismaClient?: typeof prisma;
  moveToPublished?: typeof moveToPublished;
}

/**
 * 验证回调认证
 */
function validateCallbackToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken || !authHeader) {
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === expectedToken;
}

function normalizeRoutePlatform(platform: string | undefined): string | null {
  if (!platform) {
    return null;
  }

  return platform === 'xhs' ? 'xiaohongshu' : platform;
}

async function claimCallbackEvent(
  deduper: OpenClawCallbackEventDeduper,
  eventId: string
): Promise<boolean> {
  try {
    return await deduper.claim(eventId);
  } catch (error) {
    logger.warn('Failed to claim callback event, continuing without dedupe', {
      eventId,
      error: String(error),
    });
    return true;
  }
}

async function releaseCallbackEvent(
  deduper: OpenClawCallbackEventDeduper,
  eventId: string
): Promise<void> {
  try {
    await deduper.release(eventId);
  } catch (error) {
    logger.warn('Failed to release callback event claim', {
      eventId,
      error: String(error),
    });
  }
}

function getNormalizedExtra(payload: OpenClawCallbackEnvelopeV1): Record<string, unknown> | null {
  const extra = payload.result?.extra;
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    return null;
  }

  return extra;
}

function getOptionalBoolean(
  record: Record<string, unknown> | null,
  key: string
): boolean | undefined {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getOptionalString(
  record: Record<string, unknown> | null,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeRawBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}

/**
 * Webhook 路由
 */
export function setupWebhookRoutes(options: SetupWebhookRoutesOptions = {}) {
  const callbackEventDeduper =
    options.callbackEventDeduper || createRedisOpenClawCallbackEventDeduper();
  const accountCheckLoginCallbackStore =
    options.accountCheckLoginCallbackStore || createRedisAccountCheckLoginCallbackStore();
  const db = options.prismaClient || prisma;
  const moveContentToPublished = options.moveToPublished || moveToPublished;
  const gatewayCallbackToken = options.gatewayCallbackToken ?? gatewayConfig.fromGatewayToken;

  return (
    new Elysia({ prefix: '/api/webhook' })
      // 通用的发布结果回调 (支持 xhs, weibo, douyin 等平台)
      // URL 中用短名称 (xhs)，但回调 payload 中 platform 是完整名称 (xiaohongshu)
      .post(
        '/:platform/publish-result',
        async ({ body, headers, set, params }) => {
          const authHeader = headers.authorization;
          const rawBody = normalizeRawBody(body);

          if (!validateCallbackToken(authHeader, gatewayCallbackToken)) {
            logger.warn('Invalid callback token', {
              received: authHeader?.substring(0, 10),
            });
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
          }

          let payload: OpenClawCallbackEnvelopeV1;

          try {
            payload = normalizeOpenClawCallback(body, {
              kind: 'publish',
              platform: params.platform,
            });
          } catch (error) {
            if (error instanceof OpenClawCallbackNormalizationError) {
              set.status = error.status;
              return { success: false, error: error.message };
            }
            throw error;
          }

          logger.info('Received publish result callback', {
            taskId: payload.taskId,
            publishLogId: payload.refs?.publishLogId,
            contentId: payload.refs?.contentId,
            status: payload.status,
          });

          const claimedPublishEvent = await claimCallbackEvent(
            callbackEventDeduper,
            payload.eventId
          );
          if (!claimedPublishEvent) {
            logger.info('Duplicate publish callback ignored', {
              eventId: payload.eventId,
              taskId: payload.taskId,
            });
            return { success: true, duplicate: true };
          }

          try {
            let publishLog = payload.refs?.publishLogId
              ? await db.publishLog.findUnique({
                  where: { id: payload.refs.publishLogId },
                })
              : null;

            if (!publishLog) {
              publishLog = await db.publishLog.findFirst({
                where: {
                  externalTaskId: payload.taskId,
                },
                orderBy: { createdAt: 'desc' },
              });
            }

            if (!publishLog && payload.refs?.contentId && payload.refs?.accountId) {
              const publishLogs = await db.publishLog.findMany({
                where: {
                  contentId: payload.refs.contentId,
                  accountId: payload.refs.accountId,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              });
              publishLog = publishLogs[0] || null;
            }

            if (!publishLog) {
              logger.warn('PublishLog not found', {
                publishLogId: payload.refs?.publishLogId,
                contentId: payload.refs?.contentId,
                accountId: payload.refs?.accountId,
              });
              await releaseCallbackEvent(callbackEventDeduper, payload.eventId);
              // 不返回错误，因为可能是旧任务
              return { success: true, message: 'PublishLog not found, ignored' };
            }

            const resolvedContentId = payload.refs?.contentId || publishLog.contentId;

            // 更新 PublishLog
            if (payload.status === 'success') {
              await db.publishLog.update({
                where: { id: publishLog.id },
                data: {
                  status: 'SUCCESS',
                  externalTaskId: payload.taskId,
                  publishedUrl: payload.result?.url || payload.result?.externalId || undefined,
                  callbackPayload: {
                    raw: rawBody,
                    normalized: payload,
                  },
                  completedAt: new Date(),
                },
              });

              // 更新 Content 状态
              await db.content.update({
                where: { id: resolvedContentId },
                data: {
                  status: 'PUBLISHED',
                  publishCount: { increment: 1 },
                },
              });

              // 移动到已发布目录
              try {
                await moveContentToPublished(resolvedContentId);
              } catch (moveError) {
                logger.warn('Failed to move to published directory', {
                  contentId: resolvedContentId,
                  error: String(moveError),
                });
              }

              logger.info('Content published successfully', {
                contentId: resolvedContentId,
                url: payload.result?.url,
              });
            } else if (payload.status === 'queued' || payload.status === 'running') {
              await db.publishLog.update({
                where: { id: publishLog.id },
                data: {
                  status: payload.status === 'queued' ? 'QUEUED' : 'RUNNING',
                  externalTaskId: payload.taskId,
                  errorMessage: payload.error?.message,
                  callbackPayload: {
                    raw: rawBody,
                    normalized: payload,
                  },
                },
              });
            } else {
              await db.publishLog.update({
                where: { id: publishLog.id },
                data: {
                  status: payload.status === 'needs-auth' ? 'NEEDS_AUTH' : 'FAILED',
                  externalTaskId: payload.taskId,
                  errorMessage: payload.error?.message,
                  callbackPayload: {
                    raw: rawBody,
                    normalized: payload,
                  },
                  completedAt: new Date(),
                },
              });

              await db.content.update({
                where: { id: resolvedContentId },
                data: {
                  status: 'FAILED',
                },
              });

              logger.warn('Content publish failed', {
                contentId: resolvedContentId,
                error: payload.error?.message,
              });
            }

            return { success: true };
          } catch (error) {
            await releaseCallbackEvent(callbackEventDeduper, payload.eventId);
            logger.error('Error processing publish callback', {
              error: String(error),
            });
            set.status = 500;
            return { success: false, error: 'Internal error' };
          }
        },
        {
          body: t.Record(t.String(), t.Any()),
          params: t.Object({
            platform: t.String(),
          }),
        }
      )

      // check-login 回调
      .post(
        '/:platform/check-login-result',
        async ({ body, headers, params, set }) => {
          const authHeader = headers.authorization;
          const rawBody = normalizeRawBody(body);

          if (!validateCallbackToken(authHeader, gatewayCallbackToken)) {
            logger.warn('Invalid callback token for check-login', {
              received: authHeader?.substring(0, 10),
            });
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
          }

          let payload: OpenClawCallbackEnvelopeV1;

          try {
            payload = normalizeOpenClawCallback(body, {
              kind: 'account',
              platform: params.platform,
              actionType: `${normalizeRoutePlatform(params.platform) || params.platform}.check-login`,
            });
          } catch (error) {
            if (error instanceof OpenClawCallbackNormalizationError) {
              set.status = error.status;
              return { success: false, error: error.message };
            }
            throw error;
          }

          const claimedAccountEvent = await claimCallbackEvent(
            callbackEventDeduper,
            payload.eventId
          );
          if (!claimedAccountEvent) {
            logger.info('Duplicate check-login callback ignored', {
              eventId: payload.eventId,
              taskId: payload.taskId,
            });
            return { success: true, duplicate: true };
          }

          const extra = getNormalizedExtra(payload);
          const accountId = payload.refs?.accountId || getOptionalString(extra, 'accountId');
          const loggedIn = getOptionalBoolean(extra, 'loggedIn') ?? payload.status === 'success';
          const success = getOptionalBoolean(extra, 'success') ?? payload.status !== 'failed';
          const username = getOptionalString(extra, 'username');
          const qrcodeUrl =
            getOptionalString(extra, 'qrcodeUrl') || payload.result?.url || undefined;

          if (accountId) {
            await accountCheckLoginCallbackStore.set({
              accountId,
              taskId: payload.taskId,
              eventId: payload.eventId,
              status: payload.status,
              updatedAt: new Date().toISOString(),
              callbackPayload: {
                raw: rawBody,
                normalized: payload,
              },
            });
          }

          logger.info('Received check-login callback', {
            taskId: payload.taskId,
            accountId,
            loggedIn,
            success,
            status: payload.status,
          });

          // 查找待处理的回调
          const pending = pendingCheckLoginCallbacks.get(payload.taskId);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve({
              success,
              loggedIn,
              username,
              error: payload.error?.message,
              qrcodeUrl,
            });
            pendingCheckLoginCallbacks.delete(payload.taskId);
          } else {
            if (!accountId) {
              await releaseCallbackEvent(callbackEventDeduper, payload.eventId);
              set.status = 400;
              return { success: false, error: 'accountId is required for check-login callback' };
            }

            // 更新账号登录状态
            try {
              await db.account.update({
                where: { id: accountId },
                data: {
                  loginStatus: loggedIn ? 'LOGGED_IN' : 'EXPIRED',
                },
              });
              logger.info('Account login status updated from callback', {
                accountId,
                loginStatus: loggedIn ? 'LOGGED_IN' : 'EXPIRED',
              });
            } catch (error) {
              await releaseCallbackEvent(callbackEventDeduper, payload.eventId);
              logger.warn('Failed to update account login status', {
                accountId,
                error: String(error),
              });
              set.status = 500;
              return { success: false, error: 'Internal error' };
            }
          }

          return { success: true };
        },
        {
          body: t.Record(t.String(), t.Any()),
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
