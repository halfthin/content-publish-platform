import { Elysia } from 'elysia';
import { enqueuePublish } from '../services/queue-client';

export function setupPublishRoutes() {
  return new Elysia({ prefix: '/api/publish' }).post('/', async ({ body, set }) => {
    const {
      platform,
      accountId,
      contentId: bodyContentId,
      accountName,
      action,
      payload,
    } = body as Record<string, unknown>;

    if (!platform || !accountId || !action) {
      set.status = 400;
      return { success: false, error: 'platform, accountId, action required' };
    }

    const { taskId } = await enqueuePublish(platform as string, {
      contentId: (bodyContentId || accountId) as string,
      accountId: accountId as string,
      accountName: typeof accountName === 'string' ? accountName : undefined,
      action: action as string,
      platform: platform as string,
      content: payload as Record<string, unknown>,
    });

    set.status = 202;
    return {
      success: true,
      data: {
        taskId,
        streamUrl: `/api/queue-proxy/tasks/${taskId}/stream`,
        statusUrl: `/api/queue-proxy/tasks/${taskId}`,
      },
    };
  });
}
