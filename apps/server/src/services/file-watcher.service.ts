import { promises as fs, watch } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../config/logger';
import { scanInbox } from './content.service';

const logger = createLogger('file-watcher');

const CONTENT_BASE_DIR = process.env.CONTENT_DIR || './content';
const INBOX_DIR = join(CONTENT_BASE_DIR, 'inbox');

let watcher: ReturnType<typeof watch> | null = null;
let scanTimeout: NodeJS.Timeout | null = null;

/**
 * 防抖扫描函数
 */
function debounceScan(delay: number = 1000): void {
  if (scanTimeout) {
    clearTimeout(scanTimeout);
  }

  scanTimeout = setTimeout(async () => {
    try {
      logger.info({}, 'File change detected, scanning inbox');
      await scanInbox();
    } catch (error) {
      logger.error({ error }, 'Error scanning inbox after file change');
    }
  }, delay);
}

/**
 * 启动文件监听服务
 */
export async function startFileWatcher(): Promise<void> {
  // 确保 inbox 目录存在
  try {
    await fs.mkdir(INBOX_DIR, { recursive: true });
    logger.info({ path: INBOX_DIR }, 'Inbox directory ready');
  } catch (error) {
    logger.error({ error }, 'Error creating inbox directory');
    return;
  }

  // 如果已有监听器，先关闭
  if (watcher) {
    watcher.close();
  }

  // 创建监听器
  watcher = watch(INBOX_DIR, { recursive: true }, async (eventType, filename) => {
    logger.debug({ eventType, filename }, 'File event');

    // 只对文件创建事件做出响应
    if (eventType === 'rename' || eventType === 'change') {
      debounceScan(1500); // 1.5 秒防抖
    }
  });

  logger.info({ path: INBOX_DIR }, 'File watcher started');

  // 初始扫描
  await scanInbox();
}

/**
 * 停止文件监听服务
 */
export function stopFileWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    logger.info({}, 'File watcher stopped');
  }

  if (scanTimeout) {
    clearTimeout(scanTimeout);
    scanTimeout = null;
  }
}

/**
 * 检查监听器状态
 */
export function isWatcherActive(): boolean {
  return watcher !== null;
}
