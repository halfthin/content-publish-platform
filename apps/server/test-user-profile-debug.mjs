/**
 * 用户主页调试脚本 - 捕获页面 HTML
 */

import { chromium } from 'playwright';
import fs from 'fs';

const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

async function main() {
  console.log('🔍 开始调试用户主页...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    
    const page = await context.newPage();
    
    const testUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
    console.log(`访问：${testUrl}\n`);
    
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    console.log('✅ 页面加载完成\n');
    
    // 保存完整 HTML
    const html = await page.content();
    fs.writeFileSync('/home/halfthin/dev/content-publish-platform/.workspace/debug/user-profile-page.html', html);
    console.log('✅ 已保存页面 HTML 到：/home/halfthin/dev/content-publish-platform/.workspace/debug/user-profile-page.html\n');
    
    // 尝试查找包含统计信息的元素
    console.log('📊 查找统计信息元素...\n');
    
    // 查找所有包含数字的元素
    const statsElements = await page.evaluate(() => {
      const results = [];
      
      // 查找所有可能包含统计信息的元素
      const selectors = [
        '[class*="stat"]',
        '[class*="count"]',
        '[class*="fan"]',
        '[class*="follow"]',
        '[class*="like"]',
        '.user-stats',
        '.stats',
        '[data-e2e*="stat"]',
        '[data-e2e*="count"]',
        '[data-e2e*="fan"]',
      ];
      
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent?.trim();
            if (text && text.length < 50) {
              results.push({
                selector,
                tag: el.tagName,
                class: el.className,
                text: text.substring(0, 100),
                dataE2e: el.getAttribute('data-e2e'),
              });
            }
          }
        } catch (e) {
          // ignore
        }
      }
      
      return results;
    });
    
    console.log(`找到 ${statsElements.length} 个可能的统计元素:\n`);
    statsElements.slice(0, 20).forEach((el, i) => {
      console.log(`${i + 1}. [${el.tag}] class="${el.class}" data-e2e="${el.dataE2e || ''}"`);
      console.log(`   文本：${el.text}\n`);
    });
    
    // 查找所有包含"粉丝"或"follow"文本的元素
    console.log('\n🔍 查找包含"粉丝"或相关文本的元素...\n');
    
    const fanElements = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      
      for (const el of allElements) {
        const text = el.textContent?.trim();
        if (text && (text.includes('粉丝') || text.includes('关注') || text.includes('获赞'))) {
          if (text.length < 100) {
            results.push({
              tag: el.tagName,
              class: el.className,
              text: text,
              dataE2e: el.getAttribute('data-e2e'),
              id: el.id,
            });
          }
        }
      }
      
      return results.slice(0, 30);
    });
    
    console.log(`找到 ${fanElements.length} 个包含统计文本的元素:\n`);
    fanElements.forEach((el, i) => {
      console.log(`${i + 1}. [${el.tag}] class="${el.class}" id="${el.id || ''}" data-e2e="${el.dataE2e || ''}"`);
      console.log(`   文本：${el.text}\n`);
    });
    
    // 查找用户信息区域
    console.log('\n👤 查找用户信息区域...\n');
    
    const userInfoElements = await page.evaluate(() => {
      const results = [];
      const selectors = [
        '.user-info',
        '.user-info-wrapper',
        '.profile-info',
        '[class*="user-info"]',
        '[class*="profile"]',
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent?.trim().substring(0, 200);
          if (text) {
            results.push({
              selector,
              tag: el.tagName,
              class: el.className,
              text: text,
            });
          }
        }
      }
      
      return results;
    });
    
    console.log(`找到 ${userInfoElements.length} 个用户信息元素:\n`);
    userInfoElements.slice(0, 5).forEach((el, i) => {
      console.log(`${i + 1}. [${el.tag}] class="${el.class}"`);
      console.log(`   内容：${el.text.substring(0, 150)}...\n`);
    });
    
    await browser.close();
    console.log('\n✅ 调试完成！\n');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
