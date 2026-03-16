import path from 'node:path';
import { getFileSink } from '@logtape/file';
import { configure, getLogger, jsonLinesFormatter } from '@logtape/logtape';

// 获取日志文件绝对路径
const logPath = path.join(process.cwd(), 'logs', 'app.log');

// 配置日志
await configure({
  sinks: {
    file: getFileSink(logPath, {
      formatter: jsonLinesFormatter,
    }),
  },
  loggers: [
    {
      category: ['app'],
      level: 'debug',
      sinks: ['file'],
    },
  ],
});

export const logger = getLogger(['app']);

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
