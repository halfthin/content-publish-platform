import { configure, getLogger, jsonLinesFormatter } from '@logtape/logtape';

// 控制台日志 sink
const consoleSink = (record: any) => {
  const formatted = jsonLinesFormatter(record);
  console.log(formatted);
};

// 配置日志
await configure({
  sinks: {
    console: consoleSink,
  },
  loggers: [
    {
      category: ['app'],
      level: 'debug',
      sinks: ['console'],
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
