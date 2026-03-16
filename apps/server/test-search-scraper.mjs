/**
 * 小红书搜索数据抓取测试
 * 
 * 使用更新后的选择器配置进行数据抓取测试
 * 运行：bun test-search-scraper.mjs
 */

import { chromium } from 'playwright';
import { searchPageSelectors, findElement, findElementInCard } from './src/config/xiaohongshu-search-selectors.js';

async function main() {
  console.log('🧪 开始小红书搜索数据抓取测试...\n');
  
  let browser;
  try {
    // 检查是否使用 Browserless
    const browserlessUrl = process.env.BROWSERLESS_URL;
    
    if (browserlessUrl) {
      console.log(`连接 Browserless: ${browserlessUrl}`);
      browser = await chromium.connect(browserlessUrl);
    } else {
      console.log('使用本地 Chromium 浏览器...');
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
    }
    console.log('✅ 浏览器启动成功\n');
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    // 可选：加载 Cookie
    const cookies = [];
    if (cookies.length > 0) {
      console.log('加载 Cookie...');
      await context.addCookies(cookies);
      console.log('✅ Cookie 已加载\n');
    }
    
    // 访问搜索页面
    console.log('访问小红书搜索页面...');
    const keyword = '通勤穿搭';
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    // 等待内容加载
    console.log('等待内容加载...');
    await page.waitForTimeout(10000);
    
    // 查找结果卡片
    console.log('🔍 查找搜索结果卡片...\n');
    
    let resultCards = [];
    for (const selector of searchPageSelectors.resultCard) {
      try {
        resultCards = await page.$$(selector);
        if (resultCards.length > 0) {
          console.log(`✅ 找到匹配的选择器：${selector} (${resultCards.length} 个)\n`);
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (resultCards.length === 0) {
      console.log('❌ 未找到搜索结果卡片\n');
      console.log('可能原因:');
      console.log('  1. 需要登录 (Cookie 过期)');
      console.log('  2. 页面结构已更新');
      console.log('  3. 选择器不匹配\n');
      
      // 保存页面 HTML 供调试
      const html = await page.content();
      await require('fs').promises.writeFile('search-page-debug.html', html);
      console.log('📁 已保存页面 HTML: search-page-debug.html\n');
      
      await browser.close();
      return;
    }
    
    // 抓取前 3 个笔记
    console.log('📝 开始抓取笔记数据...\n');
    
    const notes = [];
    for (let i = 0; i < Math.min(3, resultCards.length); i++) {
      console.log(`--- 笔记 ${i + 1} ---`);
      
      const card = resultCards[i];
      
      try {
        // 标题
        const titleEl = await findElementInCard(card, searchPageSelectors.noteTitle);
        const title = titleEl ? await titleEl.textContent() : '未知';
        console.log(`标题：${title}`);
        
        // 作者
        const authorEl = await findElementInCard(card, searchPageSelectors.noteAuthor);
        const author = authorEl ? await authorEl.textContent() : '未知';
        console.log(`作者：${author}`);
        
        // 点赞
        const likeEl = await findElementInCard(card, searchPageSelectors.noteLike);
        const like = likeEl ? await likeEl.textContent() : '未知';
        console.log(`点赞：${like}`);
        
        // 收藏
        const collectEl = await findElementInCard(card, searchPageSelectors.noteCollect);
        const collect = collectEl ? await collectEl.textContent() : '未知';
        console.log(`收藏：${collect}`);
        
        notes.push({ title, author, like, collect });
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
      console.log(`- 收藏：${note.collect}`);
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
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }
}

main();
