/**
 * 微博发布器测试脚本
 *
 * 用途：
 * - 验证微博发布器基本功能
 * - 测试登录流程（需要人工扫码）
 * - 测试 Cookie 保存/加载
 * - 测试内容发布
 *
 * 使用方法：
 * 1. 基础测试（不登录）: bun test-weibo.ts
 * 2. 登录测试：bun test-weibo.ts --login
 * 3. 发布测试：bun test-weibo.ts --publish
 */

import { createLogger } from './src/config/logger';
import { browserPool } from './src/config/playwright';
import { WeiboPublisher } from './src/publishers/weibo';
import type { PublishJob } from './src/queues/publish-queue';

const logger = createLogger('weibo-test');

// 解析命令行参数
const args = process.argv.slice(2);
const LOGIN_MODE = args.includes('--login');
const PUBLISH_MODE = args.includes('--publish');
const ACCOUNT_ID = 'test-weibo-account';

async function runTests() {
  console.log('🧪 微博发布器测试开始\n');
  console.log(`模式：${LOGIN_MODE ? '登录' : PUBLISH_MODE ? '发布' : '基础'}`);
  console.log(`账号：${ACCOUNT_ID}\n`);

  let publisher: WeiboPublisher | null = null;

  try {
    // 初始化浏览器（使用本地模式）
    console.log('1️⃣ 初始化浏览器...');
    process.env.BROWSERLESS_URL = ''; // 强制使用本地浏览器
    await browserPool.initialize();
    console.log('✅ 浏览器初始化成功\n');

    // 创建发布器
    console.log('2️⃣ 创建微博发布器...');
    publisher = new WeiboPublisher({
      accountId: ACCOUNT_ID,
      headless: true,
      timeout: 120000,
    });
    await publisher.initialize();
    console.log('✅ 发布器初始化成功\n');

    if (LOGIN_MODE) {
      // 登录测试
      console.log('3️⃣ 执行登录流程...');
      console.log('⚠️  请在打开的浏览器窗口中扫码登录微博\n');

      const loginSuccess = await publisher.login();

      if (loginSuccess) {
        console.log('✅ 登录成功\n');

        // 保存 Cookie
        console.log('4️⃣ 保存 Cookie...');
        const encryptedCookies = await publisher.saveCookies('test-password');
        console.log('✅ Cookie 已保存');
        console.log(`加密后的 Cookie: ${encryptedCookies.substring(0, 50)}...\n`);
      } else {
        console.log('❌ 登录失败\n');
      }
    } else if (PUBLISH_MODE) {
      // 发布测试
      console.log('3️⃣ 加载 Cookie...');
      // 这里需要从配置文件或环境变量加载之前保存的 Cookie
      console.log('⚠️  发布测试需要先执行登录测试保存 Cookie\n');

      // 创建测试发布任务
      const testJob: PublishJob = {
        contentId: 'test-001',
        platform: 'weibo',
        accountId: ACCOUNT_ID,
        content: {
          title: '测试微博',
          description: '这是一条测试微博，来自自动化发布系统 #测试# #自动化#',
          tags: ['测试', '自动化'],
          images: [], // 可以添加图片路径
        },
        scheduledAt: null,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log('4️⃣ 执行发布...');
      const result = await publisher.publish(testJob);

      if (result.success) {
        console.log('✅ 发布成功');
        console.log(`发布链接：${result.publishedUrl}\n`);
      } else {
        console.log('❌ 发布失败');
        console.log(`错误：${result.error}\n`);
      }
    } else {
      // 基础测试
      console.log('3️⃣ 检查登录状态...');
      const isLoggedIn = await publisher.checkLoginStatus();
      console.log(`登录状态：${isLoggedIn ? '已登录' : '未登录'}\n`);

      console.log('4️⃣ 测试页面访问...');
      const context = browserPool.getContext(ACCOUNT_ID);
      if (context) {
        const page = await context.newPage();
        await page.goto('https://weibo.com', { waitUntil: 'networkidle', timeout: 30000 });
        console.log(`✅ 微博首页访问成功`);
        console.log(`页面标题：${await page.title()}\n`);
        await page.close();
      }
    }

    console.log('🎉 测试完成！\n');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  } finally {
    // 清理资源
    if (publisher) {
      await browserPool.removeContext(ACCOUNT_ID);
    }
    await browserPool.close();
    console.log('📦 资源已清理\n');
  }
}

// 运行测试
runTests().catch(console.error);
