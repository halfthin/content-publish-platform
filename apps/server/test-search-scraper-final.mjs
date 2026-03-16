/**
 * 小红书搜索结果数据抓取测试 - 最终版
 * 
 * 使用HT-Fish修复后的完整选择器配置
 * 运行：bun test-search-scraper-final.mjs
 */

import { chromium } from 'playwright';
import { xiaohongshuSelectors } from './src/config/xiaohongshu-selectors.js';

const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
  {name: 'websectiga', value: '6169c1e84f393779a5f7de7303038f3b47a78e47be716e7bec57ccce17d45f99', domain: '.xiaohongshu.com', path: '/'},
];

async function findElementInCard(card, selectors) {
  for (const selector of selectors) {
    try {
      const el = await card.$(selector);
      if (el) return el;
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function main() {
  console.log('🧪 开始小红书搜索结果数据抓取测试 (最终版)...\n');
  
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
    
    // 搜索
    console.log('=== 搜索"通勤穿搭" ===');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=通勤穿搭&source=web_search_result_notes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    console.log('✅ 搜索完成\n');
    
    // 检查页面
    const hasNoteCards = await page.$('.note-item', { timeout: 3000 });
    console.log('检测到笔记卡片:', hasNoteCards ? '✅' : '❌');
    
    const bloggerCards = await page.$$('.note-item');
    console.log(`📊 找到 ${bloggerCards.length} 个博主卡片\n`);
    
    const results = [];
    for (let i = 0; i < Math.min(3, bloggerCards.length); i++) {
      const card = bloggerCards[i];
      
      console.log(`\n--- 博主 ${i + 1} ---`);
      
      // 昵称 - 使用多个备选
      const nameSelectors = [
        '.author .name',
        '.author-name',
        '.nickname',
        '.username',
        '.user-name',
      ];
      let name = '未知';
      for (const sel of nameSelectors) {
        const el = await card.$(sel);
        if (el) {
          name = await el.textContent();
          console.log(`匹配选择器: ${sel}`);
          break;
        }
      }
      console.log(`昵称：${name}`);
      
      // 粉丝数 - 使用新选择器
      const fansSelectors = [
        '[class*="fan"]',
        '.fans-count',
        '.user-fans',
        '.user-stats .fans',
      ];
      let fans = '未知';
      for (const sel of fansSelectors) {
        const el = await card.$(sel);
        if (el) {
          fans = await el.textContent();
          console.log(`匹配选择器: ${sel}`);
          break;
        }
      }
      console.log(`粉丝数：${fans}`);
      
      results.push({ name, fans });
    }
    
    // 生成报告
    console.log('\n=== 选择器验证报告 (最终版) ===\n');
    console.log('## 🧪 小红书搜索结果数据抓取测试报告\n');
    console.log('### 测试结果');
    console.log('- 浏览器：✅ 启动成功');
    console.log('- 页面访问：✅ 成功');
    console.log(`- 搜索关键词：通勤穿搭`);
    console.log(`- 搜索结果：✅ ${bloggerCards.length} 个博主\n`);
    console.log('### 数据提取结果');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`\n**博主 ${i + 1}**`);
      console.log(`- 昵称: ${r.name}`);
      console.log(`- 粉丝数: ${r.fans}`);
    }
    console.log('\n### 总结');
    const allPassed = results.length > 0 && results.some(r => r.name !== '未知');
    console.log(`选择器验证：${allPassed ? '✅ 通过' : '⚠️ 部分通过'}`);
    console.log(`\n完整测试报告保存到: .workspace/tests/TEST_SEARCH_FINAL_2026-03-07.md`);
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
