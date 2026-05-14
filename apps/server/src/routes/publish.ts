import { Elysia } from 'elysia';
import type { PublishJobData } from '../queues/publish-queue';
import { getProgressEventBus } from '../services/progress-event-bus';
import { getSseServerManager } from '../services/sse-server-manager';

export interface PublishRouteQueue {
  addJob(jobData: PublishJobData): Promise<{ id?: string }>;
  getJobState(jobId: string): Promise<string | undefined>;
}

interface SetupPublishRoutesOptions {
  getQueue?: () => Promise<PublishRouteQueue> | PublishRouteQueue;
}

async function resolveQueue(options: SetupPublishRoutesOptions): Promise<PublishRouteQueue> {
  if (options.getQueue) {
    return options.getQueue();
  }

  const { getPublishQueue } = await import('../queues/publish-queue');
  return getPublishQueue();
}

export function setupPublishRoutes(options: SetupPublishRoutesOptions = {}) {
  return (
    new Elysia({ prefix: '/api/publish' })

      // 通用发布入口
      .post('/', async ({ body, set }) => {
        const { platform, accountId, accountName, action, payload } = body as Record<
          string,
          unknown
        >;

        if (!platform || !accountId || !action) {
          set.status = 400;
          return { success: false, error: 'platform, accountId, action required' };
        }

        const queue = await resolveQueue(options);
        const job = await queue.addJob({
          contentId: accountId as string,
          accountId: accountId as string,
          accountName: typeof accountName === 'string' ? accountName : undefined,
          action: action as string,
          platform: platform as 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat',
          content: payload as Record<string, unknown> as {
            title: string;
            description?: string;
            images?: string[];
            video?: string;
            tags?: string[];
            basePath?: string;
            scheduleAt?: string;
            visibility?: string;
            isOriginal?: boolean;
            products?: unknown;
          },
        });

        getProgressEventBus().emit({
          type: 'publish',
          jobId: job.id,
          platform: platform as string,
          status: 'QUEUED',
          progress: 0,
        });

        return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
      })

      // SSE 进度流（供 ht-gates 订阅）
      .get('/progress', ({ request, set }) => {
        set.headers['Content-Type'] = 'text/event-stream';
        set.headers['Cache-Control'] = 'no-cache';
        set.headers.Connection = 'keep-alive';
        set.headers['X-Accel-Buffering'] = 'no';

        return getSseServerManager().createStream(request);
      })

      // 查询任务状态
      .get('/:jobId', async ({ params, set }) => {
        const queue = await resolveQueue(options);
        const state = await queue.getJobState(params.jobId);
        if (!state) {
          set.status = 404;
          return { success: false, error: 'Job not found' };
        }
        return { success: true, data: { jobId: params.jobId, state } };
      })
  );
}
