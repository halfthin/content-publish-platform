import { createLogger } from '../config/logger';
import {
  getMediaActionGatewayConfig,
  type MediaActionGatewayConfig,
} from '../config/media-actions';
import { getRedisClient } from '../config/redis';
import type {
  MediaActionDispatcher,
  MediaActionDispatchResult,
  MediaActionSummary,
} from './media-actions.service';

const TIMEOUT_KEY_PREFIX = 'media:action:timeout:';
const DEFAULT_TIMEOUT_MINUTES = 5;

const logger = createLogger('media-action-dispatcher');

interface CreateHttpMediaActionDispatcherOptions {
  config?: Partial<MediaActionGatewayConfig>;
  fetchImpl?: typeof fetch;
  trackTimeout?: boolean;
  sseManager?: {
    subscribe(
      jobId: string,
      eventsPath: string,
      externalTaskId: string,
      routeId: string,
      taskId: string
    ): Promise<void>;
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeRoutePrefix(value: string): string {
  if (!value) {
    return '/webhooks/cpp/media-actions';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return trimTrailingSlash(withLeadingSlash);
}

function resolveGatewayConfig(
  overrides: Partial<MediaActionGatewayConfig> = {}
): MediaActionGatewayConfig {
  const base = getMediaActionGatewayConfig();
  return {
    ...base,
    ...overrides,
    url: trimTrailingSlash(overrides.url || base.url || ''),
    callbackBaseUrl: trimTrailingSlash(overrides.callbackBaseUrl || base.callbackBaseUrl),
    routePrefix: normalizeRoutePrefix(overrides.routePrefix || base.routePrefix),
    dispatchPathByActionType: {
      ...base.dispatchPathByActionType,
      ...overrides.dispatchPathByActionType,
      ...(overrides.imageToImageDispatchPath
        ? { 'image-to-image': overrides.imageToImageDispatchPath }
        : {}),
    },
  };
}

function extractExternalTaskId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    (typeof record.taskId === 'string' && record.taskId) ||
    (typeof record.externalTaskId === 'string' && record.externalTaskId);
  if (direct) {
    return direct;
  }

  const nested = record.data;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    return (
      (typeof nestedRecord.taskId === 'string' && nestedRecord.taskId) ||
      (typeof nestedRecord.externalTaskId === 'string' && nestedRecord.externalTaskId) ||
      undefined
    );
  }

  return undefined;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return false;
}

function buildDefaultPayload(
  summary: MediaActionSummary,
  callbackUrl: string,
  callbackToken: string
) {
  return {
    jobId: summary.id,
    actionType: summary.actionType,
    operator: summary.operator,
    refs: {
      mediaActionId: summary.id,
    },
    assets: summary.assets,
    formData: summary.formData,
    context: summary.context,
    source: 'content-publish-platform/media-library',
    requestedAt: new Date().toISOString(),
    callback: {
      url: callbackUrl,
      token: callbackToken,
    },
  };
}

function buildImageToImagePayload(
  summary: MediaActionSummary,
  callbackUrl: string,
  callbackToken: string
) {
  const formData = summary.formData || {};
  const referenceFace = normalizeOptionalString(formData.referenceFace);
  const referenceBody = normalizeOptionalString(formData.referenceBody);
  const lighting = normalizeOptionalString(formData.lighting);
  const composition = normalizeOptionalString(formData.composition);
  const description = normalizeOptionalString(formData.description);

  return {
    taskId: summary.id,
    refs: {
      mediaActionId: summary.id,
    },
    callback: {
      url: callbackUrl,
      token: callbackToken,
    },
    mode: normalizeOptionalString(formData.mode) || 'lifestyle',
    person: normalizeOptionalString(formData.person),
    productCode: normalizeOptionalString(formData.productCode),
    scene: normalizeOptionalString(formData.scene),
    style: normalizeOptionalString(formData.style),
    mood: normalizeOptionalString(formData.mood),
    count: normalizeOptionalNumber(formData.count),
    size: normalizeOptionalString(formData.size),
    model: normalizeOptionalString(formData.model),
    dryRun: normalizeBoolean(formData.dryRun),
    referenceImages: {
      ...(summary.assets[0]?.sourcePath ? { product: summary.assets[0].sourcePath } : {}),
      ...(summary.assets[1]?.sourcePath ? { outfit: summary.assets[1].sourcePath } : {}),
      ...(summary.assets[2]?.sourcePath ? { detail: summary.assets[2].sourcePath } : {}),
      ...(summary.assets[3]?.sourcePath ? { scene: summary.assets[3].sourcePath } : {}),
      ...(referenceFace ? { face: referenceFace } : {}),
      ...(referenceBody ? { body: referenceBody } : {}),
    },
    ...(lighting ? { lighting } : {}),
    ...(composition ? { composition } : {}),
    ...(description ? { description } : {}),
  };
}

export function createHttpMediaActionDispatcher(
  options: CreateHttpMediaActionDispatcherOptions = {}
): MediaActionDispatcher {
  const config = resolveGatewayConfig(options.config);
  const fetchImpl = options.fetchImpl || fetch;

  return {
    async dispatch(summary: MediaActionSummary): Promise<MediaActionDispatchResult> {
      if (!config.url) {
        return {
          accepted: false,
          error: 'MEDIA_ACTION_GATEWAY_URL is not configured',
        };
      }

      const callbackUrl = `${config.callbackBaseUrl}/api/webhook/media-actions/${summary.actionType}/result`;
      const payload =
        summary.actionType === 'image-to-image'
          ? buildImageToImagePayload(summary, callbackUrl, config.fromGatewayToken)
          : buildDefaultPayload(summary, callbackUrl, config.fromGatewayToken);
      const dispatchUrl =
        summary.actionType === 'image-to-image'
          ? `${config.url}${config.dispatchPathByActionType['image-to-image'] || '/webhooks/cpp/oc/vd-shoot'}`
          : `${config.url}${config.routePrefix}/${summary.actionType}/dispatch`;

      // 打印请求详情（只针对 image-to-image）
      if (summary.actionType === 'image-to-image') {
        logger.info(
          {
            dispatchUrl,
            jobId: summary.id,
            actionType: summary.actionType,
            mode: normalizeOptionalString(summary.formData?.mode) || 'lifestyle',
            assetCount: summary.assets.length,
            hasCallbackToken: Boolean(config.fromGatewayToken),
          },
          'Image-to-image dispatch request'
        );
      }

      try {
        const response = await fetchImpl(dispatchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.toGatewayToken ? { Authorization: `Bearer ${config.toGatewayToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.warn('Media action gateway rejected dispatch', {
            status: response.status,
            error: errorText,
            jobId: summary.id,
          });
          return {
            accepted: false,
            error: `Gateway returned ${response.status}: ${errorText}`,
          };
        }

        const result = await response.json().catch(() => ({}));

        // 订阅 SSE（如果 Gateway 返回了 eventsPath）
        // Gateway 响应结构: { ok: true, routeId: "...", taskId: "...", progress: { eventsPath: "..." } }
        const responseData = result as Record<string, unknown>;
        const routeId =
          (responseData.routeId as string) ||
          (summary.actionType === 'image-to-image' ? 'cpp-vd-shoot' : `cpp-${summary.actionType}`);
        const progressData = responseData.progress as Record<string, unknown> | undefined;
        const eventsPath = (progressData?.eventsPath as string) || undefined;
        const taskId = extractExternalTaskId(result) || summary.id;

        if (options.sseManager && eventsPath) {
          const externalTaskId = taskId;
          await options.sseManager.subscribe(
            summary.id,
            eventsPath,
            externalTaskId,
            routeId,
            taskId
          );
        }

        // 派发成功，记录超时 key（2分钟后开始，5分钟超时）
        const shouldTrackTimeout = options.trackTimeout ?? !options.fetchImpl;
        if (shouldTrackTimeout) {
          const timeoutMinutes = parseInt(
            process.env.MEDIA_ACTION_TIMEOUT_MINUTES || String(DEFAULT_TIMEOUT_MINUTES),
            10
          );
          const timeoutStartDelay = 2; // 2分钟后才开始检查
          const timeoutKey = `${TIMEOUT_KEY_PREFIX}${summary.id}`;
          const redis = getRedisClient();
          await redis.setex(timeoutKey, (timeoutMinutes + timeoutStartDelay) * 60, 'pending');
        }

        return {
          accepted: true,
          externalTaskId: taskId,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Media action dispatch failed', { error: message, jobId: summary.id });
        return {
          accepted: false,
          error: message,
        };
      }
    },
  };
}

/**
 * 清除 media action 的超时 key（回调成功时调用）
 */
export async function clearMediaActionTimeout(jobId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${TIMEOUT_KEY_PREFIX}${jobId}`);
}

/**
 * 获取已超时的 media action jobId 列表
 */
export async function getTimedOutMediaActions(): Promise<string[]> {
  const redis = getRedisClient();
  const keys = await redis.keys(`${TIMEOUT_KEY_PREFIX}*`);
  return keys.map((key) => key.replace(TIMEOUT_KEY_PREFIX, ''));
}
