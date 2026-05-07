import { promises as fs } from 'node:fs';
import { basename, extname, join, posix, relative, resolve } from 'node:path';
import type { MediaRootConfig } from '../config/media';
import { DEFAULT_MEDIA_ROOT_ID, getDefaultMediaRoots } from '../config/media';

const DEFAULT_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export type MediaLibraryErrorCode =
  | 'ROOT_NOT_FOUND'
  | 'INVALID_PATH'
  | 'DIRECTORY_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'INVALID_ASSET_KEY'
  | 'INVALID_CURSOR'
  | 'UNSUPPORTED_FILE';

export class MediaLibraryError extends Error {
  code: MediaLibraryErrorCode;
  status: number;

  constructor(code: MediaLibraryErrorCode, message: string, status: number) {
    super(message);
    this.name = 'MediaLibraryError';
    this.code = code;
    this.status = status;
  }
}

export interface MediaDateTreeYear {
  year: string;
  label: string;
  path: string;
  months: MediaDateTreeMonth[];
}

export interface MediaDateTreeMonth {
  month: string;
  label: string;
  path: string;
  dates: MediaDateTreeDate[];
}

export interface MediaDateTreeDate {
  label: string;
  path: string;
}

export interface MediaFolderNode {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children?: MediaFolderNode[];
}

export interface MediaFolderSummaryItem {
  name: string;
  relativePath: string;
  imageCount: number;
  coverAssetKey: string | null;
}

export interface MediaFolderSummary {
  rootId: string;
  path: string;
  folders: MediaFolderSummaryItem[];
}

export interface MediaItem {
  assetKey: string;
  rootId: string;
  relativePath: string;
  filename: string;
  parentPath: string;
  size: number;
  modifiedAt: string;
  mimeType: string;
}

export interface MediaItemsResult {
  items: MediaItem[];
  nextCursor: string | null;
}

export interface ResolvedMediaDirectory {
  root: MediaRootConfig;
  rootRealPath: string;
  relativePath: string;
  absolutePath: string;
}

export interface ResolvedMediaAsset extends MediaItem {
  absolutePath: string;
}

export interface ReadAssetResult {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

interface MediaLibraryServiceOptions {
  roots?: MediaRootConfig[];
  allowedExtensions?: string[];
}

interface GetItemsOptions {
  rootId?: string;
  path?: string;
  recursive?: boolean;
  limit?: number;
  cursor?: string;
}

export interface MediaLibraryService {
  getRoots(): Promise<MediaRootConfig[]>;
  resolveDirectory(rootId: string, relativePath?: string): Promise<ResolvedMediaDirectory>;
  getDateTree(rootId?: string): Promise<MediaDateTreeYear[]>;
  getFolderTree(rootId: string, relativePath?: string): Promise<MediaFolderNode[]>;
  getFolderSummary(rootId: string, relativePath?: string): Promise<MediaFolderSummary>;
  getItems(options: GetItemsOptions): Promise<MediaItemsResult>;
  resolveAsset(assetKey: string): Promise<ResolvedMediaAsset>;
  readAsset(assetKey: string): Promise<ReadAssetResult>;
  encodeAssetKey(rootId: string, relativePath: string): string;
}

function createError(code: MediaLibraryErrorCode, message: string, status: number) {
  return new MediaLibraryError(code, message, status);
}

function normalizeRelativePath(input?: string): string {
  if (!input) {
    return '';
  }

  const raw = input.trim().replaceAll('\\', '/');
  if (!raw) {
    return '';
  }

  if (raw.startsWith('/')) {
    throw createError('INVALID_PATH', 'Invalid path: absolute paths are not allowed', 400);
  }

  const normalized = posix.normalize(raw).replace(/^\.\//, '');
  if (normalized === '.' || normalized === './') {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..')) {
    throw createError('INVALID_PATH', 'Invalid path: path traversal is not allowed', 400);
  }

  return segments.join('/');
}

function ensureInsideRoot(rootRealPath: string, candidateRealPath: string) {
  const relativePath = relative(rootRealPath, candidateRealPath);
  if (relativePath === '') {
    return;
  }

  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('../') || normalized === '..') {
    throw createError(
      'INVALID_PATH',
      'Invalid path: resolved path is outside configured root',
      400
    );
  }
}

function toPosixRelative(rootPath: string, targetPath: string): string {
  return relative(rootPath, targetPath).replaceAll('\\', '/');
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf-8').toString('base64url');
}

function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as {
      offset?: number;
    };

