import { Elysia, t } from 'elysia';
import { createLogger } from '../config/logger';
import {
  createMediaFavoritesService,
  type MediaFavoritesService,
} from '../services/media-favorites.service';
import {
  createMediaLibraryService,
  MediaLibraryError,
  type MediaLibraryService,
} from '../services/media-library.service';
import { getThumbBuffer } from '../services/media-thumb-cache.service';

const logger = createLogger('media-route');

interface SetupMediaRoutesOptions {
  service?: MediaLibraryService;
  favoritesService?: MediaFavoritesService;
}

function handleMediaError(error: unknown, set: { status?: number }) {
  if (error instanceof MediaLibraryError) {
    set.status = error.status;
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  logger.error('Unhandled media route error', { error: String(error) });
  set.status = 500;
  return {
    success: false,
    error: 'Internal server error',
  };
}

export function setupMediaRoutes(options: SetupMediaRoutesOptions = {}) {
  const service = options.service || createMediaLibraryService();
  const favoritesService =
    options.favoritesService || createMediaFavoritesService({ mediaService: service });

  return new Elysia({ prefix: '/api/media' })
    .get('/roots', async () => ({ success: true, data: await service.getRoots() }))
    .get('/favorites', async ({ set }) => {
      try {
        return {
          success: true,
          data: await favoritesService.listFavorites(),
        };
      } catch (error) {
        return handleMediaError(error, set);
      }
    })
    .post(
      '/favorites',
      async ({ body, set }) => {
        try {
          return {
            success: true,
            data: await favoritesService.addFavorite(body),
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        body: t.Object({
          rootId: t.String(),
          relativePath: t.String(),
          label: t.Optional(t.String()),
          pinned: t.Optional(t.Boolean()),
        }),
      }
    )
    .patch(
      '/favorites/:id',
      async ({ params, body, set }) => {
        try {
          return {
            success: true,
            data: await favoritesService.updateFavorite(params.id, body),
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          label: t.Optional(t.String()),
          pinned: t.Optional(t.Boolean()),
        }),
      }
    )
    .delete(
      '/favorites/:id',
      async ({ params, set }) => {
        try {
          await favoritesService.deleteFavorite(params.id);
          return {
            success: true,
            data: { id: params.id },
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      }
    )
    .get(
      '/date-tree',
      async ({ query, set }) => {
        try {
          return {
            success: true,
            data: await service.getDateTree(query.rootId),
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        query: t.Object({
          rootId: t.Optional(t.String()),
        }),
      }
    )
    .get(
      '/folder-tree',
      async ({ query, set }) => {
        try {
          return {
            success: true,
            data: await service.getFolderTree(query.rootId || 'regal', query.path || ''),
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        query: t.Object({
          rootId: t.Optional(t.String()),
          path: t.Optional(t.String()),
        }),
      }
    )
    .get(
      '/folder-summary',
      async ({ query, set }) => {
        try {
          return {
            success: true,
            data: await service.getFolderSummary(query.rootId, query.path),
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        query: t.Object({
          rootId: t.String(),
          path: t.Optional(t.String()),
        }),
      }
    )
    .get(
      '/items',
      async ({ query, set }) => {
        try {
          return {
            success: true,
            data: await service.getItems({
              rootId: query.rootId,
              path: query.path,
              recursive: query.recursive === 'true' || query.recursive === true,
              limit: typeof query.limit === 'number' ? query.limit : Number(query.limit || 120),
              cursor: query.cursor,
            }),
          };
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        query: t.Object({
          rootId: t.String(),
          path: t.Optional(t.String()),
          recursive: t.Optional(t.Union([t.Boolean(), t.String()])),
          limit: t.Optional(t.Union([t.Numeric(), t.String()])),
          cursor: t.Optional(t.String()),
        }),
      }
    )
    .get(
      '/tags',
      async ({ query, set }) => {
        const { rootId, path } = query as { rootId?: string; path?: string };
        if (!rootId || !path) {
          set.status = 400;
          return { success: false, error: 'rootId and path are required' };
        }
        const { getTagsForFolder } = await import('../services/media-library.service');
        const tags = await getTagsForFolder(rootId, path);
        return { success: true, data: tags };
      },
      {
        query: t.Object({
          rootId: t.String(),
          path: t.String(),
        }),
      }
    )
    .post(
      '/tags',
      async ({ body, set }) => {
        const { rootId, path, tags } = body as {
          rootId: string;
          path: string;
          tags: Record<string, string[]>;
        };
        if (!rootId || !path || !tags) {
          set.status = 400;
          return { success: false, error: 'rootId, path, and tags are required' };
        }
        const { setTagsForFolder } = await import('../services/media-library.service');
        await setTagsForFolder(rootId, path, tags);
        return { success: true };
      },
      {
        body: t.Object({
          rootId: t.String(),
          path: t.String(),
          tags: t.Record(t.String(), t.Array(t.String())),
        }),
      }
    )
    .get(
      '/thumb/:assetKey',
      async ({ params, set }) => {
        try {
          const resolved = await service.resolveAsset(params.assetKey);
          const { buffer, mimeType, fromCache } = await getThumbBuffer(
            resolved.absolutePath,
            params.assetKey
          );
          const headers: Record<string, string> = {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=300',
          };
          if (fromCache) {
            headers['X-Thumb-Cache'] = 'HIT';
          }
          return new Response(buffer, { headers });
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        params: t.Object({
          assetKey: t.String(),
        }),
      }
    )
    .get(
      '/file/:assetKey',
      async ({ params, set }) => {
        try {
          const file = await service.readAsset(params.assetKey);
          return new Response(file.buffer, {
            headers: {
              'Content-Type': file.mimeType,
              'Cache-Control': 'public, max-age=60',
            },
          });
        } catch (error) {
          return handleMediaError(error, set);
        }
      },
      {
        params: t.Object({
          assetKey: t.String(),
        }),
      }
    );
}
