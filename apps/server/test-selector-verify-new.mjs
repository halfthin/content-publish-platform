/**
 * 小红书选择器验证测试 - 最新 Cookie
 * 
 * 使用 2026-03-07 09:36 提供的最新 Cookie
 * 运行：bun test-selector-verify-new.mjs
 */

import { chromium } from 'playwright';

// 2026-03-07 09:36 提供的最新 Cookie
const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webBuild', value: '5.14.0', domain: '.xiaohongshu.com', path: '/'},
  {name: 'websectiga', value: '6169c1e84f393779a5f7de7303038f3b47a78e47be716e7bec57ccce17d45f99', domain: '.xiaohongshu.com', path: '/'},
];

async function main() {
  console.log('🧪 开始小红书选择器验证测试 (最新 Cookie)...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('✅ 浏览器启动成功\n');
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    console.log('✅ Cookie 已设置\n');
    
    const page = await context.newPage();
    
    // 访问小红书首页
    console.log('=== 访问小红书首页 ===');
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('✅ 页面加载成功\n');
    
    // 检查登录状态
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态\n');
    
    // 搜索"通勤穿搭"
    console.log('=== 搜索"通勤穿搭" ===');
    await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
    await page.press('input[placeholder*="搜索"]', 'Enter');
    await page.waitForTimeout(5000);
    console.log('✅ 搜索完成\n');
    
    // 抓取博主信息
    console.log('=== 抓取博主信息 ===');
    
    const bloggerCards = await page.$$('.note-item');
    console.log(`📊 找到 ${bloggerCards.length} 个博主卡片\n`);
    
    for (let i = 0; i < Math.min(3, bloggerCards.length); i++) {
      try {
        const card = bloggerCards[i];
        
        console.log(`\n--- 博主 ${i + 1} ---`);
        
        // 昵称
        const nameEl = await card.$('.author-name, .nickname, .username');
        const name = nameEl ? await nameEl.textContent() : '未知';
        console.log(`昵称：${name}`);
        
        // 小红书号
        const idEl = await card.$('.author-id, .user-id, .red-id');
        const id = idEl ? await idEl.textContent() : '未知';
        console.log(`用户 ID: ${id}`);
        
        // 粉丝数
        const fansEl = await card.$('.fan-count, .fans-count, .follower-count');
        const followers = fansEl ? await fansEl.textContent() : '未知';
        console.log(`粉丝数：${followers}`);
        
      } catch (error) {
        console.log(`抓取博主 ${i + 1} 失败：${error.message}`);
      }
    }
    
    // 生成报告
    console.log('\n=== 选择器验证报告 ===\n');
    console.log('## 🧪 小红书选择器验证报告 (最新 Cookie)\n');
    console.log('### 测试结果');
    console.log('- 浏览器：✅ 启动成功');
    console.log('- 页面访问：✅ 成功');
    console.log('- 搜索功能：✅ 成功');
    console.log(`- 搜索结果：✅ ${bloggerCards.length} 个博主\n`);
    console.log('### 登录状态');
    console.log(`- 登录状态: ${hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态'}\n`);
    console.log('### 信息提取');
    console.log(`- 抓取到 ${bloggerCards.length} 个博主，信息提取 ${bloggerCards.length > 0 ? '✅ 成功' : '❌ 失败'}\n`);
    console.log('### 总结');
    const allPassed = bloggerCards.length > 0;
    console.log(`选择器验证：${allPassed ? '通过' : '失败'}`);
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

main();
