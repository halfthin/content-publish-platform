/**
 * 调试搜索页面元素
 */

import { XiaohongshuScraper } from './src/services/xiaohongshu-scraper.service.js';
import { initializeBrowser } from './src/config/playwright.js';
import { writeFile } from 'fs/promises';

async function main() {
  console.log('🔍 调试搜索页面元素...\n');

  await initializeBrowser({ headless: false });

  const scraper = new XiaohongshuScraper({
    accountId: 'test-account',
    headless: false,
    timeout: 90000,
  });

  try {
    await scraper.initialize();
    await scraper.loadCookies();

    // 搜索
    await scraper.search('穿搭');
    
    if (scraper.page) {
      // 等待一下让页面完全加载
      await scraper.page.waitForTimeout(3000);
      
      // 测试不同选择器
      console.log('测试不同选择器:\n');
      
      const selectors = [
        'section.note-item',
        '.note-item',
        '.note-item .author',
        '[class*="author"]',
        '.author-name',
        '[class*="name"]',
      ];
      
      for (const selector of selectors) {
        try {
          const elements = await scraper.page.$$(selector);
          console.log(`✅ ${selector}: ${elements.length} 个元素`);
          
          if (elements.length > 0) {
            // 获取第一个元素的文本
            const text = await elements[0].textContent();
            console.log(`   文本：${text.trim().substring(0, 50)}...`);
          }
        } catch (error) {
          console.log(`❌ ${selector}: ${error.message}`);
        }
      }
      
      // 保存 HTML
      const html = await scraper.page.content();
      await writeFile('/home/halfthin/dev/content-publish-platform/.workspace/debug/search-debug.html', html);
      console.log('\n💾 HTML 已保存到：.workspace/debug/search-debug.html');
    }

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await scraper.close();
  }
}

main().catch(console.error);
