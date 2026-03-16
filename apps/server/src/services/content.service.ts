import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Content, ContentStatus } from '@prisma/client';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';

const logger = createLogger('content-service');

export interface ContentFilter {
  status?: ContentStatus;
  type?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ContentListResult {
  data: Content[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContentWithPreview extends Omit<Content, 'images'> {
  images: string[];
  previewUrls: string[];
  mdContent?: string;
}

const CONTENT_BASE_DIR = process.env.CONTENT_DIR || './content';

/**
 * 获取内容列表（分页 + 过滤）
 */
export async function getContents(filter: ContentFilter = {}): Promise<ContentListResult> {
  const { status, type, category, search, page = 1, limit = 20 } = filter;

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (type) {
    where.type = type;
  }

  if (category) {
    where.category = category;
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { tags: { has: search } },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.content.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.content.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * 获取内容详情
 */
export async function getContentById(id: string): Promise<ContentWithPreview | null> {
  const content = await prisma.content.findUnique({
    where: { id },
    include: {
      publishLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!content) {
    return null;
  }

  // 生成图片预览 URL
  const previewUrls = content.images.map((img) => {
    const relativePath = path.relative(CONTENT_BASE_DIR, img);
    return `/api/contents/${content.id}/files/${encodeURIComponent(relativePath)}`;
  });

  // 读取 Markdown 内容
  let mdContent: string | undefined;
  try {
    mdContent = await fs.readFile(content.mdFile, 'utf-8');
  } catch (error) {
    logger.warn(`Failed to read markdown file: ${content.mdFile}`, error);
  }

  return {
    ...content,
    previewUrls,
    mdContent,
  };
}

/**
 * 审核通过内容
 */
export async function approveContent(
  id: string,
  reviewedBy: string,
  note?: string
): Promise<Content | null> {
  return prisma.content.update({
    where: { id },
    data: {
      status: 'APPROVED',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNote: note || undefined,
    },
  });
}

/**
 * 审核拒绝内容
 */
export async function rejectContent(
  id: string,
  reviewedBy: string,
  note?: string
): Promise<Content | null> {
  return prisma.content.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNote: note || undefined,
    },
  });
}

/**
 * 扫描收件箱目录，发现新内容
 */
export async function scanInbox(): Promise<void> {
  const inboxDir = join(CONTENT_BASE_DIR, 'inbox');

  try {
    await fs.access(inboxDir);
  } catch {
    logger.info('Inbox directory does not exist, creating:', inboxDir);
    await fs.mkdir(inboxDir, { recursive: true });
    return;
  }

  const entries = await fs.readdir(inboxDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const contentDir = join(inboxDir, entry.name);
    await processContentDirectory(contentDir, entry.name);
  }
}

/**
 * 处理内容目录
 */
async function processContentDirectory(dirPath: string, dirName: string): Promise<void> {
  try {
    const files = await fs.readdir(dirPath);

    // 查找 markdown 文件
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) {
      logger.debug('No markdown file found in:', dirPath);
      return;
    }

    // 检查是否已存在
    const existing = await prisma.content.findFirst({
      where: {
        basePath: dirPath,
      },
    });

    if (existing) {
      logger.debug('Content already exists:', dirPath);
      return;
    }

    // 解析内容信息
    const mdFile = join(dirPath, mdFiles[0]);
    const mdContent = await fs.readFile(mdFile, 'utf-8');

    // 从 markdown  frontmatter 提取标题
    const titleMatch = mdContent.match(/^---[\s\S]*?title:\s*(.+?)\s*^---/m);
    const title = titleMatch ? titleMatch[1].trim() : dirName;

    // 查找图片文件
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const images = files
      .filter((f) => imageExtensions.some((ext) => f.toLowerCase().endsWith(ext)))
      .map((f) => join(dirPath, f));

    // 查找视频文件
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
    const video = files.find((f) => videoExtensions.some((ext) => f.toLowerCase().endsWith(ext)));
    const videoPath = video ? join(dirPath, video) : undefined;

    // 确定内容类型
    let type: 'IMAGE' | 'VIDEO' | 'MIXED' = 'IMAGE';
    if (videoPath && images.length > 0) {
      type = 'MIXED';
    } else if (videoPath) {
      type = 'VIDEO';
    }

    // 创建内容记录
    await prisma.content.create({
      data: {
        title,
        description: null,
        type,
        status: 'PENDING',
        basePath: dirPath,
        images,
        video: videoPath,
        mdFile,
        tags: [],
        category: null,
      },
    });

    logger.info('New content discovered:', { title, dir: dirPath, type });
  } catch (error) {
    logger.error('Error processing content directory:', dirPath, error);
  }
}

/**
 * 移动内容到已批准目录
 */
export async function moveToApproved(contentId: string): Promise<void> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
  });

  if (!content) {
    throw new Error('Content not found');
  }

  const approvedDir = join(CONTENT_BASE_DIR, 'approved', path.basename(content.basePath));

  try {
    await fs.rename(content.basePath, approvedDir);

    // 更新数据库路径
    await prisma.content.update({
      where: { id: contentId },
      data: {
        basePath: approvedDir,
        mdFile: join(approvedDir, path.basename(content.mdFile)),
        images: content.images.map((img) => join(approvedDir, path.basename(img))),
        video: content.video ? join(approvedDir, path.basename(content.video)) : undefined,
      },
    });

    logger.info('Content moved to approved:', contentId);
  } catch (error) {
    logger.error('Error moving content to approved:', error);
  }
}

/**
 * 移动内容到已发布目录
 */
export async function moveToPublished(contentId: string, platform: string): Promise<void> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
  });

  if (!content) {
    throw new Error('Content not found');
  }

  const sourceDir = content.basePath;
  const targetDir = join(CONTENT_BASE_DIR, 'published', platform, path.basename(sourceDir));

  try {
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await fs.rename(sourceDir, targetDir);

    logger.info('Content moved to published:', { contentId, platform, target: targetDir });
  } catch (error) {
    logger.error('Error moving content to published:', error);
  }
}
