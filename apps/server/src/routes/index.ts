import { Elysia } from 'elysia';
import { logger } from '../config/logger';
import { setupAccountsRoutes } from './accounts';
import { setupContentsRoutes } from './contents';
import { setupPublishStatusRoutes } from './publish-status';

export function setupRoutes() {
  return (
    new Elysia()
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
        logger.debug({ path, method }, 'Request received');
      })
  );
}
