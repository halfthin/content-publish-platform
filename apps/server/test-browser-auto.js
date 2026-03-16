import { chromium } from 'playwright';
import { createLogger } from './src/config/logger';

const logger = createLogger('browser-test');

// 提供的 Cookie
const TEST_COOKIES = [
  {
    name: 'web_session',
    value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'id_token',
    value:
      'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'xsecappid',
    value: 'xhs-pc-web',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'a1',
    value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'webId',
    value: 'e848b3ccac9c3f57790ef018a6fb43fd',
    domain: '.xiaohongshu.com',
    path: '/',
  },
];

async function testBrowserlessConnection() {
  logger.info('🧪 开始 Browserless 连接测试...');

  const browserlessUrl = process.env.BROWSERLESS_URL || 'ws://localhost:6666/playwright';

  try {
    const browser = await chromium.connect(browserlessUrl);
    logger.info('✅ Browserless 连接成功');

    // 创建上下文并设置 Cookie
    const context = await browser.newContext();
    await context.addCookies(TEST_COOKIES);

    // 创建页面
    const page = await context.newPage();

    // 导航到小红书
    await page.goto('https://www.xiaohongshu.com');

    // 等待页面加载
    await page.waitForTimeout(3000);

    logger.info('✅ 页面加载成功');

    // 检查是否已登录（检查是否有用户头像）
    const hasUserAvatar = await page.$('.user-avatar, img[class*="avatar"]');
    if (hasUserAvatar) {
      logger.info('✅ 检测到已登录状态（有用户头像）');
    } else {
      logger.warn('⚠️  未检测到用户头像，Cookie 可能无效或已过期');
    }

    // 关闭浏览器
    await browser.close();

    return { success: true, logged_in: !!hasUserAvatar };
  } catch (error) {
    logger.error('❌ Browserless 连接失败', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

async function searchAndScrape() {
  logger.info('🧪 开始搜索和数据抓取测试...');

  const browserlessUrl = process.env.BROWSERLESS_URL || 'ws://localhost:6666/playwright';

  try {
    const browser = await chromium.connect(browserlessUrl);
    const context = await browser.newContext();
    await context.addCookies(TEST_COOKIES);
    const page = await browser.newPage();

    // 1. 访问小红书主页
    logger.info('📊 访问小红书主页...');
    await page.goto('https://www.xiaohongshu.com');
    await page.waitForTimeout(3000);

    // 检查登录状态
    const isLoggedIn = await page.$('.user-avatar, a[href*="user"]');
    if (!isLoggedIn) {
      logger.warn('⚠️  未检测到登录状态，部分数据可能无法获取');
    }

    // 2. 搜索"通勤穿搭"
    logger.info('🔍 搜索关键词：通勤穿搭...');
    await page.fill('input[placeholder*="搜索"], input[placeholder*="Search"]', '通勤穿搭');
    await page.press('input[placeholder*="搜索"], input[placeholder*="Search"]', 'Enter');
    await page.waitForTimeout(5000);

    // 3. 抓取博主信息
    logger.info('📝 开始抓取博主信息...');

    // 等待搜索结果加载
    await page.waitForSelector('.note-item, .user-card', { timeout: 10000 });

    // 抓取前 3 个博主的信息
    const bloggers = [];

    const博主选择器 = '.user-card, .note-item .author-info';
    const博主元素 = await page.$$(博主选择器);

    logger.info(`📊 找到 ${博主元素.length} 个博主`);

    for (let i = 0; i < Math.min(3, 博主元素.length); i++) {
      const博主元素 = 博主元素[i];

      // 抓取博主信息
      const昵称 =
        (await 博主元素.$eval('.nickname, .author-name', (el) => el.textContent?.trim())) || '未知';
      const用户ID =
        (await 博主元素.$eval('.user-id, .author-id', (el) => el.textContent?.trim())) || '未知';
      const粉丝数 =
        (await 博主元素.$eval('.follower-count, .Fans', (el) => el.textContent?.trim())) || '未知';

      bloggers.push({
        昵称,
        用户ID,
        粉丝数,
      });

      logger.info(`第 ${i + 1} 个博主: ${昵称} (${用户ID})`);
    }

    // 4. 抓取最新博文数据（如果在博主详情页）
    if (bloggers.length > 0) {
      logger.info('📝 开始抓取博主最新博文...');

      for (const博主 of bloggers) {
        logger.info(`正在抓取 ${博主.昵称} 的最新博文...`);

        // 这里可以添加更多逻辑来抓取博文数据
        // 例如：点击博主卡片进入详情页，然后抓取笔记
      }
    }

    // 关闭浏览器
    await browser.close();

    return { success: true, bloggers };
  } catch (error) {
    logger.error('❌ 抓取失败', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

// 主函数
async function main() {
  console.log('🧪 开始 Browserless + Cookie 验证测试...\n');

  // 测试 1: Browserless 连接
  console.log('=== 1. Browserless 连接测试 ===');
  const connectResult = await testBrowserlessConnection();
  console.log('连接状态:', connectResult.success ? '✅ 成功' : '❌ 失败');

  if (!connectResult.success) {
    console.log('错误:', connectResult.error);
    console.log('\n测试结束：Browserless 无法连接');
    return;
  }

  // 测试 2: 搜索和抓取
  console.log('\n=== 2. 搜索和数据抓取测试 ===');
  const scrapeResult = await searchAndScrape();

  if (scrapeResult.success) {
    console.log('\n✅ 抓取成功！');

    if (scrapeResult.bloggers && scrapeResult.bloggers.length > 0) {
      console.log('\n📋 抓取结果:');
      for (let i = 0; i < scrapeResult.bloggers.length; i++) {
        const博主 = scrapeResult.bloggers[i];
        console.log(`\n博主 ${i + 1}:`);
        console.log(`  昵称: ${博主.昵称}`);
        console.log(`  用户ID: ${博主.用户ID}`);
        console.log(`  粉丝数: ${博主.粉丝数}`);

        // 可以添加更多博主信息和博文数据
      }
    } else {
      console.log('⚠️  未找到博主数据，可能是页面结构变化或登录状态问题');
    }
  } else {
    console.log('\n❌ 抓取失败');
    console.log('错误:', scrapeResult.error);
  }

  console.log('\n🎉 测试完成！');
}

main().catch(console.error);
