import type { MediaActionWebSocketMessage } from '@/types/media-action-sse.types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('websocket');

export interface ContentWebSocketMessage {
  type: 'content_updated' | 'content_approved' | 'content_rejected' | 'content_published';
  data: {
    id: string;
    status?: string;
    [key: string]: unknown;
  };
}

export type WebSocketMessage = ContentWebSocketMessage | MediaActionWebSocketMessage;

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectTimer: number | null = null;
  private handlers: MessageHandler[] = [];
  private connected = false;

  /**
   * 连接 WebSocket 服务器
   */
  connect(url?: string) {
    this.url = url || this.getWebSocketUrl();

    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        logger.info('WebSocket connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          this.handlers.forEach((handler) => {
            handler(message);
          });
        } catch (error) {
          logger.error('Failed to parse WebSocket message', { error: String(error) });
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        logger.warn('WebSocket closed, reconnecting');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error', { error: String(error) });
      };
    } catch (error) {
      logger.error('Failed to create WebSocket', { error: String(error) });
      this.scheduleReconnect();
    }
  }

  /**
   * 获取 WebSocket URL
   */
  private getWebSocketUrl(): string {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
    // 将 http 转换为 ws
    return apiBaseUrl.replace('http', 'ws').replace('/api', '/ws');
  }

  /**
   * 安排重连
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = window.setTimeout(() => {
      logger.info('Attempting to reconnect WebSocket...');
      this.connect();
    }, 5000);
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    logger.info('WebSocket disconnected');
  }

  /**
   * 注册消息处理器
   */
  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  /**
   * 移除消息处理器
   */
  offMessage(handler: MessageHandler) {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * 发送消息
   */
  send(message: unknown) {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('WebSocket not connected, message not sent');
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// 导出单例
export const wsService = new WebSocketService();