    const offset = parsed.offset;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('Invalid offset');
    }

    return offset;
  } catch {
    throw createError('INVALID_CURSOR', 'Invalid cursor', 400);
  }
}

function isImageFile(filename: string, allowedExtensions: Set<string>) {
  return allowedExtensions.has(extname(filename).toLowerCase());
}

function getMimeType(filename: string): string {
  return MIME_TYPES[extname(filename).toLowerCase()] || 'application/octet-stream';
}

function parseYearLabel(name: string): { year: string; sortValue: number; label: string } | null {
  const match = name.match(/^(\d{4})年?$/);
  if (!match) {
    return null;
  }

  return {
    year: match[1] || name,
    sortValue: Number(match[1]),
    label: name,
  };
}

function parseMonthLabel(
  name: string
): { month: string; monthNumber: number; label: string } | null {
  const match = name.match(/^(0?[1-9]|1[0-2])月?$/);
  if (!match) {
    return null;
  }

  const monthNumber = Number(match[1]);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return {
    month: String(monthNumber).padStart(2, '0'),
    monthNumber,
    label: name,
  };
}

function parseMonthDayLabel(name: string): { month: number; day: number } | null {
  const patterns = [
    /^(\d{2})(\d{2})(?:\D|$)/,
    /^(\d{1,2})[./-](\d{1,2})(?:\D|$)/,
    /^(\d{1,2})月(\d{1,2})日?(?:\D|$)/,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) {
      continue;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    if (
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return { month, day };
    }
  }

  return null;
}

function parseDayLabelInMonth(name: string, monthNumber: number): number | null {
  const monthDay = parseMonthDayLabel(name);
  if (monthDay && monthDay.month === monthNumber) {
    return monthDay.day;
  }

  const directDay = name.match(/^(\d{1,2})日?(?:\D|$)/);
  if (!directDay) {
    return null;
  }

  const day = Number(directDay[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

async function listDirectories(pathname: string): Promise<string[]> {
  const entries = await fs.readdir(pathname, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function collectImageFiles(
  absolutePath: string,
  recursive: boolean,
  allowedExtensions: Set<string>
): Promise<string[]> {
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await collectImageFiles(fullPath, true, allowedExtensions)));
      }
      continue;
    }

    if (entry.isFile() && isImageFile(entry.name, allowedExtensions)) {
      files.push(fullPath);
    }
  }

  files.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN', { numeric: true }));
  return files;
}

