import { browserPool, initializeBrowser } from './src/config/playwright';
import { DouyinPublisher } from './src/publishers/douyin';

async function test() {
  console.log('🧪 测试抖音发布器...\n');

  let publisher: DouyinPublisher | null = null;

  try {
    // 初始化浏览器池（使用本地浏览器，无头模式）
    console.log('🌐 初始化浏览器池（本地无头模式）...');
    process.env.BROWSERLESS_URL = ''; // 清空 Browserless URL，使用本地浏览器
    process.env.PLAYWRIGHT_HEADLESS = 'true'; // 强制无头模式
    await initializeBrowser({ headless: true }); // 无头模式（服务器环境）
    console.log('✅ 浏览器池初始化完成\n');

    publisher = new DouyinPublisher({
      accountId: 'test-douyin-account',
      headless: true,
      timeout: 180000, // 抖音发布耗时较长
    });

    await publisher.initialize();

    // 测试 1: 检查登录状态
    console.log('\n📋 测试 1: 检查登录状态');
    const isLoggedIn = await publisher.checkLoginStatus();
    console.log(`登录状态：${isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

    // 测试 2: 如果已登录，尝试发布
    if (isLoggedIn) {
      console.log('\n📋 测试 2: 测试发布功能');

      // 注意：需要提供真实的视频文件路径
      const videoPath = process.env.TEST_VIDEO_PATH || './test-video.mp4';

      const result = await publisher.publish({
        contentId: 'test-' + Date.now(),
        platform: 'douyin',
        content: {
          title: '抖音视频测试',
          description: '这是一条测试抖音视频 - ' + new Date().toISOString(),
          video: videoPath,
          tags: ['测试', '自动化'],
        },
        scheduledAt: null,
      });
      console.log('发布结果:', result);
    } else {
      console.log('\n⚠️  跳过发布测试（未登录）');
      console.log('💡 提示：请先配置抖音 Cookie 或执行登录流程');
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
