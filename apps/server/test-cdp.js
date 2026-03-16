const { chromium } = require('playwright');

async function test() {
  console.log('🧪 测试 CDP 模式连接...\n');

  try {
    // 使用 CDP 模式连接
    const browser = await chromium.connectOverCDP('http://localhost:6666', {
      timeout: 15000,
    });
    console.log('✅ CDP 连接成功');

    // 获取现有上下文或创建新页面
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = await context.newPage();

    console.log('正在访问 https://example.com ...');
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
