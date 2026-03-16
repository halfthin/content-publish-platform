import { browserPool, initializeBrowser } from './src/config/playwright';
import { WeiboPublisher } from './src/publishers/weibo';

async function test() {
  console.log('🧪 测试微博发布器...\n');

  let publisher: WeiboPublisher | null = null;

  try {
    // 初始化浏览器池（使用本地浏览器，无头模式）
    console.log('🌐 初始化浏览器池（本地无头模式）...');
    process.env.BROWSERLESS_URL = ''; // 清空 Browserless URL，使用本地浏览器
    process.env.PLAYWRIGHT_HEADLESS = 'true'; // 强制无头模式
    await initializeBrowser({ headless: true }); // 无头模式（服务器环境）
    console.log('✅ 浏览器池初始化完成\n');

    publisher = new WeiboPublisher({
      accountId: 'test-weibo-account',
      headless: true,
      timeout: 60000,
    });

    await publisher.initialize();

    // 测试 1: 检查登录状态
    console.log('\n📋 测试 1: 检查登录状态');
    const isLoggedIn = await publisher.checkLoginStatus();
    console.log(`登录状态：${isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

    // 测试 2: 如果已登录，尝试发布
    if (isLoggedIn) {
      console.log('\n📋 测试 2: 测试发布功能');
      const result = await publisher.publish({
        contentId: 'test-' + Date.now(),
        platform: 'weibo',
        content: {
          title: '微博测试',
          description: '这是一条测试微博 - ' + new Date().toISOString(),
          images: [],
          tags: ['测试', '自动化'],
        },
        scheduledAt: null,
      });
      console.log('发布结果:', result);
    } else {
      console.log('\n⚠️  跳过发布测试（未登录）');
      console.log('💡 提示：请先配置微博 Cookie 或执行登录流程');
    }

    console.log('\n✅ 测试完成');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    if (publisher) {
      await publisher.close();
    }
    await browserPool.close();
    console.log('👋 发布器和浏览器池已关闭');
  }
}

test().catch(console.error);
