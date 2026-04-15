import { randomUUID } from 'node:crypto';
import {
  getMediaActionGatewayConfig,
  IMAGE_TO_IMAGE_MODES,
  MEDIA_ACTION_DEFINITIONS,
  type MediaActionDefinition,
  type MediaActionStatus,
  type MediaActionType,
} from '../config/media-actions';
import { getRedisClient } from '../config/redis';
import type { MediaLibraryService } from './media-library.service';
import { MediaLibraryError } from './media-library.service';
import { clearMediaActionTimeout } from './media-action-dispatcher';

const SUMMARY_KEY_PREFIX = 'media:action:summary:';
const EXTERNAL_KEY_PREFIX = 'media:action:external:';
const RECENT_KEY = 'media:actions:recent:v1';
const RECENT_LIMIT = 200;

export interface MediaActionAssetInput {
  rootId: string;
  relativePath: string;
}

export interface MediaActionAssetSnapshot extends MediaActionAssetInput {
  assetKey: string;
  filename: string;
  parentPath: string;
  mimeType: string;
  sourcePath: string;
  fileUrl: string;
  thumbUrl: string;
}

export interface MediaActionSummary {
  id: string;
  actionType: MediaActionType;
  status: MediaActionStatus;
  operator?: string;
  assets: MediaActionAssetSnapshot[];
  formData: Record<string, unknown>;
  context?: {
    workspaceDatePath?: string;
    favoritePaths?: string[];
  };
  externalTaskId?: string;
  error?: string;
  callbackPayload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMediaActionInput {
  actionType: MediaActionType;
  operator?: string;
  assets: MediaActionAssetInput[];
  formData?: Record<string, unknown>;
  context?: {
    workspaceDatePath?: string;
    favoritePaths?: string[];
  };
}

export interface MediaActionCallbackPayload {
  jobId?: string;
  taskId?: string;
  actionType: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'needs-auth';
  error?: string;
  result?: Record<string, unknown>;
  timestamp?: string;
  refs?: {
    mediaActionId?: string | null;
  };
}

export interface MediaActionDispatchResult {
  accepted: boolean;
  externalTaskId?: string;
  error?: string;
}

export interface MediaActionDispatcher {
  dispatch(summary: MediaActionSummary): Promise<MediaActionDispatchResult>;
}

export interface MediaActionExecutor {
  enqueue(jobId: string): Promise<void>;
}

export interface MediaActionStore {
  put(summary: MediaActionSummary): Promise<void>;
  get(id: string): Promise<MediaActionSummary | null>;
  listRecent(limit?: number): Promise<MediaActionSummary[]>;
  mapExternalTaskId(externalTaskId: string, jobId: string): Promise<void>;
  getJobIdByExternalTaskId(externalTaskId: string): Promise<string | null>;
  delete(id: string): Promise<MediaActionSummary | null>;
}

class RedisMediaActionStore implements MediaActionStore {
  async put(summary: MediaActionSummary): Promise<void> {
    const redis = getRedisClient();
    await redis.set(`${SUMMARY_KEY_PREFIX}${summary.id}`, JSON.stringify(summary));
    await redis.lrem(RECENT_KEY, 0, summary.id);
    await redis.lpush(RECENT_KEY, summary.id);
    await redis.ltrim(RECENT_KEY, 0, RECENT_LIMIT - 1);

    if (summary.externalTaskId) {
      await redis.set(`${EXTERNAL_KEY_PREFIX}${summary.externalTaskId}`, summary.id);
    }
  }

