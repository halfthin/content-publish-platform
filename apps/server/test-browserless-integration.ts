#!/usr/bin/env bun
/**
 * Browserless v1.61 集成测试
 * 使用 CDP 模式连接
 */

import { chromium } from 'playwright';

async function test() {
  console.log('🧪 Browserless v1.61 集成测试 (CDP 模式)\n');
  console.log('='.repeat(50));

  // 使用 CDP 端点
  const httpEndpoint = 'http://localhost:6666';
  console.log(`\n📡 CDP 端点：${httpEndpoint}\n`);

  let browser: any = null;

  try {
    console.log('1️⃣ 连接 Browserless...');
    browser = await chromium.connectOverCDP(httpEndpoint);
    console.log('   ✅ 连接成功\n');

    console.log('2️⃣ 创建页面...');
    const context = browser.contexts[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    console.log('   ✅ 页面创建成功\n');

    console.log('3️⃣ 访问 https://example.com...');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log(`   ✅ 页面标题：${title}\n`);

    console.log('4️⃣ 测试截图...');
    await page.screenshot({ path: '/tmp/browserless-test.png' });
    console.log('   ✅ 截图已保存到 /tmp/browserless-test.png\n');

    console.log('5️⃣ 测试 JavaScript 执行...');
    const info = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
    }));
    console.log(`   ✅ User-Agent: ${info.userAgent.substring(0, 60)}...`);
    console.log(`   ✅ Language: ${info.language}`);
    console.log(`   ✅ Platform: ${info.platform}\n`);

    console.log('6️⃣ 关闭浏览器...');
    await browser.close();
    console.log('   ✅ 浏览器已关闭\n');

    console.log('='.repeat(50));
    console.log('🎉 所有测试通过！');
    console.log('='.repeat(50));

    return true;
  } catch (error: any) {
    console.log('\n❌ 测试失败\n');
    console.log('错误信息:', error.message || String(error));

    if (browser) {
      await browser.close().catch(() => {});
    }

    return false;
  }
}

const success = await test();
process.exit(success ? 0 : 1);
