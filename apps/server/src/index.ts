import { config } from 'dotenv';
import { Elysia } from 'elysia';
import { ws } from 'elysia/ws';
import { assertValidProductionEnv } from './config/env';
import { logger } from './config/logger';
import { browserPool, initializeBrowser } from './config/playwright';
import { disconnectPrisma } from './config/prisma';
import { disconnectRedisClient } from './config/redis';
import { setupRoutes } from './routes';
import { startFileWatcher, stopFileWatcher } from './services/file-watcher.service';
import { registerProject } from './services/queue-client';
import { setupWebSocket } from './websocket/server';

// Load environment variables from apps/server/.env
config({ path: '.env', override: true });

if (process.env.NODE_ENV === 'production') {
  assertValidProductionEnv();
}

const PORT = process.env.PORT || 50000;

const app = new Elysia();

// Setup routes
app.use(setupRoutes());

// Register WebSocket
app.use(ws()).ws('/ws', { ...setupWebSocket() });

// Start server
app.listen({
  port: PORT,
  hostname: '0.0.0.0',
});

logger.info({ host: app.server?.hostname, port: app.server?.port }, 'Server started');

// 启动服务
async function bootstrap() {
  try {
    // 1. 启动文件监听
    await startFileWatcher();
    logger.info({ module: 'file-watcher' }, 'File watcher service started');
  } catch (error) {
    logger.error({ module: 'file-watcher', error }, 'Failed to start file watcher');
  }

  try {
    // 2. 初始化浏览器池
    await initializeBrowser({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      slowMo: parseInt(process.env.PLAYWRIGHT_SLOW_MO || '100', 10),
    });
    logger.info({ module: 'playwright' }, 'Browser pool initialized');
  } catch (error) {
    logger.error({ module: 'playwright', error }, 'Failed to initialize browser');
  }

  try {
    // 注册 XHS MCP Publisher（需在 workers 启动之前完成）
    const { createXhsMcpPublishers } = await import('./services/xhs-mcp-publisher');
    const { getChannelRouter } = await import('./services/channel-router');
    const { validateXhsMcpConfig } = await import('./config/xhs-mcp');

    if (validateXhsMcpConfig()) {
      const router = getChannelRouter();
      const publishers = createXhsMcpPublishers();
      for (const pub of publishers) {
        router.register(pub);
      }
      logger.info({ module: 'xhs-mcp' }, `Registered ${publishers.length} XHS MCP publishers`);
    }
  } catch (error) {
    logger.error({ module: 'xhs-mcp', error }, 'Failed to register XHS MCP publishers');
  }

  try {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:50000';
    await registerProject(apiBaseUrl);
    logger.info({ module: 'ht-queue' }, 'Registered cpp-xhs queue to ht-queue');
  } catch (error) {
    logger.warn({ module: 'ht-queue', error }, 'Failed to register ht-queue (non-fatal)');
  }

  logger.info({ module: 'bootstrap' }, 'Bootstrap completed');
}

bootstrap();

// 优雅关闭处理
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully...');

  // 1. 停止文件监听
  stopFileWatcher();

  // 5.5 关闭 SSE 服务端
  try {
    const { getSseServerManager } = await import('./services/sse-server-manager');
    getSseServerManager().shutdown();
    logger.info({ module: 'sse-server' }, 'SSE server manager shut down');
  } catch (error) {
    logger.error({ module: 'sse-server', error }, 'Error shutting down SSE server manager');
  }

  // 6. 关闭浏览器池
  try {
    await browserPool.close();
    logger.info({ module: 'playwright' }, 'Browser pool closed');
  } catch (error) {
    logger.error({ module: 'playwright', error }, 'Error closing browser pool');
  }

  // 7. 关闭服务器
  app.stop();

  // 8. 断开数据库连接
  await disconnectPrisma();

  // 9. 断开共享 Redis 连接
  await disconnectRedisClient();

  logger.info({}, 'Server shutdown complete');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: promise.toString() }, 'Unhandled rejection');
});

// 进程退出事件监控
process.on('exit', (code) => {
  logger.error({ code }, 'Process exit');
});

process.on('beforeExit', () => {
  logger.info('Process beforeExit');
});

export type App = typeof app;
