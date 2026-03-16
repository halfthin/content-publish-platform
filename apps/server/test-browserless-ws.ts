#!/usr/bin/env bun
/**
 * 直接 WebSocket 测试 Browserless
 */

import WebSocket from 'ws';

async function test() {
  console.log('🧪 直接 WebSocket 测试 Browserless\n');

  // 获取浏览器 WebSocket 端点
  console.log('1️⃣ 获取浏览器信息...');
  const response = await fetch('http://localhost:6666/json/version');
  const info = await response.json();
  console.log('   Browser:', info.Browser);
  console.log('   WebSocketDebuggerUrl:', info.webSocketDebuggerUrl);
  console.log();

  // 获取可用的调试目标
  console.log('2️⃣ 获取调试目标列表...');
  const targetsResponse = await fetch('http://localhost:6666/json/list');
  const targets = await targetsResponse.json();
  console.log('   可用目标:', targets.length);
  targets.forEach((t: any) => {
    console.log(`   - ${t.type}: ${t.title} (${t.url})`);
  });
  console.log();

  // 尝试连接 WebSocket
  console.log('3️⃣ 尝试 WebSocket 连接...');

  return new Promise((resolve) => {
    const ws = new WebSocket(info.webSocketDebuggerUrl);

    ws.on('open', () => {
      console.log('   ✅ WebSocket 连接成功！\n');

      // 发送一个简单的 CDP 命令
      const msg = JSON.stringify({
        id: 1,
        method: 'Page.enable',
      });
      console.log('4️⃣ 发送 CDP 命令：Page.enable');
      ws.send(msg);
    });

    ws.on('message', (data: any) => {
      console.log('   ✅ 收到响应:', data.toString().substring(0, 100));
      console.log();
      ws.close();
      resolve(true);
    });

    ws.on('error', (err) => {
      console.log('   ❌ WebSocket 错误:', err.message);
      resolve(false);
    });

    ws.on('close', () => {
      console.log('5️⃣ WebSocket 已关闭');
      console.log('\n🎉 测试完成！');
    });

    // 超时处理
    setTimeout(() => {
      console.log('   ⏱️ 连接超时');
      ws.close();
      resolve(false);
    }, 10000);
  });
}

await test();
