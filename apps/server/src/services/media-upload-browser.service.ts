import { promises as fs } from 'node:fs';
import { join, parse, posix, resolve, sep } from 'node:path';
import { createLogger } from '../config/logger';
import { getMediaActionGatewayConfig } from '../config/media-actions';

const PROJECT_ROOT = resolve(__dirname, '../../../..');
const CONTENT_BASE_DIR = process.env.CONTENT_DIR
  ? resolve(PROJECT_ROOT, process.env.CONTENT_DIR)
  : join(PROJECT_ROOT, 'content');

export interface UploadRoot {
  id: string;
  label: string;
  path: string;
}

export interface UploadDateTreeMonth {
  month: string;
  label: string;
  path: string;
  days: Array<{
    day: string;
    label: string;
    path: string;
  }>;
}

export interface UploadDateTreeYear {
  year: string;
  label: string;
  path: string;
  months: UploadDateTreeMonth[];
}

export interface UploadItem {
  filename: string;
  relativePath: string;
  parentPath: string;
  size: number;
  modifiedAt: string;
  mimeType: string;
}

export interface UploadItemsResult {
  items: UploadItem[];
  nextCursor: string | null;
}

function getUploadBaseDir(): string {
  return CONTENT_BASE_DIR;
}

function sanitizePath(path: string): string {
  // 防止路径遍历攻击：移除所有 .. 和绝对路径
  // 先 URL 解码（处理 %2F 等被编码的字符）
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // 忽略解码失败的情况
  }
  const normalized = posix.normalize('/' + decoded.replace(/^[/\\]*/, '').replace(/\.\./g, ''));
  return normalized;
}

function isPathSafe(base: string, target: string): boolean {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(base, target);
  return resolvedTarget.startsWith(resolvedBase + sep);
}

