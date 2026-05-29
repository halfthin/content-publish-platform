import * as fs from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Elysia, t } from 'elysia';
import { fileTypeFromBuffer } from 'file-type';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import {
  approveContent,
  getContentById,
  getContents,
  moveToPublished,
  rejectContent,
  scanInbox,
} from '../services/content.service';

const logger = createLogger('contents-route');

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
        '/:id/files/*',
        async ({ params, set, request }) => {
          const id = params.id as string;
          // 从请求路径提取通配符部分：/api/contents/:id/files/* -> *
          const url = new URL(request.url);
          const pathParts = url.pathname.split('/').filter(Boolean);
          // pathParts: ['api', 'contents', ':id', 'files', ...rest]
          const filesIndex = pathParts.indexOf('files');
          const rawFilepath = filesIndex >= 0 ? pathParts.slice(filesIndex + 1).join('/') : '';
          // 解码 URL 编码的路径（如 %2F -> /）
          const filepath = decodeURIComponent(rawFilepath);

          logger.debug({ id, filepath, params, urlPath: url.pathname }, 'File request params');

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

          // 解析软链接获取真实路径
          const resolvedPath = await fs.realpath(filePath).catch(() => null);
          const resolvedBase = await fs.realpath(content.basePath).catch(() => content.basePath);

          logger.debug(
            { filePath, resolvedPath, resolvedBase, safeFilepath, basePath: content.basePath },
            'File path validation'
          );

          // 检查文件是否存在
          if (!resolvedPath) {
            logger.warn({ filePath }, 'File not found');
            set.status = 404;
            return {
              success: false,
              error: 'File not found',
            };
          }

          // 检查路径遍历：只有当 resolvedPath 不在 resolvedBase 内时才拒绝
          // 注意：软链接可能指向 content 目录之外，这种情况我们允许访问（因为软链接本身在 basePath 内）
          const isSymlink = filePath !== resolvedPath;
          if (!isSymlink && !resolvedPath.startsWith(resolvedBase)) {
            logger.warn({ resolvedPath, resolvedBase }, 'Path traversal detected');
            set.status = 403;
            return {
              success: false,
              error: 'Access denied: path traversal detected',
            };
          }

          try {
            await fs.access(filePath);
            const fileBuffer = await fs.readFile(filePath);

            // 检测文件实际 MIME 类型（处理软链接和扩展名不匹配的情况）
            const detectedType = await fileTypeFromBuffer(fileBuffer);
            let contentType: string;

            if (detectedType) {
              // 使用检测到的实际类型
              contentType = detectedType.mime;
              logger.debug(
                { filePath, detectedMime: detectedType.mime, ext: extname(filePath) },
                'File type detected from content'
              );
            } else {
              // 回退到基于扩展名的判断
              const ext = extname(filePath).toLowerCase();
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
              contentType = contentTypes[ext] || 'application/octet-stream';
            }

            set.headers['Content-Type'] = contentType;

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
          // ElysiaJS 自动注入 '*' 参数用于通配符路由
          params: t.Object({
            id: t.String(),
            '*': t.Any(),
          }),
        }
      )

      // 审核通过 → 创建发布计划并加入队列
      .post(
        '/:id/approve',
        async ({ params, body }) => {
          const { id } = params;
          const { platform, accountId, title, reviewedBy, note, scheduledAt } = body as Record<
            string,
            unknown
          >;

          if (!platform || !accountId) {
            return { success: false, error: 'platform and accountId required' };
          }

          try {
            const result = await approveContent(id, platform as string, accountId as string, {
              title: title as string | undefined,
              reviewedBy: reviewedBy as string | undefined,
              note: note as string | undefined,
              scheduledAt: scheduledAt as string | undefined,
            });

            if (!result) {
              return { success: false, error: 'Content not found' };
            }

            // Enqueue to ht-queue
            const { enqueuePublish } = await import('../services/queue-client');
            await enqueuePublish(platform as string, {
              contentId: id,
              accountId: accountId as string,
              platform: platform as string,
              publishPlanId: result.plan.id,
              action: 'publish',
              content: { title: result.plan.title || result.content.title },
            });

            return {
              success: true,
              data: { content: result.content, plan: result.plan },
              message: 'Content approved and queued for publishing',
            };
          } catch (error) {
            logger.error('Error approving content:', error);
            return { success: false, error: String(error) };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            platform: t.String({ description: '发布平台' }),
            accountId: t.String({ description: '发布账号 ID' }),
            title: t.Optional(t.String({ description: '平台专属标题' })),
            reviewedBy: t.Optional(t.String()),
            note: t.Optional(t.String()),
            scheduledAt: t.Optional(t.String({ description: '定时发布时间 (ISO 8601)' })),
          }),
        }
      )

      // 审核拒绝
      .post(
        '/:id/reject',
        async ({ params }) => {
          const { id } = params;

          try {
            const content = await rejectContent(id);

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

      // 移动到已发布
      .post(
        '/:id/move-to-published',
        async ({ params }) => {
          const { id } = params;

          try {
            await moveToPublished(id);

            const content = await prisma.content.update({
              where: { id },
              data: {
                status: 'PUBLISHED',
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
        }
      )
  );
}
