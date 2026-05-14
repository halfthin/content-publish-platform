import { Elysia } from 'elysia';
import type { PublishJobData } from '../queues/publish-queue';
import { getChannelRouter } from '../services/channel-router';
import { getProgressEventBus } from '../services/progress-event-bus';

export interface XhsRouteQueue {
  addJob(jobData: PublishJobData): Promise<{ id?: string }>;
}

interface SetupXhsRoutesOptions {
  getQueue?: () => Promise<XhsRouteQueue> | XhsRouteQueue;
}

async function resolveQueue(options: SetupXhsRoutesOptions): Promise<XhsRouteQueue> {
  if (options.getQueue) {
    return options.getQueue();
  }

  const { getPublishQueue } = await import('../queues/publish-queue');
  return getPublishQueue();
}

export function setupXhsRoutes(options: SetupXhsRoutesOptions = {}) {
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

      const queue = await resolveQueue(options);
      const job = await queue.addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        accountName: typeof accountName === 'string' ? accountName : undefined,
        action: 'publish',
        platform: 'xiaohongshu',
        content: {
          title: title as string,
          description: content as string,
          images: images as string[] | undefined,
          tags: tags as string[] | undefined,
          scheduleAt: scheduleAt as string | undefined,
          visibility: visibility as string | undefined,
          isOriginal: isOriginal as boolean | undefined,
          products,
        },
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    })

    .post('/publish/video', async ({ body, error }) => {
      const { accountId, accountName, title, content, video, tags, visibility, products } =
        body as Record<string, unknown>;

      if (!accountId || !title || !content || !video) {
        return error(400, { success: false, error: 'accountId, title, content, video required' });
      }

      const queue = await resolveQueue(options);
      const job = await queue.addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        accountName: typeof accountName === 'string' ? accountName : undefined,
        action: 'publish_video',
        platform: 'xiaohongshu',
        content: {
          title: title as string,
          description: content as string,
          video: video as string,
          tags: tags as string[] | undefined,
          visibility: visibility as string | undefined,
          products,
        },
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    });
}
