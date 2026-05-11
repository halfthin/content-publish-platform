import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';
import { getChannelRouter } from '../services/channel-router';
import { getProgressEventBus } from '../services/progress-event-bus';

const logger = createLogger('routes:xhs');

export function setupXhsRoutes() {
  return new Elysia({ prefix: '/api/xhs' })

    .get('/login/qrcode', async ({ query, error }) => {
      const instanceName = (query as { instance?: string }).instance || 'xhs-1';
      const router = getChannelRouter();
      const publisher = router.get(`xiaohongshu:${instanceName}`);
      if (!publisher || !publisher.startAuth) {
        return error(404, { success: false, error: 'MCP instance not found' });
      }

      const result = await publisher.startAuth();
      getProgressEventBus().emit({
        type: 'auth',
        platform: 'xiaohongshu',
        instance: instanceName,
        status: 'qr_ready',
      });

      return { success: true, data: result };
    })

    .get('/login/status', async ({ query, error }) => {
      const instanceName = (query as { instance?: string }).instance || 'xhs-1';
      const router = getChannelRouter();
      const publisher = router.get(`xiaohongshu:${instanceName}`);
      if (!publisher) {
        return error(404, { success: false, error: 'MCP instance not found' });
      }

      const status = await publisher.checkAuth();
      if (status.loggedIn) {
        getProgressEventBus().emit({
          type: 'auth',
          platform: 'xiaohongshu',
          instance: instanceName,
          status: 'logged_in',
        });
      }

      return { success: true, data: status };
    })

    .post('/login/refresh', async ({ query, error }) => {
      const instanceName = (query as { instance?: string }).instance || 'xhs-1';
      const router = getChannelRouter();
      const publisher = router.get(`xiaohongshu:${instanceName}`);
      if (!publisher || !publisher.refreshAuth) {
        return error(404, { success: false, error: 'MCP instance not found' });
      }

      const result = await publisher.refreshAuth();
      return { success: true, data: result };
    })

    .post('/publish', async ({ body, error }) => {
      const {
        accountId,
        accountName,
        title,
        content,
        images,
        tags,
        scheduleAt,
        visibility,
        isOriginal,
        products,
      } = body as Record<string, unknown>;

      if (!accountId || !title || !content) {
        return error(400, { success: false, error: 'accountId, title, content required' });
      }

      const { getPublishQueue } = await import('../queues/publish-queue');
      const job = await getPublishQueue().addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        platform: 'xiaohongshu',
        content: {
          title: title as string,
          description: content as string,
          images: images as string[] | undefined,
          tags: tags as string[] | undefined,
        },
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    })

    .post('/publish/video', async ({ body, error }) => {
      const { accountId, title, content, video, tags, visibility } = body as Record<
        string,
        unknown
      >;

      if (!accountId || !title || !content || !video) {
        return error(400, { success: false, error: 'accountId, title, content, video required' });
      }

      const { getPublishQueue } = await import('../queues/publish-queue');
      const job = await getPublishQueue().addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        platform: 'xiaohongshu',
        content: {
          title: title as string,
          description: content as string,
          video: video as string,
          tags: tags as string[] | undefined,
        },
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    });
}
