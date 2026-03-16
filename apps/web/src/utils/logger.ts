/**
 * 前端日志工具（使用 console，因为浏览器环境）
 * 生产环境可替换为远程日志服务
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  [key: string]: unknown;
}

class FrontendLogger {
  private module: string;

  constructor(module: string = 'app') {
    this.module = module;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? JSON.stringify(context) : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.module}] ${message} ${ctx}`.trim();
  }

  debug(message: string, context?: LogContext): void {
    if (import.meta.env.DEV) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatMessage('error', message, context));
  }

  child(module: string): FrontendLogger {
    return new FrontendLogger(`${this.module}:${module}`);
  }
}

// 导出工厂函数
export function createLogger(module: string): FrontendLogger {
  return new FrontendLogger(module);
}

// 默认日志实例
export const logger = new FrontendLogger('app');

// 保持与原 log 对象兼容
export const log = {
  debug: (msg: string, ctx?: LogContext) => logger.debug(msg, ctx),
  info: (msg: string, ctx?: LogContext) => logger.info(msg, ctx),
  warn: (msg: string, ctx?: LogContext) => logger.warn(msg, ctx),
  error: (msg: string, ctx?: LogContext) => logger.error(msg, ctx),
};
