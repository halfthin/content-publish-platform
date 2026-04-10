import { Elysia, t } from 'elysia';
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
    );
}
