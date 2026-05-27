import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configure, getLogger, jsonLinesFormatter } from '@logtape/logtape';

type LogRecord = Parameters<typeof jsonLinesFormatter>[0];

// 日志目录
const LOG_DIR = join(process.cwd(), 'logs');

// 确保日志目录存在
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// 控制台日志 sink
const consoleSink = (record: LogRecord) => {
  // 过滤掉高频 request 日志 - 检查 message 是否包含 path
  if (record.level === 'debug' && record.message) {
    const msgStr =
      typeof record.message === 'string' ? record.message : JSON.stringify(record.message);
    if (msgStr.includes('"path":"/api/') || msgStr.includes('"path":"/health"')) {
      return; // 跳过 request 日志
    }
  }
  const formatted = jsonLinesFormatter(record);
  console.log(formatted);
};

// 独立 cookie-verify 日志文件 sink
const VERIFY_LOG_FILE = join(LOG_DIR, 'cookie-verify.log');

const verifyFileSink = (record: LogRecord) => {
  const formatted = jsonLinesFormatter(record);
  try {
    appendFileSync(VERIFY_LOG_FILE, `${formatted}\n`);
  } catch (err) {
    console.error('Failed to write verify log:', err);
  }
};

// Request 请求日志文件 sink（高频，不输出到控制台）
const REQUEST_LOG_FILE = join(LOG_DIR, 'request.log');

const requestFileSink = (record: LogRecord) => {
  const formatted = jsonLinesFormatter(record);
  try {
    appendFileSync(REQUEST_LOG_FILE, `${formatted}\n`);
  } catch (err) {
    console.error('Failed to write request log:', err);
  }
};

// 其他 debug 日志文件 sink
const DEBUG_LOG_FILE = join(LOG_DIR, 'debug.log');

const debugFileSink = (record: LogRecord) => {
  const formatted = jsonLinesFormatter(record);
  try {
    appendFileSync(DEBUG_LOG_FILE, `${formatted}\n`);
  } catch (err) {
    console.error('Failed to write debug log:', err);
  }
};

// 确保 publish 日志子目录存在
mkdirSync(join(LOG_DIR, 'publish'), { recursive: true });

const sinks: Record<string, (record: LogRecord) => void> = {
  console: consoleSink,
  verifyFile: verifyFileSink,
  requestFile: requestFileSink,
  debugFile: debugFileSink,
};

const loggers: Array<{
  category: string[];
  level: string;
  sinks: string[];
}> = [
  // 根 logger - info 级别，不包含 request
  {
    category: ['app'],
    level: 'info',
    sinks: ['console'],
  },
  // cookie-verify - debug + console + file
  {
    category: ['app', 'cookie-verify'],
    level: 'debug',
    sinks: ['console', 'verifyFile'],
  },
  // request - 只输出到文件，不输出到控制台
  {
    category: ['app', 'request'],
    level: 'debug',
    sinks: ['requestFile'],
  },
  // media - 只输出到 debug 文件
  {
    category: ['app', 'media'],
    level: 'debug',
    sinks: ['debugFile'],
  },
  // file-watcher - debug + console
  {
    category: ['app', 'file-watcher'],
    level: 'debug',
    sinks: ['console'],
  },
  // content-service - debug + console
  {
    category: ['app', 'content-service'],
    level: 'debug',
    sinks: ['console'],
  },
];

// Per-platform publish log sinks
const PUBLISH_PLATFORMS = ['xiaohongshu', 'weibo', 'douyin', 'bilibili', 'wechat'];

for (const platform of PUBLISH_PLATFORMS) {
  const PUBLISH_LOG_FILE = join(LOG_DIR, 'publish', `${platform}.log`);
  const sinkName = `publishFile:${platform}`;
  sinks[sinkName] = (record: LogRecord) => {
    const formatted = jsonLinesFormatter(record);
    try {
      appendFileSync(PUBLISH_LOG_FILE, `${formatted}\n`);
    } catch (err) {
      console.error(`Failed to write publish log (${platform}):`, err);
    }
  };
  loggers.push({
    category: ['app', 'publish', platform],
    level: 'debug',
    sinks: ['console', sinkName],
  });
}

// 配置日志
await configure({
  sinks,
  loggers,
});

export const logger = getLogger(['app']);
export const verifyLogger = getLogger(['app', 'cookie-verify']);

// 导出便捷方法
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
