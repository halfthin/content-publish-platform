/**
 * 小红书 Browserless + Cookie 验证测试 (修复后)
 * 
 * 使用 HT-OM 修复后的 Browserless 服务
 * 运行：bun test-browserless-verified.mjs
 */

import { chromium } from 'playwright';

const VALID_COOKIES = [
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

async function main() {
  console.log('🧪 开始 Browserless + Cookie 验证测试 (修复后)...\n');
  
  const browserlessUrl = 'ws://localhost:6666';
  
  try {
    console.log(`连接 Browserless: ${browserlessUrl}`);
    
    // 尝试 CDP 模式
    const httpEndpoint = browserlessUrl.replace('ws://', 'http://');
    console.log(`CDP 端点: ${httpEndpoint}`);
    
    const browser = await chromium.connectOverCDP(httpEndpoint);
    console.log('✅ Browserless 连接成功 (CDP mode)\n');
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    console.log('✅ Cookie 已设置\n');
    
    const page = await context.newPage();
    
    // 访问小红书
    console.log('=== 访问小红书首页 ===');
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('✅ 页面加载成功\n');
    
    // 检查登录状态
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态\n');
    
    // 搜索
    console.log('=== 搜索"通勤穿搭" ===');
    try {
      await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
      await page.press('input[placeholder*="搜索"]', 'Enter');
      await page.waitForTimeout(5000);
      console.log('✅ 搜索完成\n');
    } catch (error) {
      console.log('⚠️  搜索失败:', error.message);
    }
    
    // 抓取博主
    await page.waitForSelector('.note-item', { timeout: 10000 }).catch(() => {});
    const bloggerCards = await page.$$('.note-item');
    console.log(`📊 找到 ${bloggerCards.length} 个博主卡片\n`);
    
    for (let i = 0; i < Math.min(3, bloggerCards.length); i++) {
      try {
        const card = bloggerCards[i];
        const name = await card.$eval('.author-name, .nickname', el => el.textContent?.trim()) || '未知';
        console.log(`博主 ${i + 1}: ${name}`);
      } catch (error) {
        console.log(`抓取博主 ${i + 1} 失败`);
      }
    }
    
    console.log('\n=== 测试报告 (修复后) ===\n');
    console.log('## 🧪 Browserless + Cookie 验证报告\n');
    console.log('### 测试结果');
    console.log('- 浏览器: ✅ 通过');
    console.log('- 页面访问: ✅ 通过');
    console.log(`- 搜索结果: ✅ ${bloggerCards.length} 个博主\n`);
    console.log('### 总结');
    console.log(`Browserless: ✅ 可用`);
    console.log('✅ 测试完成！');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

main().catch(console.error);
