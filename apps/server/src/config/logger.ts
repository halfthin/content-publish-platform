import { configure, getLogger, jsonLinesFormatter } from '@logtape/logtape';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// 控制台日志 sink
const consoleSink = (record: any) => {
  const formatted = jsonLinesFormatter(record);
  console.log(formatted);
};

// P1: 独立 cookie-verify 日志文件 sink
const LOG_DIR = join(process.cwd(), 'logs');
const VERIFY_LOG_FILE = join(LOG_DIR, 'cookie-verify.log');

// 确保日志目录存在
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const verifyFileSink = (record: any) => {
  const formatted = jsonLinesFormatter(record);
  try {
    appendFileSync(VERIFY_LOG_FILE, formatted + '\n');
  } catch (err) {
    console.error('Failed to write verify log:', err);
  }
};

// 配置日志
await configure({
  sinks: {
    console: consoleSink,
    verifyFile: verifyFileSink,
  },
  loggers: [
    {
      category: ['app'],
      level: 'debug',
      sinks: ['console'],
    },
    {
      category: ['app', 'cookie-verify'],
      level: 'debug',
      sinks: ['console', 'verifyFile'],
    },
  ],
});

export const logger = getLogger(['app']);
export const verifyLogger = getLogger(['app', 'cookie-verify']);

// 导出便捷方法（保持与原 log 对象兼容）
export const log = {
  debug: (msg: string, ...args: unknown[]) => logger.debug(msg, args),
  info: (msg: string, ...args: unknown[]) => logger.info(msg, args),
  warn: (msg: string, ...args: unknown[]) => logger.warn(msg, args),
  error: (msg: string, ...args: unknown[]) => logger.error(msg, args),
};

// 导出子日志器创建函数
export function createLogger(module: string) {
  return getLogger(['app', module]);
}

export default logger;