export function createMediaLibraryService(
  options: MediaLibraryServiceOptions = {}
): MediaLibraryService {
  const roots = options.roots || getDefaultMediaRoots();
  const allowedExtensions = new Set(
    (options.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS).map((extension) =>
      extension.toLowerCase()
    )
  );

  function getRootConfig(rootId: string): MediaRootConfig {
    // custom: 前缀表示用户自定义路径，直接用后面的路径
    if (rootId.startsWith('custom:')) {
      const customPath = rootId.slice(7); // 去掉 "custom:" 前缀
      return { id: rootId, label: customPath.split('/').pop() || customPath, path: customPath };
    }
    const root = roots.find((item) => item.id === rootId);
    if (!root) {
      throw createError('ROOT_NOT_FOUND', `Media root not found: ${rootId}`, 404);
    }
    return root;
  }

  async function resolveRoot(rootId: string) {
    const root = getRootConfig(rootId);
    const rootRealPath = await fs.realpath(resolve(root.path)).catch(() => {
      throw createError('DIRECTORY_NOT_FOUND', `Media root is not available: ${rootId}`, 404);
    });

    return { root, rootRealPath };
  }

  function encodeAssetKey(rootId: string, relativePath: string): string {
    return Buffer.from(JSON.stringify({ rootId, relativePath }), 'utf-8').toString('base64url');
  }

  async function resolveDirectory(
    rootId: string,
    relativePath: string = ''
  ): Promise<ResolvedMediaDirectory> {
    const normalizedPath = normalizeRelativePath(relativePath);
    const { root, rootRealPath } = await resolveRoot(rootId);
    const candidatePath = normalizedPath ? join(rootRealPath, normalizedPath) : rootRealPath;

    const candidateRealPath = await fs.realpath(candidatePath).catch(() => {
      throw createError(
        'DIRECTORY_NOT_FOUND',
        `Directory not found: ${normalizedPath || '.'}`,
        404
      );
    });
    ensureInsideRoot(rootRealPath, candidateRealPath);

    const stat = await fs.stat(candidateRealPath).catch(() => {
      throw createError(
        'DIRECTORY_NOT_FOUND',
        `Directory not found: ${normalizedPath || '.'}`,
        404
      );
    });

    if (!stat.isDirectory()) {
      throw createError(
        'DIRECTORY_NOT_FOUND',
        `Directory not found: ${normalizedPath || '.'}`,
        404
      );
    }

    return {
      root,
      rootRealPath,
      relativePath: normalizedPath,
      absolutePath: candidateRealPath,
    };
  }

  async function resolveFile(rootId: string, relativePath: string): Promise<ResolvedMediaAsset> {
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!normalizedPath) {
      throw createError('FILE_NOT_FOUND', 'File path is required', 404);
    }

    if (!isImageFile(normalizedPath, allowedExtensions)) {
      throw createError('UNSUPPORTED_FILE', 'Unsupported media file type', 400);
    }

    const { root, rootRealPath } = await resolveRoot(rootId);
    const candidatePath = join(rootRealPath, normalizedPath);
    const candidateRealPath = await fs.realpath(candidatePath).catch(() => {
      throw createError('FILE_NOT_FOUND', `File not found: ${normalizedPath}`, 404);
    });
    ensureInsideRoot(rootRealPath, candidateRealPath);

    const stat = await fs.stat(candidateRealPath).catch(() => {
      throw createError('FILE_NOT_FOUND', `File not found: ${normalizedPath}`, 404);
    });

    if (!stat.isFile()) {
      throw createError('FILE_NOT_FOUND', `File not found: ${normalizedPath}`, 404);
    }

    const safeRelativePath = toPosixRelative(rootRealPath, candidateRealPath);
    const filename = basename(candidateRealPath);

    return {
      assetKey: encodeAssetKey(root.id, safeRelativePath),
      rootId: root.id,
      relativePath: safeRelativePath,
      filename,
      parentPath: posix.dirname(safeRelativePath) === '.' ? '' : posix.dirname(safeRelativePath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      mimeType: getMimeType(filename),
      absolutePath: candidateRealPath,
    };
  }

  async function getDateTree(rootId: string = DEFAULT_MEDIA_ROOT_ID): Promise<MediaDateTreeYear[]> {
    const { absolutePath } = await resolveDirectory(rootId, '');
    const years = (await listDirectories(absolutePath))
      .map((name) => ({ name, parsed: parseYearLabel(name) }))
      .filter(
        (
          item
        ): item is {
          name: string;
          parsed: NonNullable<ReturnType<typeof parseYearLabel>>;
        } => Boolean(item.parsed)
      )
      .sort((left, right) => right.parsed.sortValue - left.parsed.sortValue);

    const result: MediaDateTreeYear[] = [];

    for (const year of years) {
      const yearPath = join(absolutePath, year.name);
      const yearChildren = await listDirectories(yearPath);
      const monthMap = new Map<
        number,
        {
          month: string;
          label: string;
          path: string;
          dates: Array<{ label: string; path: string; day: number }>;
        }
      >();

      const monthDirectories = yearChildren
        .map((name) => ({ name, parsed: parseMonthLabel(name) }))
        .filter(
          (
            item
          ): item is {
            name: string;
            parsed: NonNullable<ReturnType<typeof parseMonthLabel>>;
          } => Boolean(item.parsed)
        )
        .sort((left, right) => right.parsed.monthNumber - left.parsed.monthNumber);

      for (const monthDirectory of monthDirectories) {
        const monthPath = join(yearPath, monthDirectory.name);
        const dates = (await listDirectories(monthPath))
          .map((name) => {
            const day = parseDayLabelInMonth(name, monthDirectory.parsed.monthNumber);
            if (!day) {
              return null;
            }

            return {
              label: name,
              path: `${year.name}/${monthDirectory.name}/${name}`,
              day,
            };
          })
          .filter(
            (
              item
            ): item is {
              label: string;
              path: string;
              day: number;
            } => Boolean(item)
          )
          .sort(
            (left, right) =>
              right.day - left.day || left.label.localeCompare(right.label, 'zh-Hans-CN')
          );

        if (dates.length === 0) {
          continue;
        }

        monthMap.set(monthDirectory.parsed.monthNumber, {
          month: monthDirectory.parsed.month,
          label: monthDirectory.name,
          path: `${year.name}/${monthDirectory.name}`,
          dates,
        });
      }

      for (const child of yearChildren) {
        if (monthDirectories.some((monthDirectory) => monthDirectory.name === child)) {
          continue;
        }

        const parsedMonthDay = parseMonthDayLabel(child);
        if (!parsedMonthDay) {
          continue;
        }

        const existingMonth = monthMap.get(parsedMonthDay.month);
        const dateNode = {
          label: child,
          path: `${year.name}/${child}`,
          day: parsedMonthDay.day,
        };

        if (existingMonth) {
          existingMonth.dates.push(dateNode);
          continue;
        }

        monthMap.set(parsedMonthDay.month, {
          month: String(parsedMonthDay.month).padStart(2, '0'),
          label: `${parsedMonthDay.month}月`,
          path: `${year.name}/${parsedMonthDay.month}月`,
          dates: [dateNode],
        });
      }

      const monthNodes = Array.from(monthMap.values())
        .sort((left, right) => Number(right.month) - Number(left.month))
        .map((monthNode) => ({
          month: monthNode.month,
          label: monthNode.label,
          path: monthNode.path,
          dates: monthNode.dates
            .sort(
              (left, right) =>
                right.day - left.day || left.label.localeCompare(right.label, 'zh-Hans-CN')
            )
            .map((date) => ({
              label: date.label,
              path: date.path,
            })),
        }));

      if (monthNodes.length > 0) {
        result.push({
          year: year.parsed.year,
          label: year.name,
          path: year.name,
          months: monthNodes,
        });
      }
    }

    return result;
  }

  async function getFolderTree(
    rootId: string,
    relativePath: string = ''
  ): Promise<MediaFolderNode[]> {
    const { rootRealPath } = await resolveRoot(rootId);
    const normalizedPath = normalizeRelativePath(relativePath);
    const dirPath = normalizedPath ? join(rootRealPath, normalizedPath) : rootRealPath;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: MediaFolderNode[] = [];

    for (const entry of entries) {
      const entryRelPath = normalizedPath ? `${normalizedPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          relativePath: entryRelPath,
          isDirectory: true,
        });
      }
    }

    // 文件夹优先，再按名称排序
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
    });

    return nodes;
  }

  async function getFolderSummary(
    rootId: string,
    relativePath: string = ''
  ): Promise<MediaFolderSummary> {
    const directory = await resolveDirectory(rootId, relativePath);
    const entries = await fs.readdir(directory.absolutePath, { withFileTypes: true });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN', { numeric: true }));

    const summaries = await Promise.all(
      folders.map(async (folderName) => {
        const folderPath = join(directory.absolutePath, folderName);
        const imageFiles = await collectImageFiles(folderPath, true, allowedExtensions);
        const folderRelativePath = [directory.relativePath, folderName].filter(Boolean).join('/');

        return {
          name: folderName,
          relativePath: folderRelativePath,
          imageCount: imageFiles.length,
          coverAssetKey:
            imageFiles.length > 0
              ? encodeAssetKey(rootId, toPosixRelative(directory.rootRealPath, imageFiles[0] || ''))
              : null,
        } satisfies MediaFolderSummaryItem;
      })
    );

    return {
      rootId,
      path: directory.relativePath,
      folders: summaries,
    };
  }

  async function getItems(options: GetItemsOptions): Promise<MediaItemsResult> {
    const rootId = options.rootId || DEFAULT_MEDIA_ROOT_ID;
    const path = options.path || '';
    const recursive = options.recursive || false;
    const limit = Math.min(Math.max(options.limit || 120, 1), 500);
    const offset = decodeCursor(options.cursor);
    const directory = await resolveDirectory(rootId, path);
    const imageFiles = await collectImageFiles(
      directory.absolutePath,
      recursive,
      allowedExtensions
    );
    const pagedFiles = imageFiles.slice(offset, offset + limit);

    const items = await Promise.all(
      pagedFiles.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        const relativePath = toPosixRelative(directory.rootRealPath, filePath);
        const filename = basename(filePath);
        const parentPath = posix.dirname(relativePath) === '.' ? '' : posix.dirname(relativePath);

        return {
          assetKey: encodeAssetKey(rootId, relativePath),
          rootId,
          relativePath,
          filename,
          parentPath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          mimeType: getMimeType(filename),
        } satisfies MediaItem;
      })
    );

    return {
      items,
      nextCursor: offset + limit < imageFiles.length ? encodeCursor(offset + limit) : null,
    };
  }

  async function resolveAsset(assetKey: string): Promise<ResolvedMediaAsset> {
    try {
      const parsed = JSON.parse(Buffer.from(assetKey, 'base64url').toString('utf-8')) as {
        rootId?: string;
        relativePath?: string;
      };

      if (!parsed.rootId || !parsed.relativePath) {
        throw new Error('Invalid asset key payload');
      }

      return resolveFile(parsed.rootId, parsed.relativePath);
    } catch (error) {
      if (error instanceof MediaLibraryError) {
        throw error;
      }
      throw createError('INVALID_ASSET_KEY', 'Invalid asset key', 400);
    }
  }

  async function readAsset(assetKey: string): Promise<ReadAssetResult> {
    const asset = await resolveAsset(assetKey);
    const buffer = await fs.readFile(asset.absolutePath);

    return {
      buffer,
      mimeType: asset.mimeType,
      filename: asset.filename,
    };
  }

  return {
    async getRoots() {
      return roots;
    },
    resolveDirectory,
    getDateTree,
    getFolderTree,
    getFolderSummary,
    getItems,
    resolveAsset,
    readAsset,
    encodeAssetKey,
  };
}

/**
 * Read tags.json from a style folder.
 * Returns a map: { "001.png": ["product", "flat_main"], "002.png": ["outfit"] }
 * Returns empty object if file doesn't exist.
 */
export async function getTagsForFolder(
  rootId: string,
  parentPath: string
): Promise<Record<string, string[]>> {
  try {
    const { absolutePath } = await createMediaLibraryService().resolveDirectory(rootId, parentPath);
    const tagsFilePath = join(absolutePath, 'tags.json');
    const content = await fs.readFile(tagsFilePath, 'utf-8');
    return JSON.parse(content) as Record<string, string[]>;
  } catch {
    // File doesn't exist or invalid JSON — return empty
    return {};
  }
}

/**
 * Write tags.json to a style folder.
 */
export async function setTagsForFolder(
  rootId: string,
  parentPath: string,
  tags: Record<string, string[]>
): Promise<void> {
  const { absolutePath } = await createMediaLibraryService().resolveDirectory(rootId, parentPath);
  const tagsFilePath = join(absolutePath, 'tags.json');
  const content = JSON.stringify(tags, null, 2);
  await fs.writeFile(tagsFilePath, content, 'utf-8');
}