  async get(id: string): Promise<MediaActionSummary | null> {
    const raw = await getRedisClient().get(`${SUMMARY_KEY_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as MediaActionSummary) : null;
  }

  async listRecent(limit: number = 50): Promise<MediaActionSummary[]> {
    const ids = await getRedisClient().lrange(RECENT_KEY, 0, Math.max(limit - 1, 0));
    if (ids.length === 0) {
      return [];
    }

    const values = await getRedisClient().mget(ids.map((id) => `${SUMMARY_KEY_PREFIX}${id}`));
    return values
      .filter((value): value is string => Boolean(value))
      .map((value) => JSON.parse(value) as MediaActionSummary);
  }

  async mapExternalTaskId(externalTaskId: string, jobId: string): Promise<void> {
    await getRedisClient().set(`${EXTERNAL_KEY_PREFIX}${externalTaskId}`, jobId);
  }

  async getJobIdByExternalTaskId(externalTaskId: string): Promise<string | null> {
    return getRedisClient().get(`${EXTERNAL_KEY_PREFIX}${externalTaskId}`);
  }

  async delete(id: string): Promise<MediaActionSummary | null> {
    const redis = getRedisClient();
    const key = `${SUMMARY_KEY_PREFIX}${id}`;
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }

    const summary = JSON.parse(raw) as MediaActionSummary;
    await redis.del(key);
    await redis.lrem(RECENT_KEY, 0, id);
    if (summary.externalTaskId) {
      await redis.del(`${EXTERNAL_KEY_PREFIX}${summary.externalTaskId}`);
    }

    return summary;
  }
}

export function createRedisMediaActionStore(): MediaActionStore {
  return new RedisMediaActionStore();
}

export function createInMemoryMediaActionStore(
  initial: MediaActionSummary[] = []
): MediaActionStore {
  const records = new Map(initial.map((record) => [record.id, record]));
  const recentIds = initial.map((record) => record.id);
  const externalMap = new Map<string, string>();

  for (const record of initial) {
    if (record.externalTaskId) {
      externalMap.set(record.externalTaskId, record.id);
    }
  }

  return {
    async put(summary) {
      records.set(summary.id, { ...summary });
      const existingIndex = recentIds.indexOf(summary.id);
      if (existingIndex !== -1) {
        recentIds.splice(existingIndex, 1);
      }
      recentIds.unshift(summary.id);
      recentIds.splice(RECENT_LIMIT);
      if (summary.externalTaskId) {
        externalMap.set(summary.externalTaskId, summary.id);
      }
    },
    async get(id) {
      const record = records.get(id);
      return record ? { ...record } : null;
    },
    async listRecent(limit = 50) {
      return recentIds
        .slice(0, limit)
        .map((id) => records.get(id))
        .filter((record): record is MediaActionSummary => Boolean(record))
        .map((record) => ({ ...record }));
    },
    async mapExternalTaskId(externalTaskId, jobId) {
      externalMap.set(externalTaskId, jobId);
    },
    async getJobIdByExternalTaskId(externalTaskId) {
      return externalMap.get(externalTaskId) || null;
    },
    async delete(id) {
      const record = records.get(id);
      if (!record) {
        return null;
      }

      records.delete(id);
      const existingIndex = recentIds.indexOf(id);
      if (existingIndex !== -1) {
        recentIds.splice(existingIndex, 1);
      }
      if (record.externalTaskId) {
        externalMap.delete(record.externalTaskId);
      }

      return { ...record };
    },
  };
}

export function createNoopMediaActionExecutor(): MediaActionExecutor {
  return {
    async enqueue() {
      // no-op for tests or local dry runs
    },
  };
}

function getActionDefinition(actionType: string): MediaActionDefinition {
  const definition = MEDIA_ACTION_DEFINITIONS.find((item) => item.type === actionType);
  if (!definition) {
    throw new MediaLibraryError('INVALID_PATH', `Unsupported media action: ${actionType}`, 400);
  }
  return definition;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validateActionInput(input: CreateMediaActionInput) {
  if (input.actionType !== 'image-to-image') {
    return;
  }

  const mode = normalizeOptionalString(input.formData?.mode);
  if (!mode) {
    throw new MediaLibraryError('INVALID_PATH', '图生图模式 mode 必填', 400);
  }

  if (!IMAGE_TO_IMAGE_MODES.includes(mode as (typeof IMAGE_TO_IMAGE_MODES)[number])) {
    throw new MediaLibraryError('INVALID_PATH', `Unsupported image-to-image mode: ${mode}`, 400);
  }
}

function buildAssetUrls(assetKey: string) {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:50000';
  return {
    fileUrl: `${baseUrl}/api/media/file/${assetKey}`,
    thumbUrl: `${baseUrl}/api/media/thumb/${assetKey}`,
  };
}

function canRetryAction(status: MediaActionStatus): boolean {
  return status === 'FAILED' || status === 'NEEDS_AUTH';
}

export interface MediaActionsService {
  getDefinitions(): MediaActionDefinition[];
  submit(input: CreateMediaActionInput): Promise<MediaActionSummary>;
  getAction(id: string): Promise<MediaActionSummary | null>;
  listRecent(limit?: number): Promise<MediaActionSummary[]>;
  retryAction(id: string): Promise<MediaActionSummary>;
  deleteAction(id: string): Promise<MediaActionSummary>;
  updateStatus(
    id: string,
    status: MediaActionStatus,
    extra?: Partial<MediaActionSummary>
  ): Promise<MediaActionSummary>;
  handleCallback(payload: MediaActionCallbackPayload): Promise<MediaActionSummary>;
}

export function createMediaActionsService(options: {
  mediaService: MediaLibraryService;
  store?: MediaActionStore;
  executor?: MediaActionExecutor;
}): MediaActionsService {
  const store = options.store || createRedisMediaActionStore();
  const executor = options.executor || createNoopMediaActionExecutor();

  return {
    getDefinitions() {
      const gatewayConfig = getMediaActionGatewayConfig();

      return MEDIA_ACTION_DEFINITIONS.map((definition) =>
        definition.type === 'image-to-image'
          ? {
              ...definition,
              dispatchMethod: 'POST' as const,
              dispatchPathname: gatewayConfig.imageToImageDispatchPath,
            }
          : definition
      );
    },

    async submit(input) {
      const definition = getActionDefinition(input.actionType);
      if (!input.assets || input.assets.length === 0) {
        throw new MediaLibraryError('INVALID_PATH', 'At least one image is required', 400);
      }
      validateActionInput(input);

      const enrichedAssets = await Promise.all(
        input.assets.map(async (assetInput) => {
          const asset = await options.mediaService.resolveAsset(
            options.mediaService.encodeAssetKey(assetInput.rootId, assetInput.relativePath)
          );
          return {
            rootId: asset.rootId,
            relativePath: asset.relativePath,
            assetKey: asset.assetKey,
            filename: asset.filename,
            parentPath: asset.parentPath,
            mimeType: asset.mimeType,
            sourcePath: asset.absolutePath,
            ...buildAssetUrls(asset.assetKey),
          } satisfies MediaActionAssetSnapshot;
        })
      );

      const now = new Date().toISOString();
      const summary: MediaActionSummary = {
        id: randomUUID(),
        actionType: definition.type,
        status: 'QUEUED',
        operator: input.operator,
        assets: enrichedAssets,
        formData: input.formData || {},
        context: input.context,
        createdAt: now,
        updatedAt: now,
      };

      await store.put(summary);
      await executor.enqueue(summary.id);
      return summary;
    },

    async getAction(id) {
      return store.get(id);
    },

    async listRecent(limit) {
      return store.listRecent(limit);
    },

    async retryAction(id) {
      const current = await store.get(id);
      if (!current) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Media action not found', 404);
      }

      if (!canRetryAction(current.status)) {
        throw new MediaLibraryError(
          'INVALID_PATH',
          'Only FAILED or NEEDS_AUTH media actions can be retried',
          400
        );
      }

      return this.submit({
        actionType: current.actionType,
        operator: current.operator,
        assets: current.assets.map((asset) => ({
          rootId: asset.rootId,
          relativePath: asset.relativePath,
        })),
        formData: current.formData,
        context: current.context,
      });
    },

    async deleteAction(id) {
      const deleted = await store.delete(id);
      if (!deleted) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Media action not found', 404);
      }

      return deleted;
    },

    async updateStatus(id, status, extra = {}) {
      const current = await store.get(id);
      if (!current) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Media action not found', 404);
      }

      const updated: MediaActionSummary = {
        ...current,
        ...extra,
        status,
        updatedAt: new Date().toISOString(),
      };
      await store.put(updated);
      if (updated.externalTaskId) {
        await store.mapExternalTaskId(updated.externalTaskId, updated.id);
      }
      return updated;
    },

    async handleCallback(payload) {
      const jobId =
        payload.jobId ||
        payload.refs?.mediaActionId ||
        (payload.taskId ? await store.getJobIdByExternalTaskId(payload.taskId) : null);
      if (!jobId) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Media action not found for callback', 404);
      }

      const statusMap: Record<MediaActionCallbackPayload['status'], MediaActionStatus> = {
        queued: 'DISPATCHED',
        running: 'RUNNING',
        'needs-auth': 'NEEDS_AUTH',
        success: 'SUCCESS',
        failed: 'FAILED',
      };

      const newStatus = statusMap[payload.status];
      const result = await this.updateStatus(jobId, newStatus, {
        externalTaskId: payload.taskId,
        error: payload.error,
        callbackPayload: {
          actionType: payload.actionType,
          status: payload.status,
          result: payload.result,
          timestamp: payload.timestamp,
          refs: payload.refs,
        },
      });

      // 终态（成功/失败/需要认证）时清除超时 key
      if (newStatus === 'SUCCESS' || newStatus === 'FAILED' || newStatus === 'NEEDS_AUTH') {
        await clearMediaActionTimeout(jobId);
      }

      return result;
    },
  };
}
