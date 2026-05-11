import { createLogger } from '../config/logger';
import { getProgressEventBus } from './progress-event-bus';

const logger = createLogger('sse-server');

class SseServerManager {
  private listeners: Array<() => void> = [];

  /** 创建 SSE ReadableStream（供 Elysia 路由使用） */
  createStream(request: Request): ReadableStream {
    const stream = new ReadableStream({
      start: (controller) => {
        // 发送初始连接确认
        const connected = `data: ${JSON.stringify({ type: 'publish', platform: 'system', status: 'connected' })}\n\n`;
        controller.enqueue(new TextEncoder().encode(connected));

        // 订阅 EventBus
        const unsubscribe = getProgressEventBus().subscribe((event) => {
          try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch {
            unsubscribe();
          }
        });
        this.listeners.push(unsubscribe);

        // 客户端断开时清理
        request.signal.addEventListener('abort', () => {
          unsubscribe();
          this.listeners = this.listeners.filter((l) => l !== unsubscribe);
          logger.info('SSE client disconnected');
        });

        logger.info('SSE client connected');
      },
    });

    return stream;
  }

  shutdown(): void {
    for (const unsub of this.listeners) {
      unsub();
    }
    this.listeners = [];
    logger.info('SSE server manager shut down');
  }
}

let _manager: SseServerManager | null = null;

export function getSseServerManager(): SseServerManager {
  if (!_manager) {
    _manager = new SseServerManager();
  }
  return _manager;
}

export type { SseServerManager };
