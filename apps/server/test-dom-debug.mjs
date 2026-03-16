/**
 * 小红书页面 DOM 结构调试工具
 * 
 * 用途：检查搜索结果页面的实际 DOM 结构
 * 运行：bun test-selector-debug.mjs
 */

import { chromium } from 'playwright';

async function main() {
  console.log('🧪 开始小红书页面 DOM 结构调试...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 访问搜索页面
    const keyword = '通勤穿搭';
    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
    
    console.log(`访问搜索页面：${searchUrl}\n`);
    await page.goto(searchUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(8000);
    
    console.log('✅ 页面加载完成\n');
    
    // 提取页面的 HTML 结构摘要
    const pageInfo = await page.evaluate(() => {
      // 获取页面标题
      const title = document.title;
      
      // 获取所有可能的卡片容器
      const allDivs = Array.from(document.querySelectorAll('div'));
      const possibleCards = allDivs.filter(div => {
        const classes = div.className || '';
        return classes.includes('note') || 
               classes.includes('card') || 
               classes.includes('item') ||
               classes.includes('search');
      }).slice(0, 5); // 只取前5个
        
      // 获取所有可能的作者元素
      const allSpans = Array.from(document.querySelectorAll('span'));
      const possibleAuthors = allSpans.filter(span => {
        const classes = span.className || '';
        return classes.includes('author') || 
               classes.includes('name') || 
               classes.includes('user') ||
               classes.includes('nickname');
      }).slice(0, 5);
      
      return { title, possibleCards, possibleAuthors };
    });
    
    console.log('📄 页面信息');
    console.log(`标题：${pageInfo.title}\n`);
    
    console.log('🔍 可能的卡片容器（前5个）:');
    pageInfo.possibleCards.forEach((card, i) => {
      console.log(`  ${i + 1}. class=\"${card.className}\"`);
    });
    
    console.log('\n🔢 可能的作者元素（前5个）:');
    pageInfo.possibleAuthors.forEach((span, i) => {
      console.log(`  ${i + 1}. class=\"${span.className}\" text=\"${span.textContent?.trim().substring(0, 30)}...\"`);
    });
    
    // 保存完整 HTML 用于进一步分析
    const html = await page.content();
    console.log('\nNote: 完整 HTML 已捕获，可用于进一步分析');
    
    await browser.close();
    console.log('\n✅ 调试完成！');
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(console.error);
