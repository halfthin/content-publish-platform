/**
 * 博主主页深度 DOM 分析
 * 目标：找到小红书号、粉丝数的正确选择器
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

const TARGET_URL = "https://www.xiaohongshu.com/user/profile/69626b900000000014015708";

async function main() {
  console.log('🔬 开始深度分析博主主页 DOM...\n');
  
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
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    // 保存完整 HTML
    const html = await page.content();
    fs.writeFileSync('/home/halfthin/dev/sop/content-publish-platform/.workspace/debug/user-profile-deep.html', html);
    console.log('✅ HTML 已保存\n');
    
    // 深度分析：查找所有可能的元素
    console.log('🔍 深度分析关键元素...\n');
    
    const analysisResults = await page.evaluate(() => {
      function getXPath(el) {
        if (!el || !el.ownerDocument) return 'N/A';
        if (el.id) return `//*[@id="${el.id}"]`;
        const parts = [];
        let current = el;
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
      
      const results = {
        userId: [],
        fans: [],
        follow: [],
        likes: [],
        ipLocation: [],
        allStats: [],
      };
      
      // 1. 查找包含"小红书号"文本的元素
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className || '';
        const tagName = el.tagName.toLowerCase();
        
        // 查找小红书号
        if (text.includes('小红书号') || text.includes('redId') || /^\d{10,}$/.test(text)) {
          results.userId.push({
            tag: tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 50),
            xpath: getXPath(el),
          });
        }
        
        // 查找粉丝
        if (text.includes('粉丝') || text.includes('fans') || text.includes('follower')) {
          results.fans.push({
            tag: tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 50),
            parentClass: el.parentElement?.className || '',
          });
        }
        
        // 查找关注
        if (text.includes('关注') && !text.includes('已关注')) {
          results.follow.push({
            tag: tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 50),
            parentClass: el.parentElement?.className || '',
          });
        }
        
        // 查找获赞
        if (text.includes('获赞') || text.includes('收藏')) {
          results.likes.push({
            tag: tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 50),
            parentClass: el.parentElement?.className || '',
          });
        }
        
        // 查找 IP
        if (text.includes('IP') || text.includes('广东') || text.includes('北京') || text.includes('上海')) {
          results.ipLocation.push({
            tag: tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 50),
          });
        }
      });
      
      // 2. 查找统计数字区域
      const statContainers = document.querySelectorAll('[class*="interact"], [class*="stat"], [class*="count"]');
      statContainers.forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 200) {
          results.allStats.push({
            class: el.className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 100),
            children: Array.from(el.children).map(c => ({
              tag: c.tagName.toLowerCase(),
              class: (c.className || '').split(' ').slice(0, 3).join('.'),
              text: (c.textContent || '').trim().substring(0, 30),
            })).slice(0, 5),
          });
        }
      });
      
      // 限制结果数量
      Object.keys(results).forEach(key => {
        results[key] = results[key].slice(0, 10);
      });
      
      return results;
    });
    
    // 打印结果
    console.log('=== 小红书号相关元素 ===');
    analysisResults.userId.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
      console.log(`   XPath: ${el.xpath}`);
    });
    
    console.log('\n=== 粉丝数相关元素 ===');
    analysisResults.fans.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
      console.log(`   父级：${el.parentClass}`);
    });
    
    console.log('\n=== 关注数相关元素 ===');
    analysisResults.follow.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
    });
    
    console.log('\n=== 获赞与收藏相关元素 ===');
    analysisResults.likes.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
    });
    
    console.log('\n=== 统计区域结构 ===');
    analysisResults.allStats.forEach((el, i) => {
      console.log(`${i + 1}. 容器：.${el.class}`);
      console.log(`   内容："${el.text}"`);
      el.children.forEach((c, j) => {
        console.log(`      ${j + 1}. <${c.tag}> ${c.class ? '.' + c.class : ''} "${c.text}"`);
      });
    });
    
    // 保存分析结果
    fs.writeFileSync(
      '/home/halfthin/dev/sop/content-publish-platform/.workspace/debug/user-profile-deep-analysis.json',
      JSON.stringify(analysisResults, null, 2)
    );
    console.log('\n✅ 分析结果已保存\n');
    
    await browser.close();
    
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
