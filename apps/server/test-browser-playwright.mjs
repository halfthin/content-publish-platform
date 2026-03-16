import { chromium } from 'playwright';

async function testBrowserless() {
  console.log('🧪 测试 Browserless 连接...\n');
  
  const browserlessUrl = 'ws://localhost:6666/playwright';
  
  try {
    console.log(`尝试连接: ${browserlessUrl}`);
    
    // 使用 Playwright 的 connect 方法
    const browser = await chromium.connect({
      wsEndpoint: browserlessUrl,
      timeout: 30000,
    });
    
    console.log('✅ Browserless 连接成功');
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('访问测试页面...');
    await page.goto('https://example.com');
    const title = await page.title();
    console.log(`页面标题: ${title}`);
    
    await browser.close();
    console.log('✅ 测试完成');
    
    return { success: true };
  } catch (error) {
    console.error('❌ 连接失败:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 开始 Browserless + Cookie 验证测试...\n');
  
  // 测试 1: Browserless 连接
  const result = await testBrowserless();
  
  if (!result.success) {
    console.log('\n⚠️  Browserless 连接失败，无法继续测试');
    console.log('请检查 Browserless 服务配置');
    return;
  }
  
  // 如果连接成功，继续测试 Cookie
  console.log('\n=== Cookie 登录验证 ===');
  
  const browserlessUrl = 'ws://localhost:6666/playwright';
  const browser = await chromium.connect({ wsEndpoint: browserlessUrl });
  const context = await browser.newContext();
  
  // 设置 Cookie
  await context.addCookies([
    { name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/' },
    { name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/' },
    { name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/' },
  ]);
  
  const page = await context.newPage();
  
  console.log('访问小红书...');
  await page.goto('https://www.xiaohongshu.com');
  await page.waitForTimeout(2000);
  
  // 检查登录状态
  const hasUserAvatar = await page.$('.user-avatar, .avatar-img');
  console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态');
  
  await browser.close();
  
  console.log('\n## 🧪 测试报告');
  console.log('');
  console.log('### Browserless 连接');
  console.log('- [x] 连接成功');
  console.log('');
  console.log('### Cookie 登录验证');
  console.log('- [x] Cookie 已提供');
  console.log('- [x] 登录状态:', hasUserAvatar ? '✅ 已登录' : '⚠️ 未检测到登录状态');
  console.log('');
  console.log('### 结论');
  console.log('- [x] Browserless: ✅ 可用');
  console.log('- [x] Cookie: ✅ 已提供');
}

main().catch(console.error);
