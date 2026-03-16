import type { WebSocketHandler } from 'bun';
import { logger } from '../config/logger.js';

interface WSMessage {
  type: string;
  data?: unknown;
}

export function setupWebSocket() {
  return {
    open(ws) {
      ws.data.subscribe('heartbeat');
      logger.info('WebSocket client connected');
    },
    message(ws, message: string) {
      try {
        const msg: WSMessage = JSON.parse(message);
        logger.debug('Received message', { message: msg });

        // Handle heartbeat
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        logger.error('WebSocket message error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    close(_ws) {
      logger.info('WebSocket client disconnected');
    },
  } satisfies WebSocketHandler;
}
