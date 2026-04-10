import { randomUUID } from 'node:crypto';
import {
  MEDIA_ACTION_DEFINITIONS,
  type MediaActionDefinition,
  type MediaActionStatus,
  type MediaActionType,
} from '../config/media-actions';
import { getRedisClient } from '../config/redis';
import type { MediaLibraryService } from './media-library.service';
import { MediaLibraryError } from './media-library.service';

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
  status: 'queued' | 'running' | 'success' | 'failed';
  error?: string;
  result?: Record<string, unknown>;
  timestamp?: string;
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

function buildAssetUrls(assetKey: string) {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:50000';
  return {
    fileUrl: `${baseUrl}/api/media/file/${assetKey}`,
    thumbUrl: `${baseUrl}/api/media/thumb/${assetKey}`,
  };
}

export interface MediaActionsService {
  getDefinitions(): MediaActionDefinition[];
  submit(input: CreateMediaActionInput): Promise<MediaActionSummary>;
  getAction(id: string): Promise<MediaActionSummary | null>;
  listRecent(limit?: number): Promise<MediaActionSummary[]>;
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
      return MEDIA_ACTION_DEFINITIONS;
    },

    async submit(input) {
      const definition = getActionDefinition(input.actionType);
      if (!input.assets || input.assets.length === 0) {
        throw new MediaLibraryError('INVALID_PATH', 'At least one image is required', 400);
      }

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
        (payload.taskId ? await store.getJobIdByExternalTaskId(payload.taskId) : null);
      if (!jobId) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Media action not found for callback', 404);
      }

      const statusMap: Record<MediaActionCallbackPayload['status'], MediaActionStatus> = {
        queued: 'DISPATCHED',
        running: 'RUNNING',
        success: 'SUCCESS',
        failed: 'FAILED',
      };

      return this.updateStatus(jobId, statusMap[payload.status], {
        externalTaskId: payload.taskId,
        error: payload.error,
        callbackPayload: {
          actionType: payload.actionType,
          status: payload.status,
          result: payload.result,
          timestamp: payload.timestamp,
        },
      });
    },
  };
}
