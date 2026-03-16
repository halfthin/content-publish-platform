#!/usr/bin/env bun
/**
 * Browserless v1.61 连接测试脚本
 * 使用 CDP 协议直接连接
 */

import { chromium } from 'playwright';

async function test() {
  console.log('🧪 测试 Browserless v1.61 连接\n');

  // Browserless v1.61 使用 CDP 协议，端点为 ws://localhost:6666
  const wsEndpoint = 'ws://localhost:6666';
  console.log(`📡 端点：${wsEndpoint}\n`);

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

    await browser.close();
    console.log('👋 浏览器已关闭\n');
    console.log('🎉 测试通过！');

    return true;
  } catch (error: any) {
    console.log('\n❌ 测试失败\n');
    console.log('错误信息:', error.message?.split('\n')[0] || String(error));
    return false;
  }
}

const success = await test();
process.exit(success ? 0 : 1);
