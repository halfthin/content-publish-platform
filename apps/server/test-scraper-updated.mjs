/**
 * 小红书数据抓取测试 - 更新版
 * 
 * 使用更新后的选择器配置进行数据抓取测试
 * 运行：bun test-scraper-updated.mjs
 */

import { chromium } from 'playwright';
import { xiaohongshuSelectors, findElement } from './src/config/xiaohongshu-selectors.js';

async function main() {
  console.log('🧪 开始小红书数据抓取测试 (更新版)...\n');
  
  let browser;
  try {
    // 启动浏览器
    console.log('启动 Chromium 浏览器...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    console.log('✅ 浏览器启动成功\n');
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    // 访问小红书搜索页面（需要有效 Cookie）
    console.log('访问小红书搜索页面...');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=通勤穿搭&source=web_search_result_notes', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    // 等待内容加载
    console.log('等待内容加载...');
    await page.waitForTimeout(8000);
    
    // 测试新选择器
    console.log('🔍 测试新选择器配置...\n');
    
    // 查找笔记卡片
    const noteCards = await page.$$(xiaohongshuSelectors.search.noteCard[0]);
    console.log(`找到笔记卡片：${noteCards.length} 个\n`);
    
    if (noteCards.length === 0) {
      console.log('⚠️  未找到笔记卡片，尝试备选选择器...\n');
      
      // 尝试备选选择器
      for (const selector of xiaohongshuSelectors.search.noteCard) {
        const cards = await page.$$(selector);
        if (cards.length > 0) {
          console.log(`✅ 找到匹配的选择器：${selector} (${cards.length} 个)`);
          break;
        }
      }
    }
    
    // 抓取前 3 个笔记
    console.log('\n📝 开始抓取笔记数据...\n');
    
    const notes = [];
    for (let i = 0; i < Math.min(3, noteCards.length); i++) {
      console.log(`--- 笔记 ${i + 1} ---`);
      
      const card = noteCards[i];
      
      try {
        // 标题
        const titleEl = await findElementInCard(card, xiaohongshuSelectors.search.title);
        const title = titleEl ? await titleEl.textContent() : '未知';
        console.log(`标题：${title}`);
        
        // 作者名称
        const authorEl = await findElementInCard(card, xiaohongshuSelectors.search.authorName);
        const author = authorEl ? await authorEl.textContent() : '未知';
        console.log(`作者：${author}`);
        
        // 点赞数
        const likeEl = await findElementInCard(card, xiaohongshuSelectors.search.likeCount);
        const like = likeEl ? await likeEl.textContent() : '未知';
        console.log(`点赞：${like}`);
        
        notes.push({ title, author, like });
        console.log('');
      } catch (error) {
        console.log(`抓取失败：${error.message}\n`);
      }
    }
    
    // 生成报告
    console.log('📊 测试报告\n');
    console.log('### 抓取结果');
    console.log('');
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      console.log(`**笔记 ${i + 1}**:`);
      console.log(`- 标题：${note.title}`);
      console.log(`- 作者：${note.author}`);
      console.log(`- 点赞：${note.like}`);
      console.log('');
    }
    
    console.log('### 结论');
    console.log('');
    if (notes.length > 0 && notes.some(n => n.title !== '未知')) {
      console.log('✅ 数据抓取成功！');
    } else {
      console.log('⚠️  数据抓取失败，需要进一步调试');
    }
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

// 在卡片内查找元素
async function findElementInCard(card, selectors) {
  for (const selector of selectors) {
    try {
      const el = await card.$(selector);
      if (el) return el;
    } catch (error) {
      continue;
    }
  }
  return null;
}

main();
