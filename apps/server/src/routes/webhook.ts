import { Elysia, t } from 'elysia';
import { gatewayConfig } from '../config/gateway';
import { createLogger } from '../config/logger';
import { getMediaActionGatewayConfig } from '../config/media-actions';
import { prisma } from '../config/prisma';
import {
  type AccountCheckLoginCallbackStore,
  createRedisAccountCheckLoginCallbackStore,
} from '../services/account-check-login-callbacks.service';
import { moveToPublished } from '../services/content.service';
import { getSseManager } from '../services/media-action-sse-manager';
import {
  createMediaActionsService,
  createRedisMediaActionStore,
  type MediaActionsService,
} from '../services/media-actions.service';
import { createMediaLibraryService } from '../services/media-library.service';
import {
  createRedisOpenClawCallbackEventDeduper,
  type OpenClawCallbackEventDeduper,
} from '../services/openclaw-callback-deduper';
import {
  normalizeOpenClawCallback,
  OpenClawCallbackNormalizationError,
} from '../services/openclaw-callback-normalizer';
import {
  createOpenClawResultStorageService,
  type OpenClawResultStorageService,
} from '../services/openclaw-result-storage.service';
import type { MediaActionBroadcast } from '../types/media-action-sse';
import type { OpenClawCallbackEnvelopeV1 } from '../types/openclaw-callback';
import { broadcastMediaAction } from '../websocket/server';

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

interface SetupWebhookRoutesOptions {
  mediaActionsService?: MediaActionsService;
  mediaActionCallbackToken?: string;
  callbackEventDeduper?: OpenClawCallbackEventDeduper;
  accountCheckLoginCallbackStore?: AccountCheckLoginCallbackStore;
  openClawResultStorage?: OpenClawResultStorageService;
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

function normalizePublishPlatform(actionType: string | undefined): string | null {
  if (!actionType) {
    return null;
  }

  const [platform] = actionType.split('.');
  return platform?.trim() || null;
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

function mergeArtifacts(
  existing: OpenClawCallbackEnvelopeV1['result'] extends { artifacts?: infer T } ? T : never,
  appended: NonNullable<OpenClawCallbackEnvelopeV1['result']>['artifacts']
) {
  return [...(existing || []), ...(appended || [])];
}

function mergeUploadResult(
  payload: OpenClawCallbackEnvelopeV1,
  upload: Awaited<ReturnType<OpenClawResultStorageService['store']>>
): Record<string, unknown> {
  const baseResult = payload.result || null;
  const baseExtra =
    baseResult?.extra && typeof baseResult.extra === 'object' && !Array.isArray(baseResult.extra)
      ? baseResult.extra
      : {};

  return {
    externalId: baseResult?.externalId || null,
    url: baseResult?.url || null,
    summary: baseResult?.summary || null,
    artifacts: mergeArtifacts(baseResult?.artifacts, upload.artifacts),
    extra: {
      ...baseExtra,
      upload: {
        provider: 'openclaw',
        fileCount: upload.files.length,
        directory: upload.directory.relativePath,
        directoryAbsolutePath: upload.directory.absolutePath,
        manifestPath: upload.manifest.relativePath,
        manifestAbsolutePath: upload.manifest.absolutePath,
        files: upload.files.map((file) => ({
          fieldName: file.fieldName,
          originalName: file.originalName,
          storedName: file.storedName,
          relativePath: file.relativePath,
          absolutePath: file.absolutePath,
          mimeType: file.mimeType,
          size: file.size,
        })),
      },
    },
  };
}

async function parseMediaActionCallbackRequest(request: Request): Promise<{
  payload: unknown;
  rawBody: Record<string, unknown>;
  files: Array<{ fieldName: string; file: File }>;
}> {
  const contentType = request.headers.get('content-type')?.toLowerCase() || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const payloadField = formData.get('payload');

    if (typeof payloadField !== 'string') {
      throw new OpenClawCallbackNormalizationError(
        'Multipart callback must include a JSON string field named payload'
      );
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payloadField);
    } catch {
      throw new OpenClawCallbackNormalizationError('Invalid JSON in multipart payload field');
    }

    const files = Array.from(formData.entries())
      .filter(
        (entry): entry is [string, File] => entry[0] !== 'payload' && entry[1] instanceof File
      )
      .filter(([, file]) => file.size > 0)
      .map(([fieldName, file]) => ({ fieldName, file }));

    return {
      payload: parsedPayload,
      rawBody: normalizeRawBody(parsedPayload),
      files,
    };
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = await request.json();
  } catch {
    throw new OpenClawCallbackNormalizationError('Callback payload must be valid JSON');
  }

