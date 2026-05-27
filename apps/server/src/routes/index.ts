import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';
import { setupAuthMiddleware } from '../middleware/auth';
import { setupAccountsRoutes } from './accounts';
import { setupApiDocRoutes } from './api-doc';
import { setupContentsRoutes } from './contents';
import { setupHealthRoutes } from './health';
import { setupMediaRoutes } from './media';
import { setupPublishRoutes } from './publish';
import { setupPublishStatusRoutes } from './publish-status';
import { setupXhsCallbackRoutes } from './queues/xhs.callback';
import { setupWebhookRoutes } from './webhook';
import { setupXhsRoutes } from './xhs';

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
      .use(setupAuthMiddleware())
      .get('/', () => ({
        name: 'Content Publish Platform API',
        version: '1.0.0',
        status: 'running',
      }))
      .get('/api', () => ({
        name: 'Content Publish Platform API',
        version: '1.0.0',
        status: 'running',
      }))
      .use(setupHealthRoutes())
      // Swagger/OpenAPI 文档
      .use(setupApiDocRoutes())
      // 内容管理 API
      .use(setupContentsRoutes())
      // 账号管理 API
      .use(setupAccountsRoutes())
      // 发布状态跟踪 API
      .use(setupPublishStatusRoutes())
      // Webhook 回调
      .use(setupWebhookRoutes())
      // 小红书 MCP 回调
      .use(setupXhsCallbackRoutes())
      // 素材库 API
      .use(setupMediaRoutes())
      // 通用发布 API
      .use(setupPublishRoutes())
      // 小红书 MCP 直连 API
      .use(setupXhsRoutes())
      .onRequest(({ path, method }) => {
        // 过滤高频噪音路径
        if (path === '/ws' || path?.startsWith('/ws/')) {
          return;
        }
        requestLogger.debug({ path, method }, 'Request received');
      })
  );
}
