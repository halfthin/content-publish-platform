/**
 * 小红书采集功能测试 - 调试版本
 * 
 * 功能：测试搜索功能，保存页面 HTML 用于调试
 */

import { XiaohongshuScraper } from './src/services/xiaohongshu-scraper.service.js';
import { writeFile } from 'fs/promises';
import { initializeBrowser } from './src/config/playwright.js';

async function main() {
  console.log('🚀 开始测试小红书采集功能（调试版本）...\n');

  // 0. 初始化浏览器池
  console.log('📦 初始化浏览器池...');
  await initializeBrowser({ headless: false });
  console.log('✅ 浏览器池初始化完成\n');

  const scraper = new XiaohongshuScraper({
    accountId: 'test-account',
    headless: false,
    timeout: 90000,
    maxBloggers: 3,
    maxNotes: 3,
  });

  try {
    // 1. 初始化
    console.log('📦 初始化浏览器...');
    await scraper.initialize();
    console.log('✅ 浏览器初始化完成\n');

    // 2. 加载 Cookie
    console.log('🍪 加载 Cookie...');
    const cookieLoaded = await scraper.loadCookies();
    console.log(cookieLoaded ? '✅ Cookie 加载成功\n' : '⚠️  Cookie 加载失败\n');

    // 3. 搜索
    const keyword = '穿搭';
    console.log(`🔍 搜索关键词："${keyword}"`);
    await scraper.search(keyword);
    console.log('✅ 搜索完成\n');

    // 4. 保存页面 HTML 用于调试
    if (scraper.page) {
      console.log('💾 保存页面 HTML...');
      const html = await scraper.page.content();
      await writeFile('/home/halfthin/dev/content-publish-platform/.workspace/debug/search-page-result.html', html);
      console.log('✅ HTML 已保存到：.workspace/debug/search-page-result.html\n');
      
      // 5. 尝试查找笔记卡片
      console.log('🔍 查找笔记卡片...');
      const cards = await scraper.page.$$('section.note-item');
      console.log(`找到 ${cards.length} 个 note-item 元素\n`);
      
      // 尝试其他选择器
      const altCards = await scraper.page.$$('.note-item');
      console.log(`找到 ${altCards.length} 个 .note-item 元素\n`);
      
      // 6. 尝试提取博主
      console.log('👥 尝试提取博主...');
      const bloggers = await scraper.extractBloggersFromSearch();
      console.log(`提取到 ${bloggers.length} 个博主\n`);
      
      if (bloggers.length > 0) {
        console.log('博主列表:');
        bloggers.forEach((b, i) => {
          console.log(`  ${i + 1}. ${b.nickname} - ${b.profileUrl}`);
        });
      }
    }

    console.log('\n✅ 测试完成！\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  } finally {
    console.log('🔒 关闭浏览器...');
    await scraper.close();
    console.log('✅ 浏览器已关闭\n');
  }
}

main().catch(console.error);
