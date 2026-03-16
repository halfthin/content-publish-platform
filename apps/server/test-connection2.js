const { chromium } = require('playwright');

async function test() {
  console.log('🧪 测试 Browserless 连接 (详细日志)...\n');

  let browser;
  try {
    console.log('正在连接 ws://localhost:6666/playwright ...');

    browser = await chromium.connect({
      wsEndpoint: 'ws://localhost:6666/playwright',
      timeout: 30000,
      logger: {
        isEnabled: (name, severity) => true,
        log: (name, severity, message, args) => {
          console.log(`[${severity}] ${name}:`, message, args);
        },
      },
    });

    console.log('✅ 浏览器连接成功');
    console.log('浏览器版本:', browser.version());

    const page = await browser.newPage();
    console.log('✅ 页面创建成功');

    console.log('正在访问 https://example.com ...');
    await page.goto('https://example.com', { timeout: 30000 });
    console.log('✅ 页面加载成功');

    const title = await page.title();
    console.log(`页面标题：${title}`);

    await browser.close();
    console.log('🎉 所有测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
}

test();
