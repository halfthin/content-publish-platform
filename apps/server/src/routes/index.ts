import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { logger } from '../config/logger';
import { setupAccountsRoutes } from './accounts';
import { setupContentsRoutes } from './contents';
import { setupPublishStatusRoutes } from './publish-status';

export function setupRoutes() {
  return (
    new Elysia()
      .use(cors({
        origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }))
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
      .onRequest(({ path, method }) => {
        // 过滤高频噪音路径
        if (path === '/ws' || path.startsWith('/ws/')) {
          return;
        }
        logger.debug({ path, method }, 'Request received');
      })
  );
}
