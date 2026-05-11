import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';
import { getProgressEventBus } from '../services/progress-event-bus';
import { getSseServerManager } from '../services/sse-server-manager';

const logger = createLogger('routes:publish');

export function setupPublishRoutes() {
  return (
    new Elysia({ prefix: '/api/publish' })

      // 通用发布入口
      .post('/', async ({ body, error }) => {
        const { platform, accountId, accountName, action, payload } = body as Record<
          string,
          unknown
        >;

        if (!platform || !accountId || !action) {
          return error(400, { success: false, error: 'platform, accountId, action required' });
        }

        const { getPublishQueue } = await import('../queues/publish-queue');
        const job = await getPublishQueue().addJob({
          contentId: accountId as string,
          accountId: accountId as string,
          platform: platform as 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat',
          content: payload as Record<string, unknown> as {
            title: string;
            description?: string;
            images?: string[];
            video?: string;
            tags?: string[];
            basePath?: string;
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
        set.headers['Connection'] = 'keep-alive';
        set.headers['X-Accel-Buffering'] = 'no';

        return getSseServerManager().createStream(request);
      })

      // 查询任务状态
      .get('/:jobId', async ({ params, error }) => {
        const { getPublishQueue } = await import('../queues/publish-queue');
        const state = await getPublishQueue().getJobState(params.jobId);
        if (!state) {
          return error(404, { success: false, error: 'Job not found' });
        }
        return { success: true, data: { jobId: params.jobId, state } };
      })
  );
}
