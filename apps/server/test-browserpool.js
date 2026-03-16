const { browserPool } = require('./src/config/playwright');

async function test() {
  console.log('🧪 测试 BrowserPool 初始化...\n');

  try {
    await browserPool.initialize();
    console.log('✅ 浏览器初始化成功');

    const stats = browserPool.getStats();
    console.log('📊 状态:', stats);

    const context = await browserPool.createContext('test');
    console.log('✅ 上下文创建成功');

    const page = await context.newPage();
    await page.goto('https://example.com');
    console.log(`✅ 访问成功：${await page.title()}`);

    await context.close();
    await browserPool.close();
    console.log('🎉 测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error);
    process.exit(1);
  }
}

test();
