import { Elysia, t } from 'elysia';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import { addPublishJob, getPublishQueue } from '../queues/publish-queue';

const logger = createLogger('publish-status-route');

function isSupportedPublishPlatform(
  platform: string
): platform is 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat' {
  return ['xiaohongshu', 'weibo', 'douyin', 'bilibili', 'wechat'].includes(platform);
}

/**
 * 发布状态跟踪 API 路由
 */
export function setupPublishStatusRoutes() {
  return (
    new Elysia({ prefix: '/api/publish-status' })
      // 获取内容的发布状态
      .get(
        '/content/:contentId',
        async ({ params }) => {
          const { contentId } = params;

          try {
            // 获取内容的所有发布日志
            const publishLogs = await prisma.publishLog.findMany({
              where: { contentId },
              include: {
                account: {
                  select: {
                    id: true,
                    name: true,
                    platform: true,
                    username: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            });

            // 获取队列中的任务状态
            const logsWithJobId = publishLogs.filter(
              (log): typeof log & { jobId: string } => typeof log.jobId === 'string'
            );
            const jobStates = await Promise.all(
              logsWithJobId.map(async (log) => ({
                jobId: log.jobId,
                state: await getPublishQueue().getJobState(log.jobId),
              }))
            );

            const stateMap = Object.fromEntries(jobStates.map((s) => [s.jobId, s.state]));

            return {
              success: true,
              data: {
                contentId,
                publishLogs: publishLogs.map((log) => ({
                  ...log,
                  jobState: log.jobId ? stateMap[log.jobId] : null,
                })),
              },
            };
          } catch (error) {
            logger.error('Failed to get publish status', { error: String(error) });
            return {
              success: false,
              error: `Failed to get publish status: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            contentId: t.String(),
          }),
        }
      )

      // 获取账号的发布历史
      .get(
        '/account/:accountId',
        async ({ params, query }) => {
          const { accountId } = params;
          const { limit = '20', offset = '0' } = query;

          try {
            const publishLogs = await prisma.publishLog.findMany({
              where: { accountId },
              include: {
                content: {
                  select: {
                    id: true,
                    title: true,
                    type: true,
                    status: true,
                  },
                },
                account: {
                  select: {
                    id: true,
                    name: true,
                    platform: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
              take: parseInt(limit, 10),
              skip: parseInt(offset, 10),
            });

            const total = await prisma.publishLog.count({
              where: { accountId },
            });

            return {
              success: true,
              data: {
                accountId,
                publishLogs,
                pagination: {
                  total,
                  limit: parseInt(limit, 10),
                  offset: parseInt(offset, 10),
                },
              },
            };
          } catch (error) {
            logger.error('Failed to get account publish history', { error: String(error) });
            return {
              success: false,
              error: `Failed to get publish history: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            accountId: t.String(),
          }),
          query: t.Object({
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          }),
        }
      )

      // 获取发布统计
      .get('/stats', async () => {
        try {
          const [today, thisWeek, thisMonth] = await Promise.all([
            // 今日统计
            prisma.publishLog.count({
              where: {
                createdAt: {
                  gte: new Date(new Date().setHours(0, 0, 0, 0)),
                },
              },
            }),
            // 本周统计
            prisma.publishLog.count({
              where: {
                createdAt: {
                  gte: new Date(new Date().setDate(new Date().getDate() - 7)),
                },
              },
            }),
            // 本月统计
            prisma.publishLog.count({
              where: {
                createdAt: {
                  gte: new Date(new Date().setDate(1)),
                },
              },
            }),
          ]);

          const statusCounts = await prisma.publishLog.groupBy({
            by: ['status'],
            _count: true,
          });

          const platformCounts = await prisma.publishLog.groupBy({
            by: ['platform'],
            _count: true,
          });

          return {
            success: true,
            data: {
              today,
              thisWeek,
              thisMonth,
              byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
              byPlatform: Object.fromEntries(platformCounts.map((p) => [p.platform, p._count])),
            },
          };
        } catch (error) {
          logger.error('Failed to get publish stats', { error: String(error) });
          return {
            success: false,
            error: `Failed to get stats: ${error}`,
          };
        }
      })

      // 重试失败的发布
      .post(
        '/:id/retry',
        async ({ params }) => {
          const { id } = params;

          try {
            const publishLog = await prisma.publishLog.findUnique({
              where: { id },
              include: {
                content: true,
                account: true,
              },
            });

            if (!publishLog) {
              return {
                success: false,
                error: 'Publish log not found',
              };
            }

            if (publishLog.status !== 'FAILED') {
              return {
                success: false,
                error: 'Only failed jobs can be retried',
              };
            }

            if (!isSupportedPublishPlatform(publishLog.platform)) {
              return {
                success: false,
                error: 'Unsupported platform',
              };
            }

            // 创建新的发布任务
            const job = await addPublishJob(
              {
                contentId: publishLog.contentId,
                accountId: publishLog.accountId,
                platform: publishLog.platform,
                content: {
                  title: publishLog.content.title,
                  description: publishLog.content.description || '',
                  images: publishLog.content.images || [],
                  video: publishLog.content.video || undefined,
                  tags: publishLog.content.tags || [],
                },
                retryCount: (publishLog.retryCount || 0) + 1,
              },
              {
                jobId: `${publishLog.contentId}-${publishLog.accountId}-retry-${Date.now()}`,
              }
            );

            // 更新发布日志
            await prisma.publishLog.update({
              where: { id },
              data: {
                status: 'QUEUED',
                jobId: job.id,
                retryCount: { increment: 1 },
                errorMessage: null,
              },
            });

            logger.info('Publish job retried', {
              publishLogId: id,
              newJobId: job.id,
            });

            return {
              success: true,
              data: { jobId: job.id },
              message: 'Publish job queued for retry',
            };
          } catch (error) {
            logger.error('Failed to retry publish', { error: String(error) });
            return {
              success: false,
              error: `Failed to retry: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )
  );
}
