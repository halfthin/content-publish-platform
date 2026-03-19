const WebSocket = require('ws');

console.log('🧪 测试 WebSocket 连接...\n');

const ws = new WebSocket('ws://localhost:6666/playwright');

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功!');
  ws.close();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message);
  process.exit(1);
});

ws.on('unexpected-response', (_request, response) => {
  console.error('❌ 意外响应:', response.statusCode);
  let body = '';
  response.on('data', (chunk) => (body += chunk));
  response.on('end', () => {
    console.error('响应内容:', body);
    process.exit(1);
  });
});

setTimeout(() => {
  console.error('❌ 连接超时');
  process.exit(1);
}, 10000);
