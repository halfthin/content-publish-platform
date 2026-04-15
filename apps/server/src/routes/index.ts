import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';
import { setupAccountsRoutes } from './accounts';
import { setupContentsRoutes } from './contents';
import { setupMediaRoutes } from './media';
import { setupMediaActionRoutes } from './media-actions';
import { setupPublishStatusRoutes } from './publish-status';
import { setupWebhookRoutes } from './webhook';

const requestLogger = createLogger('request');

export function setupRoutes() {
  return (
    new Elysia()
      .use(
        cors({
          origin: [
            'http://localhost:50010',
            'http://127.0.0.1:50010',
            'http://localhost:5173',
            'http://localhost:5174',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://localhost:50001',
            'http://127.0.0.1:50001',
          ],
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization'],
        })
      )
      .get('/', () => ({
        name: 'Content Publish Platform API',
        version: '1.0.0',
        status: 'running',
      }))
      .get('/health', () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
      }))
      // 内容管理 API
      .use(setupContentsRoutes())
      // 账号管理 API
      .use(setupAccountsRoutes())
      // 发布状态跟踪 API
      .use(setupPublishStatusRoutes())
      // Webhook 回调
      .use(setupWebhookRoutes())
      // 素材库 API
      .use(setupMediaRoutes())
      // 素材动作 API
      .use(setupMediaActionRoutes())
      .onRequest(({ path, method }) => {
        // 过滤高频噪音路径
        if (path === '/ws' || path.startsWith('/ws/')) {
          return;
        }
        requestLogger.debug({ path, method }, 'Request received');
      })
  );
}
