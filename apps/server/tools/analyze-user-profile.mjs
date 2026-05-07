/**
 * 博主主页 DOM 结构分析器
 * 重新分析小红书号、粉丝数等失效选择器
 */

import { chromium } from 'playwright';
import fs from 'fs';

const VALID_COOKIES = [
  { name: "a1", value: "199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821", domain: ".xiaohongshu.com", path: "/" },
  { name: "id_token", value: "VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg", domain: ".xiaohongshu.com", path: "/" },
  { name: "web_session", value: "040069b557e75f10f74b91dd9f3b4b6a3ce9e5", domain: ".xiaohongshu.com", path: "/" },
  { name: "xsecappid", value: "xhs-pc-web", domain: ".xiaohongshu.com", path: "/" },
  { name: "webId", value: "e848b3ccac9c3f57790ef018a6fb43fd", domain: ".xiaohongshu.com", path: "/" },
];

const TARGET_USER = "https://www.xiaohongshu.com/user/profile/69626b900000000014015708";

async function main() {
  console.log('🔍 开始分析博主主页 DOM 结构...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    const page = await context.newPage();
    
    console.log('📍 访问博主主页...');
    await page.goto(TARGET_USER, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    // 保存完整 HTML
    const html = await page.content();
    const htmlFile = '/home/halfthin/dev/sop/content-publish-platform/.workspace/debug/user-profile-full.html';
    fs.writeFileSync(htmlFile, html);
    console.log(`✅ HTML 已保存：${htmlFile}\n`);
    
    // 分析关键元素
    console.log('📊 分析关键元素...\n');
    
    const targets = {
      '昵称': ['.user-nickname', '.nickname', '[class*="nickname"]', '[class*="user-name"]'],
      '小红书号': ['.user-id', '.red-id', '[class*="user-id"]', '[class*="red-id"]', '[class*="id"]'],
      'IP 属地': ['[class*="ip"]', '[class*="location"]', '.ip-location'],
      '关注数': ['.follow-count', '[class*="follow"]', '.following-count'],
      '粉丝数': ['.fans-count', '[class*="fan"]', '.followers-count', '[class*="follower"]'],
      '获赞与收藏': ['.likes-count', '.total-favorites', '[class*="like"]', '[class*="favorite"]'],
    };
    
    const results = {};
    
    for (const [name, selectors] of Object.entries(targets)) {
      console.log(`\n🔎 查找：${name}`);
      let found = false;
      
      for (const selector of selectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            const text = await page.$eval(selector, el => el.textContent?.trim() || '无文本');
            console.log(`  ✅ ${selector} => "${text}" (${elements.length}个)`);
            
            if (!found) {
              results[name] = {
                selector,
                text,
                count: elements.length,
              };
              found = true;
            }
          }
        } catch (e) {
          // ignore
        }
      }
      
      if (!found) {
        console.log(`  ❌ 未找到匹配元素`);
        results[name] = { selector: null, text: null, count: 0 };
      }
    }
    
    // 深度分析：查找包含关键词的所有元素
    console.log('\n\n🔬 深度分析：查找包含关键词的元素\n');
    
    const keywords = ['小红书号', '粉丝', '关注', '获赞', 'IP'];
    
    for (const keyword of keywords) {
      console.log(`\n搜索关键词："${keyword}"`);
      
      const elements = await page.evaluate((kw) => {
        const results = [];
        const allElements = document.querySelectorAll('*');
        
        allElements.forEach(el => {
          const text = el.textContent?.trim() || '';
          if (text.includes(kw) && text.length < 100) {
            const className = el.className || '';
            const id = el.id || '';
            const tagName = el.tagName.toLowerCase();
            
            results.push({
              tag: tagName,
              class: className.split(' ').slice(0, 3).join('.'),
              id,
              text: text.substring(0, 50),
              xpath: getXPath(el),
            });
          }
        });
        
        return results.slice(0, 10);
      }, keyword);
      
      elements.forEach(el => {
        console.log(`  - <${el.tag}> ${el.class ? '.' + el.class : ''} => "${el.text}"`);
      });
    }
    
    // 分析统计数字的元素
    console.log('\n\n📈 分析包含数字的元素（可能是统计数据）\n');
    
    const statsElements = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      
      const numberPattern = /^\d+(\.\d+)?[万kK]?$/;
      
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        if (numberPattern.test(text) && text.length < 20) {
          const className = el.className || '';
          const parent = el.parentElement;
          const parentClass = parent?.className || '';
          const parentText = parent?.textContent?.trim() || '';
          
          results.push({
            tag: el.tagName.toLowerCase(),
            class: className.split(' ').slice(0, 3).join('.'),
            text,
            parentClass: parentClass.split(' ').slice(0, 3).join('.'),
            parentText: parentText.substring(0, 50),
          });
        }
      });
      
      return results.slice(0, 20);
    });
    
    statsElements.forEach(el => {
      console.log(`  - <${el.tag}>${el.class ? '.' + el.class : ''} => "${el.text}" (父：${el.parentText})`);
    });
    
    // 保存分析结果
    const resultFile = '/home/halfthin/dev/sop/content-publish-platform/.workspace/debug/user-profile-analysis.json';
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    console.log(`\n✅ 分析结果已保存：${resultFile}\n`);
    
    await browser.close();
    console.log('✅ 分析完成！\n');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

function getXPath(element) {
  if (!element) return null;
  if (element.id) return `//*[@id="${element.id}"]`;
  
  const parts = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousSibling;
    
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    
    const tagName = current.nodeName.toLowerCase();
    parts.unshift(index === 1 ? tagName : `${tagName}[${index}]`);
    current = current.parentNode;
  }
  
  return '/' + parts.join('/');
}

main();
