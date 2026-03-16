#!/usr/bin/env bun
/**
 * Browserless v1.61 完整 CDP 测试
 */

import WebSocket from 'ws';

async function sendCommand(
  ws: WebSocket,
  method: string,
  params: any = {},
  id: number
): Promise<any> {
  return new Promise((resolve) => {
    const handler = (data: any) => {
      const response = JSON.parse(data.toString());
      if (response.id === id) {
        ws.off('message', handler);
        resolve(response);
      }
    };
    ws.on('message', handler);

    const msg = JSON.stringify({ id, method, params });
    ws.send(msg);

    // 超时
    setTimeout(() => {
      ws.off('message', handler);
      resolve({ error: { message: 'Timeout' } });
    }, 5000);
  });
}

async function test() {
  console.log('🧪 Browserless v1.61 完整 CDP 测试\n');
  console.log('='.repeat(50));

  // 获取浏览器 WebSocket 端点
  console.log('\n1️⃣ 获取浏览器信息...');
  const response = await fetch('http://localhost:6666/json/version');
  const info = await response.json();
  console.log(`   ✅ Browser: ${info.Browser}`);
  console.log(`   ✅ WebSocket: ${info.webSocketDebuggerUrl}`);

  // 创建新的目标页面
  console.log('\n2️⃣ 创建新页面...');
  const createResponse = await fetch('http://localhost:6666/json/new?https://example.com');
  const newTarget = await createResponse.json();
  console.log(`   ✅ 页面创建成功`);
  console.log(`   URL: ${newTarget.url}`);

  // 连接到新页面
  console.log('\n3️⃣ 连接页面 WebSocket...');
  const ws = new WebSocket(newTarget.webSocketDebuggerUrl);

  await new Promise<void>((resolve) => {
    ws.on('open', () => {
      console.log('   ✅ WebSocket 连接成功');
      resolve();
    });
    ws.on('error', (err) => {
      console.log('   ❌ 连接失败:', err.message);
      resolve();
    });
  });

  // 启用 Runtime domain
  console.log('\n4️⃣ 启用 Runtime domain...');
  const runtimeResult = await sendCommand(ws, 'Runtime.enable', {}, 1);
  if (runtimeResult.error) {
    console.log('   ⚠️ Runtime.enable 错误:', runtimeResult.error.message);
  } else {
    console.log('   ✅ Runtime 已启用');
  }

  // 执行 JavaScript
  console.log('\n5️⃣ 执行 JavaScript...');
  const evalResult = await sendCommand(
    ws,
    'Runtime.evaluate',
    {
      expression: 'document.title',
    },
    2
  );

  if (evalResult.result) {
    console.log(`   ✅ 页面标题：${evalResult.result.result.value}`);
  } else {
    console.log('   ❌ 执行失败:', evalResult.error?.message);
  }

  // 获取页面 HTML
  console.log('\n6️⃣ 获取页面内容...');
  const domResult = await sendCommand(ws, 'DOM.getDocument', {}, 3);
  if (domResult.root) {
    console.log('   ✅ DOM 文档已获取');
  }

  // 截图（需要启用 Page domain）
  console.log('\n7️⃣ 尝试截图...');
  // 注意：CDP 截图需要使用 Page.captureScreenshot，但需要 Page domain 支持

  // 关闭连接
  console.log('\n8️⃣ 关闭连接...');
  ws.close();
  console.log('   ✅ 已关闭');

  // 关闭目标
  console.log('\n9️⃣ 关闭页面目标...');
  await fetch(`http://localhost:6666/json/close/${newTarget.id}`);
  console.log('   ✅ 页面已关闭');

  console.log('\n' + '='.repeat(50));
  console.log('🎉 CDP 测试完成！');
  console.log('='.repeat(50));
}

await test().catch(console.error);
