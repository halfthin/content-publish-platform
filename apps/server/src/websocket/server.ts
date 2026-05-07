import { logger } from '../config/logger.js';
import type { MediaActionBroadcast } from '../types/media-action-sse.js';

interface WSMessage {
  type: string;
  data?: unknown;
}

interface WebSocketClient {
  send(message: string): void;
  isAlive?: boolean;
}

const clients = new Set<WebSocketClient>();

export function setupWebSocket() {
  return {
    open(ws: WebSocketClient) {
      clients.add(ws);
      ws.isAlive = true;
      logger.info('WebSocket client connected', { clientCount: clients.size });
    },
    message(ws: WebSocketClient, message: string) {
      ws.isAlive = true;
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
    close(ws: WebSocketClient) {
      clients.delete(ws);
      logger.info('WebSocket client disconnected', { clientCount: clients.size });
    },
  };
}

/**
 * Broadcast a media action event to all connected WebSocket clients
 */
export function broadcastMediaAction(message: MediaActionBroadcast): void {
  const payload = JSON.stringify({ ...message, timestamp: Date.now() });
  let sent = 0;

  for (const client of clients) {
    try {
      client.send(payload);
      sent++;
    } catch {
      // Remove dead clients silently
      clients.delete(client);
    }
  }

  logger.debug('Broadcast media action', {
    type: message.type,
    clientCount: sent,
  });
}
