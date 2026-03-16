/**
 * 测试环境设置脚本
 * 
 * 在测试运行前初始化必要的环境
 */

import { browserPool } from '../apps/server/src/config/playwright';
import { prisma } from '../apps/server/src/config/prisma';
import { createLogger } from '../apps/server/src/config/logger';

const logger = createLogger('test-setup');

/**
 * 全局测试设置
 */
export async function setupTestEnvironment(): Promise<void> {
  logger.info('🧪 开始初始化测试环境...');

  try {
    // 1. 初始化浏览器池
    logger.info('正在初始化浏览器池...');
    await browserPool.initialize();
    logger.info('✅ 浏览器池初始化完成');

    // 2. 验证 Prisma 连接
    logger.info('正在验证数据库连接...');
    await prisma.$connect();
    logger.info('✅ 数据库连接成功');

    // 3. 验证数据库表是否存在
    const tableCheck = await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ 数据库查询验证成功');

    logger.info('🎉 测试环境初始化完成！');
  } catch (error) {
    logger.error('❌ 测试环境初始化失败', { error: String(error) });
    throw error;
  }
}

/**
 * 全局测试清理
 */
export async function teardownTestEnvironment(): Promise<void> {
  logger.info('🧹 开始清理测试环境...');

  try {
    // 1. 关闭浏览器池
    logger.info('正在关闭浏览器池...');
    await browserPool.close();
    logger.info('✅ 浏览器池已关闭');

    // 2. 断开数据库连接
    logger.info('正在断开数据库连接...');
    await prisma.$disconnect();
    logger.info('✅ 数据库已断开');

    logger.info('🎉 测试环境清理完成！');
  } catch (error) {
    logger.error('❌ 测试环境清理失败', { error: String(error) });
    throw error;
  }
}

// Bun.test 全局钩子
if (typeof Bun !== 'undefined') {
  Bun.test?.beforeEach?.(async () => {
    // 每个测试前的设置（如果需要）
  });

  Bun.test?.afterEach?.(async () => {
    // 每个测试后的清理（如果需要）
  });
}