  return {
    payload: parsedPayload,
    rawBody: normalizeRawBody(parsedPayload),
    files: [],
  };
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
  const callbackEventDeduper =
    options.callbackEventDeduper || createRedisOpenClawCallbackEventDeduper();
  const accountCheckLoginCallbackStore =
    options.accountCheckLoginCallbackStore || createRedisAccountCheckLoginCallbackStore();
  const openClawResultStorage =
    options.openClawResultStorage || createOpenClawResultStorageService();

  return (
    new Elysia({ prefix: '/api/webhook' })
      // 通用的发布结果回调 (支持 xhs, weibo, douyin 等平台)
      // URL 中用短名称 (xhs)，但回调 payload 中 platform 是完整名称 (xiaohongshu)
      .post(
        '/:platform/publish-result',
        async ({ body, headers, set, params }) => {
          const authHeader = headers.authorization;
          const rawBody = normalizeRawBody(body);

          if (!validateCallbackToken(authHeader)) {
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
              ? await prisma.publishLog.findUnique({
                  where: { id: payload.refs.publishLogId },
                })
              : null;

            if (!publishLog) {
              publishLog = await prisma.publishLog.findFirst({
                where: {
                  externalTaskId: payload.taskId,
                },
                orderBy: { createdAt: 'desc' },
              });
            }

            if (!publishLog && payload.refs?.contentId && payload.refs?.accountId) {
              const publishLogs = await prisma.publishLog.findMany({
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
            const resolvedPlatform =
              payload.target?.platform ||
              normalizePublishPlatform(payload.actionType) ||
              publishLog.platform;

            // 更新 PublishLog
            if (payload.status === 'success') {
              await prisma.publishLog.update({
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
              await prisma.content.update({
                where: { id: resolvedContentId },
                data: {
                  status: 'PUBLISHED',
                  publishCount: { increment: 1 },
                },
              });

              // 移动到已发布目录
              try {
                await moveToPublished(resolvedContentId, resolvedPlatform);
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
              await prisma.publishLog.update({
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
              await prisma.publishLog.update({
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

              await prisma.content.update({
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

      // media action 回调
      .post(
        '/media-actions/:actionType/result',
        async ({ headers, params, request, set }) => {
          const isAuthorized = validateOptionalBearerToken(
            headers.authorization,
            options.mediaActionCallbackToken || mediaActionGatewayConfig.fromGatewayToken
          );

          if (!isAuthorized) {
            set.status = 401;
            return { success: false, error: 'Unauthorized' };
          }

          let normalizedCallback: OpenClawCallbackEnvelopeV1 | null = null;
          let storedUpload: Awaited<ReturnType<OpenClawResultStorageService['store']>> | null =
            null;

          try {
            const parsedRequest = await parseMediaActionCallbackRequest(request);

            normalizedCallback = normalizeOpenClawCallback(parsedRequest.payload, {
              kind: 'media-action',
              actionType: params.actionType,
            });
            const claimedMediaEvent = await claimCallbackEvent(
              callbackEventDeduper,
              normalizedCallback.eventId
            );
            if (!claimedMediaEvent) {
              logger.info('Duplicate media action callback ignored', {
                eventId: normalizedCallback.eventId,
                taskId: normalizedCallback.taskId,
              });
              return {
                success: true,
                duplicate: true,
                data: {
                  eventId: normalizedCallback.eventId,
                  taskId: normalizedCallback.taskId,
                  actionType: normalizedCallback.actionType,
                  status: normalizedCallback.status,
                  upload: null,
                },
              };
            }

            let callbackResult: Record<string, unknown> | undefined;
            if (parsedRequest.files.length > 0) {
              storedUpload = await openClawResultStorage.store({
                taskId: normalizedCallback.taskId,
                eventId: normalizedCallback.eventId,
                actionType: normalizedCallback.actionType,
                timestamp: normalizedCallback.timestamp,
                refs: normalizedCallback.refs,
                payload: normalizedCallback,
                files: parsedRequest.files,
              });
              callbackResult = mergeUploadResult(normalizedCallback, storedUpload);
            } else if (normalizedCallback.result) {
              callbackResult = normalizedCallback.result as unknown as Record<string, unknown>;
            }

            await mediaActionsService.handleCallback({
              jobId: normalizedCallback.refs?.mediaActionId || undefined,
              taskId: normalizedCallback.taskId,
              actionType: normalizedCallback.actionType,
              status: normalizedCallback.status,
              error: normalizedCallback.error?.message,
              result: callbackResult,
              timestamp: normalizedCallback.timestamp,
              refs: {
                mediaActionId: normalizedCallback.refs?.mediaActionId || null,
              },
            } as Parameters<MediaActionsService['handleCallback']>[0]);

            // 如果 SSE 未订阅（终态回调），通过 WebSocket 广播确保前端能收到
            const callbackJobId = normalizedCallback.refs?.mediaActionId || undefined;
            if (callbackJobId) {
              const sseManager = getSseManager();
              const isSseActive = sseManager?.isSubscribed(callbackJobId) ?? false;
              if (!isSseActive) {
                const status = normalizedCallback.status;
                const outputFiles =
                  storedUpload?.files.map((f) => f.relativePath) ||
                  ((normalizedCallback.result as Record<string, unknown>)?.outputFiles as
                    | string[]
                    | undefined);
                const externalTaskId = normalizedCallback.taskId;
                if (status === 'success') {
                  const msg: MediaActionBroadcast = {
                    type: 'media_action_done',
                    data: {
                      jobId: callbackJobId,
                      externalTaskId,
                      event: 'done',
                      status: 'success',
                      message:
                        ((normalizedCallback.result as Record<string, unknown>)?.summary as
                          | string
                          | undefined) || (normalizedCallback.result as unknown as string),
                      outputFiles,
                      result: normalizedCallback.result as Record<string, unknown>,
                    },
                  };
                  broadcastMediaAction(msg);
                } else if (status === 'failed') {
                  const msg: MediaActionBroadcast = {
                    type: 'media_action_failed',
                    data: {
                      jobId: callbackJobId,
                      externalTaskId,
                      event: 'failed',
                      status: 'failed',
                      message: normalizedCallback.error?.message,
                      error: normalizedCallback.error?.message,
                      outputFiles,
                    },
                  };
                  broadcastMediaAction(msg);
                }
              }
            }

            return {
              success: true,
              data: {
                eventId: normalizedCallback.eventId,
                taskId: normalizedCallback.taskId,
                actionType: normalizedCallback.actionType,
                status: normalizedCallback.status,
                upload: storedUpload
                  ? {
                      fileCount: storedUpload.files.length,
                      directory: storedUpload.directory.relativePath,
                      manifestPath: storedUpload.manifest.relativePath,
                    }
                  : null,
              },
            };
          } catch (error) {
            if (normalizedCallback) {
              await releaseCallbackEvent(callbackEventDeduper, normalizedCallback.eventId);
            }
            if (storedUpload) {
              await openClawResultStorage.cleanup(storedUpload);
            }
            if (error instanceof Error && 'status' in error) {
              set.status = Number((error as { status: number }).status || 500);
              return { success: false, error: error.message };
            }
            set.status = 500;
            return { success: false, error: 'Internal error' };
          }
        },
        {
          params: t.Object({
            actionType: t.String(),
          }),
        }
      )
      // check-login 回调
      .post(
        '/:platform/check-login-result',
        async ({ body, headers, params, set }) => {
          const authHeader = headers.authorization;
          const rawBody = normalizeRawBody(body);

          if (!validateCallbackToken(authHeader)) {
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
              await prisma.account.update({
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
