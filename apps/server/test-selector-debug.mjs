/**
 * 小红书页面选择器调试脚本
 * 
 * 用途：分析页面 DOM 结构，找出正确的 CSS 选择器
 * 运行：bun test-selector-debug.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('🔍 开始小红书页面选择器调试...\n');
  
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
    
    // 访问小红书搜索页面
    console.log('访问小红书搜索页面...');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=通勤穿搭&source=web_search_result_notes', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    // 等待内容加载
    console.log('等待内容加载...');
    await page.waitForTimeout(8000);
    
    // 保存页面 HTML
    console.log('保存页面 HTML...');
    const html = await page.content();
    fs.writeFileSync('/home/halfthin/dev/content-publish-platform/content/test-images/page-source.html', html);
    console.log('✅ 页面 HTML 已保存到: content/test-images/page-source.html\n');
    
    // 保存截图
    await page.screenshot({ path: '/home/halfthin/dev/content-publish-platform/content/test-images/search-debug.png' });
    console.log('✅ 页面截图已保存\n');
    
    // 分析页面结构
    console.log('🔍 分析页面 DOM 结构...\n');
    
    // 查找所有可能的卡片容器
    const containers = await page.evaluate(() => {
      const results = [];
      
      // 尝试不同的容器选择器
      const selectors = [
        '.note-item',
        '.search-result-item',
        '[class*="note"]',
        '[class*="card"]',
        '[class*="item"]',
        '[class*="search-result"]',
        'section',
        'article',
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.push({
            selector,
            count: elements.length,
            sample: elements[0]?.className || '',
          });
        }
      }
      
      return results;
    });
    
    console.log('📦 找到的容器元素:');
    containers.forEach(c => {
      console.log(`  - ${c.selector}: ${c.count} 个 (class: "${c.sample.substring(0, 100)}")`);
    });
    console.log('');
    
    // 分析博主/笔记信息
    console.log('📝 分析笔记/博主信息元素...\n');
    
    const elementInfo = await page.evaluate(() => {
      const info = {};
      
      // 尝试查找各种可能的元素
      const tests = [
        { name: '标题', selectors: ['[class*="title"]', '[class*="name"]', 'h1', 'h2', 'h3', '[data-e2e*="title"]'] },
        { name: '作者', selectors: ['[class*="author"]', '[class*="user"]', '[class*="nickname"]', '[class*="avatar"]'] },
        { name: '点赞', selectors: ['[class*="like"]', '[class*="love"]', '[class*="heart"]', '[data-e2e*="like"]'] },
        { name: '收藏', selectors: ['[class*="collect"]', '[class*="star"]', '[class*="favorite"]'] },
        { name: '评论', selectors: ['[class*="comment"]', '[class*="reply"]'] },
        { name: '粉丝', selectors: ['[class*="fan"]', '[class*="follower"]'] },
        { name: '小红书号', selectors: ['[class*="id"]', '[class*="number"]', '[class*="code"]'] },
      ];
      
      for (const test of tests) {
        for (const selector of test.selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            info[test.name] = {
              selector,
              count: elements.length,
              sample: elements[0]?.textContent?.substring(0, 50) || '',
              class: elements[0]?.className || '',
            };
            break;
          }
        }
      }
      
      return info;
    });
    
    Object.entries(elementInfo).forEach(([name, data]) => {
      console.log(`${name}:`);
      console.log(`  选择器：${data.selector}`);
      console.log(`  数量：${data.count}`);
      console.log(`  内容：${data.sample}`);
      console.log(`  Class: ${data.class.substring(0, 100)}`);
      console.log('');
    });
    
    // 查找第一个笔记卡片的完整结构
    console.log('📋 分析第一个笔记卡片结构...\n');
    
    const cardStructure = await page.evaluate(() => {
      // 找到第一个笔记卡片
      const card = document.querySelector('.note-item') || 
                   document.querySelector('[class*="note"]') ||
                   document.querySelector('[class*="card"]') ||
                   document.querySelector('section') ||
                   document.querySelector('article');
      
      if (!card) return null;
      
      // 提取卡片内所有有意义的元素
      const elements = [];
      const allElements = card.querySelectorAll('*');
      
      for (const el of allElements) {
        const text = el.textContent?.trim();
        const className = el.className;
        const tagName = el.tagName.toLowerCase();
        const dataE2e = el.getAttribute('data-e2e');
        
        if ((text && text.length < 200) || className || dataE2e) {
          elements.push({
            tag: tagName,
            class: className,
            'data-e2e': dataE2e,
            text: text?.substring(0, 100),
          });
        }
      }
      
      return {
        outerHTML: card.outerHTML.substring(0, 2000),
        elements: elements.slice(0, 50), // 只取前 50 个元素
      };
    });
    
    if (cardStructure) {
      console.log('卡片结构 (前 50 个元素):');
      cardStructure.elements.forEach((el, i) => {
        if (el['data-e2e'] || el.text) {
          console.log(`  ${i + 1}. <${el.tag}> ${el['data-e2e'] ? `data-e2e="${el['data-e2e']}"` : ''} class="${el.class}" text="${el.text}"`);
        }
      });
      console.log('');
      
      // 保存完整结构
      fs.writeFileSync(
        '/home/halfthin/dev/content-publish-platform/content/test-images/card-structure.json',
        JSON.stringify(cardStructure, null, 2)
      );
      console.log('✅ 卡片结构已保存到：content/test-images/card-structure.json\n');
    }
    
    // 生成选择器建议
    console.log('💡 选择器建议:\n');
    
    const suggestions = await page.evaluate(() => {
      const suggestions = {};
      
      // 笔记卡片
      const noteSelectors = ['.note-item', '[class*="note-card"]', '[class*="search-result"]', 'section[class]', 'article[class]'];
      for (const sel of noteSelectors) {
        if (document.querySelectorAll(sel).length > 0) {
          suggestions.noteCard = sel;
          break;
        }
      }
      
      // 标题
      const titleSelectors = [
        '[data-e2e*="title"]',
        '[class*="title"]',
        '[class*="name"]',
        'h3',
        '.title',
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim().length > 0) {
          suggestions.title = sel;
          break;
        }
      }
      
      // 作者
      const authorSelectors = [
        '[data-e2e*="author"]',
        '[data-e2e*="user"]',
        '[class*="author"]',
        '[class*="user"]',
        '[class*="avatar"]',
      ];
      for (const sel of authorSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          suggestions.author = sel;
          break;
        }
      }
      
      // 点赞
      const likeSelectors = [
        '[data-e2e*="like"]',
        '[class*="like"]',
        '[class*="heart"]',
      ];
      for (const sel of likeSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          suggestions.like = sel;
          break;
        }
      }
      
      return suggestions;
    });
    
    console.log('推荐选择器:');
    Object.entries(suggestions).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log('');
    
    console.log('✅ 调试完成！\n');
    console.log('📁 生成的文件:');
    console.log('  - content/test-images/page-source.html (页面 HTML)');
    console.log('  - content/test-images/search-debug.png (页面截图)');
    console.log('  - content/test-images/card-structure.json (卡片结构)');
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

main();
