import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';

const logger = createLogger('content-service');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const CONTENT_BASE_DIR = process.env.CONTENT_DIR
  ? resolve(PROJECT_ROOT, process.env.CONTENT_DIR)
  : join(PROJECT_ROOT, 'content');

export interface ContentFilter {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * 扫描 inbox 目录，发现新内容并创建 Content 记录
 */
export async function scanInbox(): Promise<void> {
  const inboxDir = join(CONTENT_BASE_DIR, 'inbox');
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(inboxDir, { withFileTypes: true });
  } catch {
    logger.warn('Inbox directory not found', { path: inboxDir });
    return;
  }

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const dirName of dirs) {
    const dirPath = join(inboxDir, dirName);
    const metaPath = join(dirPath, 'metadata.json');

    let meta: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      meta = JSON.parse(raw);
    } catch {
      meta = { title: dirName };
    }

    // 已有有效 ID 且 DB 中存在该记录 → 跳过
    if (meta.id) {
      const existing = await prisma.content.findUnique({ where: { id: meta.id as string } });
      if (existing) continue;
    }

    // 新内容：生成 ID，写入 metadata.json，创建 DB 记录
    const id = (meta.id as string) || crypto.randomUUID();
    const title = (meta.title as string) || dirName;
    const relativePath = `inbox/${dirName}`;

    await fs.writeFile(
      metaPath,
      JSON.stringify({ id, title, relativePath, createdAt: new Date().toISOString() }, null, 2)
    );

    await prisma.content.create({ data: { id, relativePath, title, status: 'PENDING' } });
    logger.info('New content scanned', { id, title, relativePath });
  }
}

/**
 * 获取内容列表（分页 + 过滤）
 */
export async function getContents(filter: ContentFilter = {}) {
  const where: Record<string, unknown> = {};
  if (filter.status) where.status = filter.status;
  if (filter.search) where.title = { contains: filter.search };

  const page = filter.page || 1;
  const limit = Math.min(filter.limit || 20, 100);

  const [data, total] = await Promise.all([
    prisma.content.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.content.count({ where: where as never }),
  ]);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * 获取内容详情（含发布计划）
 */
export async function getContentById(id: string) {
  return prisma.content.findUnique({
    where: { id },
    include: { publishPlans: true },
  });
}

/**
 * 审核通过 → 创建发布计划
 */
export async function approveContent(
  contentId: string,
  platform: string,
  accountId: string,
  options?: { title?: string; reviewedBy?: string; note?: string; scheduledAt?: string }
) {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return null;
  if (content.status !== 'PENDING') throw new Error('Content is not PENDING');

  const plan = await prisma.publishPlan.create({
    data: {
      contentId,
      platform,
      accountId,
      title: options?.title || content.title,
      scheduledAt: options?.scheduledAt ? new Date(options.scheduledAt) : null,
      status: 'PENDING',
    },
  });

  await prisma.content.update({
    where: { id: contentId },
    data: { status: 'APPROVED' },
  });

  return {
    content: await prisma.content.findUnique({ where: { id: contentId } }),
    plan,
  };
}

/**
 * 审核拒绝
 */
export async function rejectContent(contentId: string) {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return null;

  return prisma.content.update({
    where: { id: contentId },
    data: { status: 'REJECTED' },
  });
}

/**
 * 移动内容到已发布目录（yyyy/MM/）
 * 仅当所有发布计划均为 DONE 时执行
 */
export async function moveToPublished(contentId: string): Promise<void> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new Error('Content not found');

  // 确保所有发布计划已完成
  const pendingPlans = await prisma.publishPlan.count({
    where: { contentId, status: { not: 'DONE' } },
  });
  if (pendingPlans > 0) throw new Error('Not all publish plans are done');

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const destDir = join(CONTENT_BASE_DIR, 'published', String(year), month);
  const srcPath = join(CONTENT_BASE_DIR, content.relativePath);
  const dirName = content.relativePath.split('/').pop() || contentId;
  const destPath = join(destDir, dirName);

  await fs.mkdir(destDir, { recursive: true });
  await fs.rename(srcPath, destPath);

  await prisma.content.update({
    where: { id: contentId },
    data: {
      relativePath: `published/${year}/${month}/${dirName}`,
      finishedAt: new Date(),
    },
  });
}
