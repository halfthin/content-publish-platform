/**
 * 测试博文详情页主互动区域
 */

import { chromium } from 'playwright';

const VALID_COOKIES = [
  { name: "a1", value: "199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821", domain: ".xiaohongshu.com", path: "/" },
  { name: "id_token", value: "VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg", domain: ".xiaohongshu.com", path: "/" },
  { name: "web_session", value: "040069b557e75f10f74b91dd9f3b4b6a3ce9e5", domain: ".xiaohongshu.com", path: "/" },
  { name: "xsecappid", value: "xhs-pc-web", domain: ".xiaohongshu.com", path: "/" },
  { name: "webId", value: "e848b3ccac9c3f57790ef018a6fb43fd", domain: ".xiaohongshu.com", path: "/" },
];

const NOTE_URL = 'https://www.xiaohongshu.com/explore/698c42b6000000000c0379c4';

async function main() {
  console.log('🔍 测试博文详情页主互动区...\n');
  
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    const page = await context.newPage();
    
    await page.goto(NOTE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(10000);
    
    // 尝试多种选择器查找互动按钮
    const selectors = [
      '[class*="action"]',
      '[class*="interact"]',
      '[class*="bar"]',
      '[class*="footer"]',
      '[class*="side"]',
      '[class*="right"]',
      '.note-detail-interaction',
      '.interaction',
      '.action-bar',
      '.footer',
    ];
    
    console.log('查找互动区域:\n');
    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          const text = await page.$eval(selector, el => el.textContent?.substring(0, 200) || '');
          console.log(`✅ ${selector} (${elements.length}个) - "${text.replace(/\n/g, ' ').substring(0, 100)}..."`);
        }
      } catch (e) {}
    }
    
    // 查找所有按钮
    console.log('\n查找按钮元素:\n');
    const buttons = await page.evaluate(() => {
      const results = [];
      const allButtons = document.querySelectorAll('button, [role="button"], [class*="btn"], [class*="button"]');
      allButtons.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className || '';
        if (text.includes('赞') || text.includes('收藏') || text.includes('评论') || text.includes('转发') || text.includes('分享')) {
          results.push({
            tag: el.tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text,
          });
        }
      });
      return results.slice(0, 20);
    });
    
    buttons.forEach(btn => {
      console.log(`  - <${btn.tag}>${btn.class ? '.' + btn.class : ''} "${btn.text}"`);
    });
    
    // 查找所有包含数字和文本的元素组合
    console.log('\n查找互动数据:\n');
    const stats = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className || '';
        
        // 查找可能的互动标签
        if (text.includes('赞') || text.includes('藏') || text.includes('论') || text.includes('享')) {
          const parent = el.parentElement;
          const siblings = Array.from(parent?.children || []).map(c => ({
            class: (c.className || '').split(' ').slice(0, 3).join('.'),
            text: (c.textContent?.trim() || '').substring(0, 20),
          }));
          
          results.push({
            tag: el.tagName.toLowerCase(),
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 30),
            parentClass: parent?.className?.split(' ').slice(0, 3).join('.') || '',
            siblings: siblings.slice(0, 5),
          });
        }
      });
      
      return results.slice(0, 15);
    });
    
    stats.forEach(stat => {
      console.log(`  - <${stat.tag}>${stat.class ? '.' + stat.class : ''} "${stat.text}"`);
      console.log(`    父：${stat.parentClass}`);
      stat.siblings.forEach(sib => {
        console.log(`    兄弟：${sib.class} "${sib.text}"`);
      });
      console.log('');
    });
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
