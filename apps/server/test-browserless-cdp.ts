#!/usr/bin/env bun
/**
 * Browserless v1.61 CDP 连接测试
 */

import { chromium } from 'playwright';

async function test() {
  console.log('🧪 测试 Browserless v1.61 (CDP 模式)\n');

  try {
    // 使用 CDP 端点连接
    const browser = await chromium.connectOverCDP('http://localhost:6666');
    console.log('✅ CDP 连接成功\n');

    const context = browser.contexts[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());

    console.log('访问 https://example.com...');
    await page.goto('https://example.com');

    const title = await page.title();
    console.log(`✅ 页面标题：${title}\n`);

    await browser.close();
    console.log('🎉 测试通过！');

    return true;
  } catch (error: any) {
    console.log('\n❌ 测试失败\n');
    console.log('错误:', error.message || String(error));
    return false;
  }
}

const success = await test();
process.exit(success ? 0 : 1);
