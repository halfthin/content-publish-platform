import * as fs from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Elysia, t } from 'elysia';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import { addPublishJob } from '../queues/publish-queue';
import {
  approveContent,
  getContentById,
  getContents,
  moveToApproved,
  moveToPublished,
  rejectContent,
  scanInbox,
} from '../services/content.service';

const logger = createLogger('contents-route');

function isSupportedPublishPlatform(
  platform: string
): platform is 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat' {
  return ['xiaohongshu', 'weibo', 'douyin', 'bilibili', 'wechat'].includes(platform);
}

/**
 * 安全路径处理 - 防止路径遍历攻击
 */
function sanitizePath(filepath: string): string {
  // 规范化路径并移除所有 ../ 前缀
  const normalized = normalize(filepath);
  const safePath = normalized.replace(/^(\.\.(\/|\\))+/, '');
  // 再次检查是否还有 .. 片段
  if (safePath.includes('..')) {
    throw new Error('Invalid path: contains .. segments');
  }
  return safePath;
}

/**
 * 内容管理 API 路由
 */
export function setupContentsRoutes() {
  return (
    new Elysia({ prefix: '/api/contents' })
      // 获取内容列表
      .get(
        '/',
        async ({ query }) => {
          const filter = {
            status: query.status,
            type: query.type,
            category: query.category,
            search: query.search,
            page: query.page ? parseInt(query.page, 10) : 1,
            limit: query.limit ? parseInt(query.limit, 10) : 20,
          };

          logger.debug('Getting contents with filter:', filter);

          const result = await getContents(filter);

          return {
            success: true,
            data: result.data,
            pagination: {
              total: result.total,
              page: result.page,
              limit: result.limit,
              totalPages: result.totalPages,
            },
          };
        },
        {
          query: t.Object({
            status: t.Optional(t.String()),
            type: t.Optional(t.String()),
            category: t.Optional(t.String()),
            search: t.Optional(t.String()),
            page: t.Optional(t.Numeric()),
            limit: t.Optional(t.Numeric()),
          }),
        }
      )

      // 获取内容详情
      .get(
        '/:id',
        async ({ params }) => {
          const content = await getContentById(params.id);

          if (!content) {
            return {
              success: false,
              error: 'Content not found',
            };
          }

          return {
            success: true,
            data: content,
          };
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )

      // 获取内容文件（图片/视频预览）
      .get(
        '/:id/files/*filepath',
        async ({ params, set }) => {
          const { id, filepath } = params;

          // 验证内容是否存在
          const content = await getContentById(id);
          if (!content) {
            set.status = 404;
            return {
              success: false,
              error: 'Content not found',
            };
          }

          // 安全路径处理 - 防止路径遍历攻击
          let safeFilepath: string;
          try {
            safeFilepath = sanitizePath(filepath);
          } catch {
            set.status = 400;
            return {
              success: false,
              error: 'Invalid file path',
            };
          }

          // 构建文件路径
          const filePath = join(content.basePath, safeFilepath);

          // 验证文件路径在内容目录内
          const resolvedPath = await fs.realpath(filePath).catch(() => null);
          const resolvedBase = await fs.realpath(content.basePath).catch(() => content.basePath);

          if (!resolvedPath || !resolvedPath.startsWith(resolvedBase)) {
            set.status = 403;
            return {
              success: false,
              error: 'Access denied: path traversal detected',
            };
          }

          try {
            await fs.access(filePath);
            const fileBuffer = await fs.readFile(filePath);
            const ext = extname(filePath).toLowerCase();

            // 设置正确的 Content-Type
            const contentTypes: Record<string, string> = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.mp4': 'video/mp4',
              '.mov': 'video/quicktime',
              '.avi': 'video/x-msvideo',
              '.mkv': 'video/x-matroska',
            };

            set.headers['Content-Type'] = contentTypes[ext] || 'application/octet-stream';

            return fileBuffer;
          } catch {
            set.status = 404;
            return {
              success: false,
              error: 'File not found',
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
            filepath: t.String(),
          }),
        }
      )

      // 审核通过
      .post(
        '/:id/approve',
        async ({ params, body }) => {
          const { id } = params;
          const { reviewedBy, note } = body;

          try {
            const content = await approveContent(id, reviewedBy || 'system', note);

            if (!content) {
              return {
                success: false,
                error: 'Content not found',
              };
            }

            // 移动到已批准目录
            await moveToApproved(id);

            logger.info('Content approved:', id);

            return {
              success: true,
              data: content,
              message: 'Content approved successfully',
            };
          } catch (error) {
            logger.error('Error approving content:', error);
            return {
              success: false,
              error: 'Failed to approve content',
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            reviewedBy: t.Optional(t.String()),
            note: t.Optional(t.String()),
          }),
        }
      )

      // 审核拒绝
      .post(
        '/:id/reject',
        async ({ params, body }) => {
          const { id } = params;
          const { reviewedBy, note } = body;

          try {
            const content = await rejectContent(id, reviewedBy || 'system', note);

            if (!content) {
              return {
                success: false,
                error: 'Content not found',
              };
            }

            logger.info('Content rejected:', id);

            return {
              success: true,
              data: content,
              message: 'Content rejected successfully',
            };
          } catch (error) {
            logger.error('Error rejecting content:', error);
            return {
              success: false,
              error: 'Failed to reject content',
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            reviewedBy: t.Optional(t.String()),
            note: t.Optional(t.String()),
          }),
        }
      )

      // 扫描收件箱
      .post('/scan-inbox', async () => {
        try {
          await scanInbox();
          return {
            success: true,
            message: 'Inbox scanned successfully',
          };
        } catch (error) {
          logger.error('Error scanning inbox:', error);
          return {
            success: false,
            error: 'Failed to scan inbox',
          };
        }
      })

      // 发布内容到指定平台
      .post(
        '/:id/publish',
        async ({ params, body }) => {
          const { id } = params;
          const { platform, accountId } = body;

          try {
            // 1. 验证内容状态
            const content = await getContentById(id);
            if (!content) {
              return {
                success: false,
                error: 'Content not found',
              };
            }

            if (content.status !== 'APPROVED') {
              return {
                success: false,
                error: 'Content must be approved before publishing',
              };
            }

            // 2. 验证账号
            const targetAccountId = accountId || 'default';
            const account = await prisma.account.findUnique({
              where: { id: targetAccountId },
            });

            if (!account) {
              return {
                success: false,
                error: 'Account not found',
              };
            }

            if (account.status !== 'ACTIVE') {
              return {
                success: false,
                error: 'Account is not active',
              };
            }

            if (!isSupportedPublishPlatform(platform)) {
              return {
                success: false,
                error: 'Unsupported platform',
              };
            }

            if (!account.encryptedCookies) {
              return {
                success: false,
                error: 'Account has no cookies configured',
              };
            }

            // 3. 创建发布日志
            const publishLog = await prisma.publishLog.create({
              data: {
                contentId: id,
                accountId: targetAccountId,
                platform: platform || 'unknown',
                status: 'QUEUED',
              },
            });

            // 4. 添加到发布队列
            const job = await addPublishJob(
              {
                contentId: id,
                accountId: targetAccountId,
                platform,
                content: {
                  title: content.title,
                  description: content.description || '',
                  images: content.images || [],
                  video: content.video || undefined,
                  tags: content.tags || [],
                },
              },
              {
                jobId: `${id}-${targetAccountId}-${Date.now()}`,
              }
            );

            // 5. 更新发布日志
            await prisma.publishLog.update({
              where: { id: publishLog.id },
              data: { jobId: job.id },
            });

            // 6. 更新内容状态
            await prisma.content.update({
              where: { id },
              data: { status: 'PUBLISHING' },
            });

            logger.info('Content queued for publishing', {
              contentId: id,
              platform,
              jobId: job.id,
            });

            return {
              success: true,
              data: { ...publishLog, jobId: job.id },
              message: 'Content queued for publishing',
            };
          } catch (error) {
            logger.error('Error queuing content for publish:', error);
            return {
              success: false,
              error: `Failed to queue content: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            platform: t.String(),
            accountId: t.Optional(t.String()),
          }),
        }
      )

      // 移动到已发布
      .post(
        '/:id/move-to-published',
        async ({ params, body }) => {
          const { id } = params;
          const { platform } = body;

          try {
            await moveToPublished(id, platform);

            // 更新内容状态
            const content = await require('../config/prisma').prisma.content.update({
              where: { id },
              data: {
                status: 'PUBLISHED',
                publishCount: { increment: 1 },
              },
            });

            return {
              success: true,
              data: content,
              message: 'Content moved to published',
            };
          } catch (error) {
            logger.error('Error moving content to published:', error);
            return {
              success: false,
              error: 'Failed to move content',
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            platform: t.String(),
          }),
        }
      )
  );
}
