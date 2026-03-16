/**
 * 验证笔记详情页面加载
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
  console.log('🔍 验证笔记详情页面加载...\n');
  
  let browser;
  try {
    browser = await chromium.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    const page = await context.newPage();
    
    console.log(`访问：${NOTE_URL}\n`);
    
    const response = await page.goto(NOTE_URL, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    console.log(`响应状态：${response?.status()}\n`);
    
    await page.waitForTimeout(10000);
    
    const title = await page.title();
    const url = page.url();
    
    console.log(`页面标题：${title}`);
    console.log(`当前 URL: ${url}\n`);
    
    // 检查是否在笔记详情页
    const isNoteDetail = url.includes('/explore/') && url.length > 40;
    console.log(`是否笔记详情页：${isNoteDetail ? '✅ 是' : '❌ 否'}\n`);
    
    if (!isNoteDetail) {
      console.log('⚠️ 页面可能被重定向或笔记不可用');
      
      // 尝试从博主主页获取一个有效笔记
      console.log('\n尝试从博主主页获取笔记...');
      
      const userProfileUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
      await page.goto(userProfileUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(8000);
      
      // 获取第一个笔记链接
      const noteLink = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/explore/"]');
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && href.includes('/explore/')) {
            return href;
          }
        }
        return null;
      });
      
      if (noteLink) {
        console.log(`找到笔记链接：${noteLink}`);
        
        const fullUrl = noteLink.startsWith('http') ? noteLink : `https://www.xiaohongshu.com${noteLink}`;
        console.log(`访问：${fullUrl}`);
        
        await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(10000);
        
        console.log(`新页面标题：${await page.title()}`);
        console.log(`新 URL: ${page.url()}`);
      }
    }
    
    // 查找互动按钮区域
    console.log('\n查找互动按钮:\n');
    
    const buttons = await page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className || '';
        const tagName = el.tagName.toLowerCase();
        
        // 查找互动相关元素
        if (text.includes('赞') || text.includes('收藏') || text.includes('评论') || text.includes('分享')) {
          const parent = el.parentElement;
          results.push({
            tag: tagName,
            class: className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 50),
            parentClass: parent?.className?.split(' ').slice(0, 3).join('.') || '',
          });
        }
      });
      
      return results.slice(0, 20);
    });
    
    buttons.forEach(btn => {
      console.log(`  - <${btn.tag}>${btn.class ? '.' + btn.class : ''} "${btn.text}"`);
      console.log(`    父：${btn.parentClass}\n`);
    });
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
