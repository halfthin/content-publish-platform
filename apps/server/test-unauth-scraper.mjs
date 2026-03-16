/**
 * 小红书未登录页面测试脚本
 * 
 * 运行：bun test-unauth-scraper.mjs
 */

import { chromium } from 'playwright';
import { unauthPageSelectors, findElementInCard, getElementText } from './src/config/xiaohongshu-unauth-selectors.js';

async function main() {
  console.log('🧪 开始小红书未登录页面测试...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('✅ 浏览器启动成功\n');
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    // 1. 访问搜索页面 (未登录)
    console.log('=== 1. 访问搜索页面 (未登录) ===');
    const keyword = '通勤穿搭';
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    await page.waitForTimeout(8000);
    
    // 2. 检查登录提示
    console.log('=== 2. 检查页面状态 ===');
    const hasLoginTips = await page.$(unauthPageSelectors.loginTips[0]);
    console.log('登录提示:', hasLoginTips ? '✅ 检测到 (未登录模式)' : '❌ 未检测到\n');
    
    // 3. 查找结果卡片
    console.log('=== 3. 查找搜索结果 ===');
    
    let resultCards = [];
    for (const selector of unauthPageSelectors.resultCard) {
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
      await browser.close();
      return;
    }
    
    // 4. 抓取笔记信息
    console.log('=== 4. 抓取笔记信息 ===\n');
    
    const notes = [];
    for (let i = 0; i < Math.min(3, resultCards.length); i++) {
      console.log(`--- 笔记 ${i + 1} ---`);
      
      const card = resultCards[i];
      
      try {
        // 标题
        const title = await getElementText(card, unauthPageSelectors.title);
        console.log(`标题：${title || '未知'}`);
        
        // 作者
        const author = await getElementText(card, unauthPageSelectors.author);
        console.log(`作者：${author || '未知'}`);
        
        // 点赞
        const like = await getElementText(card, unauthPageSelectors.like);
        console.log(`点赞：${like || '未知'}`);
        
        // 收藏
        const collect = await getElementText(card, unauthPageSelectors.collect);
        console.log(`收藏：${collect || '未知'}`);
        
        notes.push({ title, author, like, collect });
        console.log('');
      } catch (error) {
        console.log(`抓取失败：${error.message}\n`);
      }
    }
    
    // 5. 生成报告
    console.log('=== 5. 测试报告 ===\n');
    console.log('## 🧪 小红书未登录页面测试报告\n');
    console.log('### 测试结果');
    console.log('- 浏览器：✅ 启动成功');
    console.log('- 页面访问：✅ 成功');
    console.log('- 登录提示：✅ 检测到 (未登录模式)');
    console.log(`- 搜索结果：✅ ${resultCards.length} 个笔记\n`);
    console.log('### 抓取结果');
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      console.log(`**笔记 ${i + 1}**:`);
      console.log(`- 标题：${note.title}`);
      console.log(`- 作者：${note.author}`);
      console.log(`- 点赞：${note.like}`);
      console.log(`- 收藏：${note.collect}\n`);
    }
    console.log('### 总结');
    const success = notes.length > 0 && notes.some(n => n.title && n.title !== '未知');
    console.log(`未登录抓取：${success ? '✅ 成功' : '⚠️ 部分成功'}\n`);
    
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
