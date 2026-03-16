const { chromium } = require('playwright');

async function test() {
  console.log('🧪 测试本地浏览器模式...\n');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('✅ 浏览器启动成功');

    const page = await browser.newPage();
    console.log('✅ 页面创建成功');

    console.log('正在访问 https://example.com ...');
    await page.goto('https://example.com', { timeout: 15000 });
    console.log(`✅ 访问成功：${await page.title()}`);

    // 测试截图
    await page.screenshot({ path: '/tmp/test-screenshot.png' });
    console.log('✅ 截图保存成功：/tmp/test-screenshot.png');

    await browser.close();
    console.log('🎉 本地浏览器测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
}

test();
