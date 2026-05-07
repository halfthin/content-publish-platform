import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { createLogger } from '../config/logger';

const PROJECT_ROOT = resolve(__dirname, '../../../..');
const CACHE_DIR = join(PROJECT_ROOT, '.cache', 'thumbs');

// Target thumbnail size - match the UI display size
const THUMB_SIZE = 240;

const logger = createLogger('media-thumb-cache');

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return mimeMap[ext] || 'image/jpeg';
}

async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function buildCacheKey(assetKey: string, mtimeMs: number): string {
  const raw = `${assetKey}:${mtimeMs}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function cachePath(cacheKey: string): string {
  return join(CACHE_DIR, `${cacheKey}.webp`);
}

export interface ThumbResult {
  buffer: Buffer;
  mimeType: string;
  fromCache: boolean;
}

export async function getThumbBuffer(absolutePath: string, assetKey: string): Promise<ThumbResult> {
  await ensureCacheDir();

  const stat = await fs.stat(absolutePath);
  const cacheKey = buildCacheKey(assetKey, stat.mtimeMs);
  const mimeType = getMimeType(absolutePath);
  const cached = cachePath(cacheKey);

  try {
    await fs.access(cached);
    const buffer = await fs.readFile(cached);
    logger.debug('Thumb cache hit', { cacheKey, assetKey });
    return { buffer, mimeType: 'image/webp', fromCache: true };
  } catch {
    // cache miss - generate thumbnail
  }

  try {
    const buffer = await sharp(absolutePath)
      .resize(THUMB_SIZE, THUMB_SIZE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    await fs.writeFile(cached, buffer);
    logger.debug('Thumb cache generated', { cacheKey, assetKey, sizeKb: buffer.length / 1024 });
    return { buffer, mimeType: 'image/webp', fromCache: false };
  } catch (err) {
    // If sharp fails (e.g., corrupted image), fall back to original
    logger.warn('Sharp thumb generation failed, falling back to original', {
      assetKey,
      error: String(err),
    });
    const original = await fs.readFile(absolutePath);
    return { buffer: original, mimeType, fromCache: false };
  }
}

export async function clearThumbCache(pattern?: string): Promise<number> {
  await ensureCacheDir();
  const entries = await fs.readdir(CACHE_DIR);
  let cleared = 0;

  for (const entry of entries) {
    if (pattern && !entry.includes(pattern)) continue;
    try {
      await fs.rm(join(CACHE_DIR, entry));
      cleared++;
    } catch {
      // ignore
    }
  }

  return cleared;
}
