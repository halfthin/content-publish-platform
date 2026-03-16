/**
 * 小红书搜索页面博主信息调试脚本
 * 
 * 目的：找出搜索页面中博主信息的正确选择器
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VALID_COOKIES = [
  { name: "a1", value: "199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821", domain: ".xiaohongshu.com", path: "/" },
  { name: "id_token", value: "VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg", domain: ".xiaohongshu.com", path: "/" },
  { name: "web_session", value: "040069b557e75f10f74b91dd9f3b4b6a3ce9e5", domain: ".xiaohongshu.com", path: "/" },
  { name: "xsecappid", value: "xhs-pc-web", domain: ".xiaohongshu.com", path: "/" },
  { name: "webId", value: "e848b3ccac9c3f57790ef018a6fb43fd", domain: ".xiaohongshu.com", path: "/" },
];

async function main() {
  console.log('🔍 开始分析搜索页面博主信息...\n');
  
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
    
    // 1. 访问搜索页面
    console.log('=== 1. 访问搜索页面 ===');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=穿搭&source=web_search_result_notes', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    await page.waitForTimeout(10000);
    
    // 2. 查找所有笔记卡片
    console.log('=== 2. 查找笔记卡片 ===');
    const noteCards = await page.$$('.note-item');
    console.log(`找到 ${noteCards.length} 个笔记卡片\n`);
    
    if (noteCards.length === 0) {
      console.log('❌ 未找到笔记卡片，尝试其他选择器...\n');
      const altSelectors = [
        '.search-result-item',
        '.note-card',
        '[class*="note"]',
        '[class*="card"]',
        '[class*="search-result"]',
      ];
      
      for (const selector of altSelectors) {
        const cards = await page.$$(selector);
        if (cards.length > 0) {
          console.log(`✅ 找到匹配的选择器：${selector} (${cards.length} 个)\n`);
          break;
        }
      }
    }
    
    // 3. 分析第一个卡片的完整 HTML
    console.log('=== 3. 分析第一个卡片结构 ===');
    if (noteCards.length > 0) {
      const firstCard = noteCards[0];
      
      // 保存卡片 HTML
      const cardHtml = await firstCard.innerHTML();
      const cardHtmlFile = '/home/halfthin/dev/content-publish-platform/.workspace/debug/search-card-structure.html';
      
      const dir = path.dirname(cardHtmlFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(cardHtmlFile, cardHtml);
      console.log(`✅ 卡片 HTML 已保存到：${cardHtmlFile}\n`);
      
      // 4. 测试不同的作者信息选择器
      console.log('=== 4. 测试作者信息选择器 ===');
      
      const authorSelectors = [
        '[class*="author"]',
        '[class*="user"]',
        '.nickname',
        '.username',
        '[class*="name"]',
        '.user-name',
        '[data-e2e*="author"]',
        '[data-e2e*="user"]',
        'a[class*="user"]',
        'div[class*="user"] span',
        '[class*="user-info"]',
        '[class*="nickname"]',
      ];
      
      for (const selector of authorSelectors) {
        try {
          const el = await firstCard.$(selector);
          if (el) {
            const text = await el.textContent();
            console.log(`✅ ${selector}: "${text?.trim()?.substring(0, 50) || '无文本'}"`);
          }
        } catch (error) {
          // ignore
        }
      }
      
      // 5. 获取卡片内所有带文本的元素
      console.log('\n=== 5. 卡片内所有带文本的元素 ===');
      const allTexts = await firstCard.evaluate(() => {
        const elements = document.querySelectorAll('*');
        const result = [];
        for (const el of elements) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            result.push({
              tag: el.tagName.toLowerCase(),
              class: el.className,
              text: text.substring(0, 100),
            });
          }
        }
        return result.slice(0, 30);
      });
      
      for (const item of allTexts) {
        console.log(`<${item.tag}> class="${item.class}": "${item.text}"`);
      }
      
      // 6. 保存页面截图
      console.log('\n=== 6. 保存页面截图 ===');
      const screenshotFile = '/home/halfthin/dev/content-publish-platform/.workspace/debug/search-page-screenshot.png';
      await page.screenshot({ path: screenshotFile, fullPage: false });
      console.log(`✅ 截图已保存到：${screenshotFile}\n`);
    }
    
    console.log('=== 分析完成 ===');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

main();
