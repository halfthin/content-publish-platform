/**
 * 小红书搜索结果页面 DOM 结构保存工具
 * 
 * 保存搜索结果页面的 HTML 和关键元素
 * 运行：bun test-save-page-dump.mjs
 */

import { chromium } from 'playwright';

const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

async function main() {
  console.log('🧪 开始页面 DOM 结构保存...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    
    const page = await context.newPage();
    
    // 搜索
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=通勤穿搭&source=web_search_result_notes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    // 保存完整 HTML
    const html = await page.content();
    const fs = await import('fs');
    fs.writeFileSync('/home/halfthin/dev/content-publish-platform/.workspace/debug/xhs-search-full.html', html);
    console.log('✅ 完整 HTML 已保存');
    
    // 保存截图
    await page.screenshot({ path: '/home/halfthin/dev/content-publish-platform/.workspace/debug/xhs-search.png' });
    console.log('✅ 截图已保存');
    
    // 提取第一个卡片的 HTML
    const cardHtml = await page.evaluate(() => {
      const cards = document.querySelectorAll('.note-item');
      if (cards.length > 0) {
        return cards[0].outerHTML;
      }
      return null;
    });
    
    if (cardHtml) {
      fs.writeFileSync('/home/halfthin/dev/content-publish-platform/.workspace/debug/xhs-card-sample.html', cardHtml);
      console.log('✅ 卡片 HTML 已保存');
    }
    
    // 保存关键元素的 class 列表
    const classInfo = await page.evaluate(() => {
      const cards = document.querySelectorAll('.note-item');
      const allClasses = new Set();
      cards.forEach(card => {
        card.querySelectorAll('*').forEach(el => {
          const cls = el.className;
          if (cls) {
            cls.split(' ').forEach(c => allClasses.add(c));
          }
        });
      });
      return Array.from(allClasses).filter(c => c.includes('author') || c.includes('fan') || c.includes('follow') || c.includes('like')).slice(0, 20);
    });
    
    console.log('\n📋 可能相关 class 名:');
    classInfo.forEach(c => console.log(`  - ${c}`));
    
    await browser.close();
    console.log('\n✅ DOM 结构保存完成！');
    
  } catch (error) {
    console.error('❌ 失败:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
