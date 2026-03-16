import { config } from 'dotenv';
import { Elysia } from 'elysia';
import { logger } from './config/logger';
import { browserPool, initializeBrowser } from './config/playwright';
import { disconnectPrisma } from './config/prisma';
import { publishQueue, startAllWorkers } from './queues/publish-queue';
import { setupRoutes } from './routes';
import { startFileWatcher, stopFileWatcher } from './services/file-watcher.service';

// Load environment variables from project root .env file
config({ path: '../../.env' });

const PORT = process.env.PORT || 3000;

const app = new Elysia().use(setupRoutes()).listen({
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

    // 2. 初始化浏览器池
    await initializeBrowser({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      slowMo: parseInt(process.env.PLAYWRIGHT_SLOW_MO || '100', 10),
    });
    logger.info({ module: 'playwright' }, 'Browser pool initialized');

    // 3. 启动发布队列 Worker
    startAllWorkers();
    logger.info({ module: 'publish-queue' }, 'Publish queue workers started');

    logger.info({ module: 'bootstrap' }, 'All services started successfully');
  } catch (error) {
    logger.error({ module: 'bootstrap', error }, 'Failed to start services');
  }
}

bootstrap();

// 优雅关闭处理
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully...');

  // 1. 停止文件监听
  stopFileWatcher();

  // 2. 关闭发布队列
  try {
    await publishQueue.close();
    logger.info({ module: 'publish-queue' }, 'Publish queue closed');
  } catch (error) {
    logger.error({ module: 'publish-queue', error }, 'Error closing publish queue');
  }

  // 3. 关闭浏览器池
  try {
    await browserPool.close();
    logger.info({ module: 'playwright' }, 'Browser pool closed');
  } catch (error) {
    logger.error({ module: 'playwright', error }, 'Error closing browser pool');
  }

  // 4. 关闭服务器
  app.stop();

  // 5. 断开数据库连接
  await disconnectPrisma();

  logger.info({}, 'Server shutdown complete');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: promise.toString() }, 'Unhandled rejection');
});

export type App = typeof app;