function getMimeType(filename: string): string {
  const ext = parse(filename).ext.toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

async function readDirSafe(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * 获取可用的上传根目录（providers）
 */
export async function getUploadRoots(): Promise<UploadRoot[]> {
  const baseDir = getUploadBaseDir();
  const uploadDir = join(baseDir, 'uploaded');

  try {
    const entries = await fs.readdir(uploadDir, { withFileTypes: true });
    const roots: UploadRoot[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        roots.push({
          id: entry.name,
          label: entry.name === 'openclaw' ? 'OpenClaw 回传文件' : entry.name,
          path: entry.name,
        });
      }
    }

    return roots;
  } catch {
    return [];
  }
}

/**
 * 获取指定 provider 的目录树
 */
export async function getUploadDateTree(
  provider: string,
  basePath: string = ''
): Promise<UploadDateTreeYear[]> {
  const safeProvider = sanitizePath(provider).replace(/^\//, '');
  const safeBasePath = sanitizePath(basePath).replace(/^\//, '');
  const rootDir = join(getUploadBaseDir(), 'uploaded', safeProvider, safeBasePath);

  if (!isPathSafe(join(getUploadBaseDir(), 'uploaded'), rootDir)) {
    throw new Error('Invalid path');
  }

  const years: UploadDateTreeYear[] = [];

  try {
    const yearEntries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const yearEntry of yearEntries) {
      if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) {
        continue;
      }

      const yearPath = join(rootDir, yearEntry.name);
      const months: UploadDateTreeMonth[] = [];

      const monthEntries = await fs.readdir(yearPath, { withFileTypes: true });

      for (const monthEntry of monthEntries) {
        if (!monthEntry.isDirectory() || !/^\d{2}$/.test(monthEntry.name)) {
          continue;
        }

        const monthPath = join(yearPath, monthEntry.name);
        const days: Array<{ day: string; label: string; path: string }> = [];

        const dayEntries = await fs.readdir(monthPath, { withFileTypes: true });

        for (const dayEntry of dayEntries) {
          if (!dayEntry.isDirectory() || !/^\d{2}$/.test(dayEntry.name)) {
            continue;
          }

          days.push({
            day: dayEntry.name,
            label: dayEntry.name,
            path: `${yearEntry.name}/${monthEntry.name}/${dayEntry.name}`,
          });
        }

        months.push({
          month: monthEntry.name,
          label: monthEntry.name,
          path: `${yearEntry.name}/${monthEntry.name}`,
          days: days.sort((a, b) => a.day.localeCompare(b.day)),
        });
      }

      years.push({
        year: yearEntry.name,
        label: yearEntry.name,
        path: yearEntry.name,
        months: months.sort((a, b) => a.month.localeCompare(b.month)),
      });
    }
  } catch {
    // 目录不存在，返回空
  }

  return years.sort((a, b) => b.year.localeCompare(a.year)); // 最新年份在前
}

/**
 * 获取指定目录下的文件列表
 */
export async function getUploadItems(
  provider: string,
  dirPath: string = '',
  options: { recursive?: boolean; limit?: number; cursor?: string } = {}
): Promise<UploadItemsResult> {
  const { recursive = false, limit = 120, cursor } = options;

  const safeProvider = sanitizePath(provider).replace(/^\//, '');
  const safeDirPath = sanitizePath(dirPath).replace(/^\//, '');
  const rootDir = join(getUploadBaseDir(), 'uploaded', safeProvider, safeDirPath);

  if (!isPathSafe(join(getUploadBaseDir(), 'uploaded'), rootDir)) {
    throw new Error('Invalid path');
  }

  const items: UploadItem[] = [];
  let nextCursor: string | null = null;

  async function scanDirectory(dir: string, currentRelativePath: string, depth: number = 0) {
    if (items.length >= limit) {
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (items.length >= limit) {
          break;
        }

        const fullPath = join(dir, entry.name);
        const entryRelativePath = posix.join(currentRelativePath, entry.name);

        if (entry.isDirectory()) {
          if (recursive && depth < 3) {
            await scanDirectory(fullPath, entryRelativePath, depth + 1);
          }
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          items.push({
            filename: entry.name,
            relativePath: entryRelativePath,
            parentPath: currentRelativePath,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            mimeType: getMimeType(entry.name),
          });
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  // 如果有 cursor，使用它作为起始偏移
  let startIndex = 0;
  if (cursor) {
    try {
      startIndex = parseInt(cursor, 10);
    } catch {
      startIndex = 0;
    }
  }

  await scanDirectory(rootDir, safeDirPath);

  if (items.length > limit) {
    items.length = limit;
    nextCursor = String(startIndex + limit);
  }

  // 按修改时间倒序
  items.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

  return { items, nextCursor };
}

/**
 * 读取指定的上传文件
 */
export async function readUploadFile(
  provider: string,
  relativePath: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const safeProvider = sanitizePath(provider).replace(/^\//, '');
  const safeFilePath = sanitizePath(relativePath).replace(/^\//, '');
  const fullPath = join(getUploadBaseDir(), 'uploaded', safeProvider, safeFilePath);

  if (!isPathSafe(join(getUploadBaseDir(), 'uploaded'), fullPath)) {
    throw new Error('Invalid path: path traversal detected');
  }

  const buffer = await fs.readFile(fullPath);
  const ext = safeFilePath.split('.').pop()?.toLowerCase() || '';
  const mimeType = getMimeTypeFromExt(ext);
  return { buffer, mimeType };
}

function getMimeTypeFromExt(ext: string): string {
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    pdf: 'application/pdf',
    json: 'application/json',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 删除指定的上传文件
 */
export async function deleteUploadFile(provider: string, relativePath: string): Promise<void> {
  const safeProvider = sanitizePath(provider).replace(/^\//, '');
  const safeFilePath = sanitizePath(relativePath).replace(/^\//, '');
  const fullPath = join(getUploadBaseDir(), 'uploaded', safeProvider, safeFilePath);

  if (!isPathSafe(join(getUploadBaseDir(), 'uploaded'), fullPath)) {
    throw new Error('Invalid path: path traversal detected');
  }

  try {
    await fs.unlink(fullPath);
    logger.info('Deleted upload file', { provider, relativePath });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw err;
  }
}

/**
 * 批量删除上传文件
 */
export async function deleteUploadFiles(
  provider: string,
  relativePaths: string[]
): Promise<{ deleted: number; failed: string[] }> {
  const failed: string[] = [];
  let deleted = 0;

  for (const path of relativePaths) {
    try {
      await deleteUploadFile(provider, path);
      deleted++;
    } catch {
      failed.push(path);
    }
  }

  return { deleted, failed };
}
