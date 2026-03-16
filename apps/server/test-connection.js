const { chromium } = require('playwright');

async function test() {
  console.log('🧪 测试 Browserless 连接 (Playwright 协议)...\n');

  try {
    const browser = await chromium.connect({
      wsEndpoint: 'ws://localhost:6666/playwright',
      timeout: 15000,
    });
    console.log('✅ 连接成功');

    const page = await browser.newPage();
    await page.goto('https://example.com', { timeout: 15000 });
    console.log(`✅ 访问成功：${await page.title()}`);

    await browser.close();
    console.log('🎉 测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

test();
