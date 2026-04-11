import * as fs from 'node:fs/promises';
import { dirname, extname, posix } from 'node:path';
import { Elysia, t } from 'elysia';
import { fileTypeFromBuffer } from 'file-type';
import { createLogger } from '../config/logger';
import { getMediaActionQueueExecutor } from '../queues/media-action-queue';
import {
  createMediaActionsService,
  createRedisMediaActionStore,
  type MediaActionsService,
} from '../services/media-actions.service';
import { createMediaLibraryService, MediaLibraryError } from '../services/media-library.service';

const logger = createLogger('media-actions-route');

interface SetupMediaActionRoutesOptions {
  actionService?: MediaActionsService;
}

interface MediaActionUploadFileRecord {
  absolutePath?: string;
  relativePath?: string;
  mimeType?: string;
}

interface MediaActionUploadDescriptor {
  directoryAbsolutePath?: string;
  directory?: string;
  manifestPath?: string;
  manifestAbsolutePath?: string;
  files: MediaActionUploadFileRecord[];
}

function handleMediaActionError(error: unknown, set: { status?: number }) {
  if (error instanceof MediaLibraryError) {
    set.status = error.status;
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  logger.error('Unhandled media action route error', { error: String(error) });
  set.status = 500;
  return {
    success: false,
    error: 'Internal server error',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUploadRequestPath(path: string): string {
  const decoded = decodeURIComponent(path).trim().replaceAll('\\', '/');
  if (!decoded || decoded.startsWith('/')) {
    throw new MediaLibraryError('INVALID_PATH', 'Invalid upload file path', 400);
  }

  const normalized = posix.normalize(decoded).replace(/^\.\//, '');
  if (
    !normalized ||
    normalized === '.' ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new MediaLibraryError('INVALID_PATH', 'Invalid upload file path', 400);
  }

  return normalized;
}

function extractUploadDescriptor(
  callbackPayload: Record<string, unknown> | undefined
): MediaActionUploadDescriptor | null {
  const result = isRecord(callbackPayload?.result) ? callbackPayload.result : null;
  const extra = isRecord(result?.extra) ? result.extra : null;
  const upload = isRecord(extra?.upload) ? extra.upload : null;
  if (!upload) {
    return null;
  }

  const files = Array.isArray(upload.files)
    ? upload.files.filter((item): item is MediaActionUploadFileRecord => isRecord(item))
    : [];

  return {
    directory: typeof upload.directory === 'string' ? upload.directory : undefined,
    directoryAbsolutePath:
      typeof upload.directoryAbsolutePath === 'string' ? upload.directoryAbsolutePath : undefined,
    manifestPath: typeof upload.manifestPath === 'string' ? upload.manifestPath : undefined,
    manifestAbsolutePath:
      typeof upload.manifestAbsolutePath === 'string' ? upload.manifestAbsolutePath : undefined,
    files,
  };
}

function resolveUploadCleanupPath(descriptor: MediaActionUploadDescriptor): string | null {
  if (descriptor.directoryAbsolutePath) {
    return descriptor.directoryAbsolutePath;
  }

  if (descriptor.manifestAbsolutePath) {
    return dirname(descriptor.manifestAbsolutePath);
  }

  const firstAbsoluteFilePath = descriptor.files.find(
    (file) => typeof file.absolutePath === 'string'
  )?.absolutePath;
  return firstAbsoluteFilePath ? dirname(firstAbsoluteFilePath) : null;
}

function resolveUploadFile(
  descriptor: MediaActionUploadDescriptor,
  requestedPath: string
): MediaActionUploadFileRecord | null {
  const normalizedRequestPath = normalizeUploadRequestPath(requestedPath);

  if (descriptor.manifestPath === normalizedRequestPath) {
    return {
      relativePath: descriptor.manifestPath,
      absolutePath: descriptor.manifestAbsolutePath,
      mimeType: 'application/json',
    };
  }

  return (
    descriptor.files.find((file) => {
      return typeof file.relativePath === 'string' && file.relativePath === normalizedRequestPath;
    }) || null
  );
}

function getFallbackContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

export function setupMediaActionRoutes(options: SetupMediaActionRoutesOptions = {}) {
  const actionService =
    options.actionService ||
    createMediaActionsService({
      mediaService: createMediaLibraryService(),
      store: createRedisMediaActionStore(),
      executor: getMediaActionQueueExecutor(),
    });

  return new Elysia({ prefix: '/api/media/actions' })
    .get('/definitions', async () => ({ success: true, data: actionService.getDefinitions() }))
    .get(
      '/',
      async ({ query, set }) => {
        try {
          return {
            success: true,
            data: await actionService.listRecent(query.limit || 20),
          };
        } catch (error) {
          return handleMediaActionError(error, set);
        }
      },
      {
        query: t.Object({
          limit: t.Optional(t.Numeric()),
        }),
      }
    )
    .post(
      '/',
      async ({ body, set }) => {
        try {
          return {
            success: true,
            data: await actionService.submit(body),
          };
        } catch (error) {
          return handleMediaActionError(error, set);
        }
      },
      {
        body: t.Object({
          actionType: t.String(),
          operator: t.Optional(t.String()),
          assets: t.Array(
            t.Object({
              rootId: t.String(),
              relativePath: t.String(),
            })
          ),
          formData: t.Optional(t.Record(t.String(), t.Any())),
          context: t.Optional(
            t.Object({
              workspaceDatePath: t.Optional(t.String()),
              favoritePaths: t.Optional(t.Array(t.String())),
            })
          ),
        }),
      }
    )
    .get(
      '/:id',
      async ({ params, set }) => {
        try {
          const action = await actionService.getAction(params.id);
          if (!action) {
            set.status = 404;
            return {
              success: false,
              error: 'Media action not found',
            };
          }

          return {
            success: true,
            data: action,
          };
        } catch (error) {
          return handleMediaActionError(error, set);
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      }
    )
    .post(
      '/:id/retry',
      async ({ params, set }) => {
        try {
          return {
            success: true,
            data: await actionService.retryAction(params.id),
          };
        } catch (error) {
          return handleMediaActionError(error, set);
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      }
    )
    .delete(
      '/:id',
      async ({ params, set }) => {
        try {
          const action = await actionService.getAction(params.id);
          if (!action) {
            set.status = 404;
            return {
              success: false,
              error: 'Media action not found',
            };
          }

          const descriptor = extractUploadDescriptor(action.callbackPayload);
          const cleanupPath = descriptor ? resolveUploadCleanupPath(descriptor) : null;

          if (cleanupPath) {
            await fs.rm(cleanupPath, { recursive: true, force: true });
          }

          const deleted = await actionService.deleteAction(params.id);
          return {
            success: true,
            data: {
              id: deleted.id,
              removedUploadDirectory: descriptor?.directory || null,
            },
          };
        } catch (error) {
          return handleMediaActionError(error, set);
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      }
    )
    .get(
      '/:id/uploads/*',
      async ({ params, request, set }) => {
        try {
          const action = await actionService.getAction(params.id);
          if (!action) {
            set.status = 404;
            return {
              success: false,
              error: 'Media action not found',
            };
          }

          const descriptor = extractUploadDescriptor(action.callbackPayload);
          if (!descriptor) {
            set.status = 404;
            return {
              success: false,
              error: 'Upload file not found',
            };
          }

          const url = new URL(request.url);
          const pathParts = url.pathname.split('/').filter(Boolean);
          const uploadIndex = pathParts.indexOf('uploads');
          const rawRequestedPath =
            uploadIndex >= 0 ? pathParts.slice(uploadIndex + 1).join('/') : '';

          const matchedFile = resolveUploadFile(descriptor, rawRequestedPath);
          if (!matchedFile?.absolutePath) {
            set.status = 404;
            return {
              success: false,
              error: 'Upload file not found',
            };
          }

          const fileBuffer = await fs.readFile(matchedFile.absolutePath);
          const detectedType = await fileTypeFromBuffer(fileBuffer);
          set.headers['Content-Type'] =
            detectedType?.mime ||
            matchedFile.mimeType ||
            getFallbackContentType(matchedFile.relativePath || matchedFile.absolutePath);

          return fileBuffer;
        } catch (error) {
          return handleMediaActionError(error, set);
        }
      },
      {
        params: t.Object({
          id: t.String(),
          '*': t.Any(),
        }),
      }
    );
}
