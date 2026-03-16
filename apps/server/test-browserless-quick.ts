#!/usr/bin/env bun
/**
 * Browserless 连接测试脚本
 *
 * 使用方法:
 *   bun test-browserless-quick.ts
 *
 * 或者指定端点:
 *   BROWSERLESS_URL=ws://localhost:6666/playwright bun test-browserless-quick.ts
 */

import { chromium } from 'playwright';

async function test() {
  console.log('🔌 Browserless 连接测试\n');

  const wsEndpoint = process.env.BROWSERLESS_URL || 'ws://localhost:6666/playwright';
  console.log(`端点：${wsEndpoint}\n`);

  try {
    console.log('正在连接...');
    const browser = await chromium.connect({ wsEndpoint });
    console.log('✅ 连接成功\n');

    console.log('创建页面...');
    const page = await browser.newPage();

    console.log('访问 https://example.com...');
    await page.goto('https://example.com');

    const title = await page.title();
    console.log(`✅ 页面标题：${title}\n`);

    console.log('测试截图...');
    await page.screenshot({ path: '/tmp/browserless-test.png' });
    console.log('✅ 截图已保存到 /tmp/browserless-test.png\n');

    console.log('测试 JavaScript 执行...');
    const info = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
    }));
    console.log(`✅ User-Agent: ${info.userAgent.substring(0, 60)}...`);
    console.log(`✅ Language: ${info.language}`);
    console.log(`✅ Platform: ${info.platform}\n`);

    await browser.close();
    console.log('👋 浏览器已关闭\n');
    console.log('🎉 所有测试通过！');

    return true;
  } catch (error: any) {
    console.log('\n❌ 测试失败\n');
    console.log('错误信息:', error.message?.split('\n')[0] || String(error));

    if (error.message?.includes('version mismatch')) {
      console.log('\n⚠️  Playwright 版本不匹配！');
      console.log('解决方案:');
      console.log('  1. 升级 Browserless 到 v1.58+');
      console.log('  2. 或降级项目 Playwright 到 v1.41');
      console.log('\n查看 docs/BROWSERLESS_TEST_REPORT.md 获取详细信息');
    }

    return false;
  }
}

const success = await test();
process.exit(success ? 0 : 1);
