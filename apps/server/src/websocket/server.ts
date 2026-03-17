import { logger } from '../config/logger.js';

interface WSMessage {
  type: string;
  data?: unknown;
}

export function setupWebSocket() {
  return {
    open(ws: any) {
      logger.info('WebSocket client connected');
    },
    message(ws: any, message: string) {
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
    close(ws: any) {
      logger.info('WebSocket client disconnected');
    },
  };
}
