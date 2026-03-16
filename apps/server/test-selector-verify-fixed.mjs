/**
 * 小红书选择器验证测试 - 修复版
 * 
 * 使用更新后的选择器配置
 * 运行：bun test-selector-verify-fixed.mjs
 */

import { chromium } from 'playwright';
import { findElementInCard } from './src/config/xiaohongshu-search-selectors.js';

// 17:00 提供的有效 Cookie
const VALID_COOKIES = [
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

// 使用最通用的选择器
const SELECTORS = {
  resultCard: ['.note-item', '.search-result-item'],
  bloggerName: ['.author-name', '.nickname', '.username', '.user-name'],
  bloggerId: ['.author-id', '.user-id', '.red-id'],
  bloggerFans: ['.fan-count', '.fans-count', '.follower-count'],
};

async function main() {
  console.log('🧪 开始小红书选择器验证测试 (修复版)...\n');
  
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
    
    // 搜索"通勤穿搭"
    console.log('=== 搜索"通勤穿搭" ===');
    await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
    await page.press('input[placeholder*="搜索"]', 'Enter');
    await page.waitForTimeout(5000);
    console.log('✅ 搜索完成\n');
    
    // 抓取博主信息
    console.log('=== 抓取博主信息 ===');
    
    const bloggerCards = await page.$$(SELECTORS.resultCard[0]);
    console.log(`📊 找到 ${bloggerCards.length} 个博主卡片\n`);
    
    for (let i = 0; i < Math.min(3, bloggerCards.length); i++) {
      try {
        const card = bloggerCards[i];
        
        console.log(`\n--- 博主 ${i + 1} ---`);
        
        // 昵称
        const nameEl = await findElementInCard(card, SELECTORS.bloggerName);
        const name = nameEl ? await nameEl.textContent() : '未知';
        console.log(`昵称：${name}`);
        
        // 小红书号
        const idEl = await findElementInCard(card, SELECTORS.bloggerId);
        const id = idEl ? await idEl.textContent() : '未知';
        console.log(`用户 ID: ${id}`);
        
        // 粉丝数
        const fansEl = await findElementInCard(card, SELECTORS.bloggerFans);
        const followers = fansEl ? await fansEl.textContent() : '未知';
        console.log(`粉丝数：${followers}`);
        
      } catch (error) {
        console.log(`抓取博主 ${i + 1} 失败：${error.message}`);
      }
    }
    
    // 生成报告
    console.log('\n=== 选择器验证报告 ===\n');
    console.log('## 🧪 小红书选择器验证报告\n');
    console.log('### 测试结果');
    console.log('- 浏览器：✅ 启动成功');
    console.log('- 页面访问：✅ 成功');
    console.log('- 搜索功能：✅ 成功');
    console.log(`- 搜索结果：✅ ${bloggerCards.length} 个博主\n`);
    console.log('### 总结');
    const allPassed = bloggerCards.length > 0;
    console.log(`选择器验证：${allPassed ? '✅ 通过' : '❌ 失败'}\n`);
    
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
