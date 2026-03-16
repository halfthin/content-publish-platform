/**
 * 小红书搜索页面 DOM 结构分析脚本
 * 
 * 用途：分析搜索结果页面 DOM，找出正确的选择器
 * 运行：bun debug-search-dom.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🔍 开始小红书搜索页面 DOM 分析...\n');
  
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
    const keyword = '通勤穿搭';
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    // 等待内容加载
    console.log('等待内容加载...');
    await page.waitForTimeout(10000);
    
    // 保存页面 HTML
    console.log('保存页面 HTML...');
    const outputDir = '/home/halfthin/dev/content-publish-platform/content/test-images';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const html = await page.content();
    const htmlFile = path.join(outputDir, 'search-page-source.html');
    fs.writeFileSync(htmlFile, html);
    console.log(`✅ 页面 HTML 已保存到：${htmlFile}\n`);
    
    // 保存截图
    const screenshotFile = path.join(outputDir, 'search-page-screenshot.png');
    await page.screenshot({ path: screenshotFile });
    console.log(`✅ 页面截图已保存到：${screenshotFile}\n`);
    
    // 分析页面结构
    console.log('🔍 分析页面 DOM 结构...\n');
    
    // 查找所有可能的卡片容器
    const containers = await page.evaluate(() => {
      const results = [];
      
      const selectors = [
        '.note-item',
        '.search-result-item',
        '.note-card',
        '[class*="note"]',
        '[class*="card"]',
        '[class*="item"]',
        '[class*="search-result"]',
        'section',
        'article',
      ];
      
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            results.push({
              selector,
              count: elements.length,
              sample: elements[0]?.className || '',
              html: elements[0]?.outerHTML?.substring(0, 500) || '',
            });
          }
        } catch (e) {
          // ignore
        }
      }
      
      return results;
    });
    
    console.log('📦 找到的容器元素:');
    containers.forEach(c => {
      console.log(`  - ${c.selector}: ${c.count} 个`);
      console.log(`    class: "${c.sample.substring(0, 150)}"`);
      console.log('');
    });
    
    // 分析卡片内的元素
    console.log('📝 分析卡片内元素...\n');
    
    const cardElements = await page.evaluate(() => {
      // 找到第一个卡片
      const card = document.querySelector('.note-item') || 
                   document.querySelector('.search-result-item') ||
                   document.querySelector('.note-card') ||
                   document.querySelector('[class*="note"]') ||
                   document.querySelector('section');
      
      if (!card) return null;
      
      const elements = [];
      const allElements = card.querySelectorAll('*');
      
      for (const el of allElements) {
        const text = el.textContent?.trim();
        const className = el.className;
        const tagName = el.tagName.toLowerCase();
        const dataE2e = el.getAttribute('data-e2e');
        const dataType = el.getAttribute('data-type');
        
        if ((text && text.length < 200) || className || dataE2e || dataType) {
          elements.push({
            tag: tagName,
            class: className,
            'data-e2e': dataE2e,
            'data-type': dataType,
            text: text?.substring(0, 100),
          });
        }
      }
      
      return {
        outerHTML: card.outerHTML.substring(0, 3000),
        elements: elements.slice(0, 100),
      };
    });
    
    if (cardElements) {
      console.log('卡片结构 (前 100 个元素):');
      cardElements.elements.forEach((el, i) => {
        if (el['data-e2e'] || el.text || el['data-type']) {
          console.log(`  ${i + 1}. <${el.tag}> ${el['data-e2e'] ? `data-e2e="${el['data-e2e']}"` : ''} ${el['data-type'] ? `data-type="${el['data-type']}"` : ''} class="${el.class}" text="${el.text}"`);
        }
      });
      console.log('');
      
      // 保存卡片结构
      const cardFile = path.join(outputDir, 'card-structure.json');
      fs.writeFileSync(cardFile, JSON.stringify(cardElements, null, 2));
      console.log(`✅ 卡片结构已保存到：${cardFile}\n`);
    }
    
    // 生成选择器建议
    console.log('💡 选择器建议:\n');
    
    const suggestions = await page.evaluate(() => {
      const suggestions = {};
      
      // 笔记卡片
      const cardSelectors = [
        '[data-e2e="search-result-item"]',
        '[data-e2e="note-item"]',
        '.note-item',
        '.search-result-item',
        '.note-card',
      ];
      for (const sel of cardSelectors) {
        if (document.querySelectorAll(sel).length > 0) {
          suggestions.resultCard = sel;
          break;
        }
      }
      
      // 标题
      const titleSelectors = [
        '[data-e2e="note-title"]',
        '[data-e2e="title"]',
        '.note-title',
        '.title',
        'h3[class*="title"]',
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim().length > 0) {
          suggestions.noteTitle = sel;
          break;
        }
      }
      
      // 作者
      const authorSelectors = [
        '[data-e2e="author-name"]',
        '[data-e2e="blogger-name"]',
        '.author-name',
        '.blogger-name',
        '.nickname',
      ];
      for (const sel of authorSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          suggestions.bloggerName = sel;
          break;
        }
      }
      
      // 点赞
      const likeSelectors = [
        '[data-e2e="like-count"]',
        '.like-count',
        '.like',
      ];
      for (const sel of likeSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          suggestions.noteLike = sel;
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
    
    console.log('✅ DOM 分析完成！\n');
    console.log('📁 生成的文件:');
    console.log(`  - ${htmlFile} (页面 HTML)`);
    console.log(`  - ${screenshotFile} (页面截图)`);
    console.log(`  - ${cardFile} (卡片结构)`);
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

main();
