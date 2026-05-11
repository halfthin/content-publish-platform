import { EventEmitter } from 'node:events';
import type { ProgressEvent } from '../types/publisher';

const EVENTS_CHANNEL = 'progress';

type ProgressListener = (event: ProgressEvent) => void;

class ProgressEventBus {
  private emitter = new EventEmitter();

  /** 发布进度事件 */
  emit(event: ProgressEvent): void {
    this.emitter.emit(EVENTS_CHANNEL, event);
  }

  /** 订阅所有进度事件 */
  subscribe(listener: ProgressListener): () => void {
    this.emitter.on(EVENTS_CHANNEL, listener);
    return () => this.emitter.off(EVENTS_CHANNEL, listener);
  }

  /** 清除所有订阅（关闭时调用） */
  clear(): void {
    this.emitter.removeAllListeners(EVENTS_CHANNEL);
  }
}

let _bus: ProgressEventBus | null = null;

export function getProgressEventBus(): ProgressEventBus {
  if (!_bus) {
    _bus = new ProgressEventBus();
  }
  return _bus;
}
