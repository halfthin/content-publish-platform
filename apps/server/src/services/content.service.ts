import { promises as fs } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Content, ContentStatus } from '@prisma/client';
import { createLogger } from '../config/logger';
import { prisma } from '../config/prisma';

const logger = createLogger('content-service');
const IGNORED_INBOX_DIRECTORIES = new Set(['example']);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../../..');

interface ContentMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  category?: string;
  images?: string[];
  video?: string;
}

interface ParsedMarkdownContent extends ContentMetadata {
  body: string;
}

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

const DEFAULT_CONTENT_DIR = join(PROJECT_ROOT, 'content');
const CONTENT_BASE_DIR = process.env.CONTENT_DIR
  ? resolve(PROJECT_ROOT, process.env.CONTENT_DIR)
  : DEFAULT_CONTENT_DIR;

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
    const relativePath = relative(CONTENT_BASE_DIR, img);
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

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(frontmatter: string): ContentMetadata {
  const metadata: ContentMetadata = {};
  const lines = frontmatter.split(/\r?\n/);
  let activeArrayKey: keyof ContentMetadata | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      continue;
    }

    const arrayItemMatch = activeArrayKey ? line.match(/^\s*-\s+(.+)$/) : null;
    if (arrayItemMatch && activeArrayKey === 'tags') {
      const tagValue = stripWrappingQuotes(arrayItemMatch[1].trim());
      metadata.tags = [...(metadata.tags || []), tagValue];
      continue;
    }

    activeArrayKey = null;

    const keyValueMatch = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, rawKey, rawValue] = keyValueMatch;
    const key = rawKey.trim();
    const value = rawValue.trim();

    switch (key) {
      case 'title':
      case 'description':
      case 'category':
        if (value) {
          metadata[key] = stripWrappingQuotes(value);
        }
        break;
      case 'tags':
        if (!value) {
          activeArrayKey = 'tags';
        } else {
          metadata.tags = value
            .replace(/^\[(.*)\]$/, '$1')
            .split(',')
            .map((item) => stripWrappingQuotes(item.trim()))
            .filter(Boolean);
        }
        break;
      default:
        break;
    }
  }

  return metadata;
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMarkdownContent(content: string): ParsedMarkdownContent {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    const body = content.trim();
    return {
      body,
      description: markdownToPlainText(body),
    };
  }

  const [, frontmatter, bodyRaw] = match;
  const body = bodyRaw.trim();
  const metadata = parseFrontmatter(frontmatter);

  return {
    ...metadata,
    body,
    description: metadata.description || markdownToPlainText(body),
  };
}

async function loadMetadataFile(dirPath: string): Promise<ContentMetadata> {
  const metadataPath = join(dirPath, 'metadata.json');

  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const metadata: ContentMetadata = {};

    if (typeof parsed.title === 'string') metadata.title = parsed.title.trim();
    if (typeof parsed.description === 'string') metadata.description = parsed.description.trim();
    if (typeof parsed.category === 'string') metadata.category = parsed.category.trim();
    if (Array.isArray(parsed.tags)) {
      metadata.tags = parsed.tags.filter((tag): tag is string => typeof tag === 'string');
    }
    if (Array.isArray(parsed.images)) {
      metadata.images = parsed.images.filter((image): image is string => typeof image === 'string');
    }
    if (typeof parsed.video === 'string') metadata.video = parsed.video.trim();

    return metadata;
  } catch (error) {
    const message = String(error);
    if (!message.includes('ENOENT')) {
      logger.warn(`Failed to load metadata.json from ${dirPath}`, error);
    }
    return {};
  }
}

function resolveImages(dirPath: string, files: string[], metadataImages?: string[]): string[] {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const discoveredImages = files
    .filter((file) => imageExtensions.some((ext) => file.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((file) => join(dirPath, file));

  if (!metadataImages || metadataImages.length === 0) {
    return discoveredImages;
  }

  const existingPaths = new Set(discoveredImages);
  return metadataImages
    .map((image) => join(dirPath, image))
    .filter((imagePath) => existingPaths.has(imagePath));
}

function resolveVideo(
  dirPath: string,
  files: string[],
  metadataVideo?: string
): string | undefined {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];

  if (metadataVideo) {
    return join(dirPath, metadataVideo);
  }

  const video = files
    .filter((file) => videoExtensions.some((ext) => file.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))[0];

  return video ? join(dirPath, video) : undefined;
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

    if (IGNORED_INBOX_DIRECTORIES.has(entry.name)) {
      logger.debug('Skipping ignored inbox directory:', entry.name);
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

    const mdFile = join(dirPath, mdFiles[0]);
    const mdContent = await fs.readFile(mdFile, 'utf-8');
    const parsedMarkdown = parseMarkdownContent(mdContent);
    const metadata = await loadMetadataFile(dirPath);

    const title = metadata.title || parsedMarkdown.title || dirName;
    const description = metadata.description || parsedMarkdown.description || null;
    const tags = metadata.tags || parsedMarkdown.tags || [];
    const category = metadata.category || parsedMarkdown.category || null;
    const images = resolveImages(dirPath, files, metadata.images);
    const videoPath = resolveVideo(dirPath, files, metadata.video);

    // 确定内容类型
    let type: 'IMAGE' | 'VIDEO' | 'MIXED' = 'IMAGE';
    if (videoPath && images.length > 0) {
      type = 'MIXED';
    } else if (videoPath) {
      type = 'VIDEO';
    }

    const payload = {
      title,
      description,
      type,
      basePath: dirPath,
      images,
      video: videoPath,
      mdFile,
      tags,
      category,
    };

    const existing = await prisma.content.findFirst({
      where: {
        basePath: dirPath,
      },
    });

    if (existing) {
      await prisma.content.update({
        where: { id: existing.id },
        data: payload,
      });

      logger.info('Content metadata refreshed:', { title, dir: dirPath, type });
      return;
    }

    await prisma.content.create({
      data: {
        ...payload,
        status: 'PENDING',
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

  const approvedDir = join(CONTENT_BASE_DIR, 'approved', basename(content.basePath));

  try {
    await fs.mkdir(dirname(approvedDir), { recursive: true });
    await fs.rename(content.basePath, approvedDir);

    // 更新数据库路径
    await prisma.content.update({
      where: { id: contentId },
      data: {
        basePath: approvedDir,
        mdFile: join(approvedDir, basename(content.mdFile)),
        images: content.images.map((img) => join(approvedDir, basename(img))),
        video: content.video ? join(approvedDir, basename(content.video)) : undefined,
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
  const targetDir = join(CONTENT_BASE_DIR, 'published', platform, basename(sourceDir));

  try {
    if (sourceDir !== targetDir) {
      await fs.mkdir(dirname(targetDir), { recursive: true });
      await fs.rename(sourceDir, targetDir);
    }

    await prisma.content.update({
      where: { id: contentId },
      data: {
        basePath: targetDir,
        mdFile: join(targetDir, basename(content.mdFile)),
        images: content.images.map((img) => join(targetDir, basename(img))),
        video: content.video ? join(targetDir, basename(content.video)) : undefined,
      },
    });

    logger.info('Content moved to published:', { contentId, platform, target: targetDir });
  } catch (error) {
    logger.error('Error moving content to published:', error);
  }
}
