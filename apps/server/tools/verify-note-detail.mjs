/**
 * 验证博文详情页选择器
 * 使用从博主主页获取的有效笔记 URL
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

// 从博主主页获取的有效笔记 ID
const NOTE_IDS = [
  '698c42b6000000000c0379c4',  // 160 90｜又带着春季穿搭思路来啦！
  '698eeae2000000000903af9a',  // 160 90｜我已经想好了今年开春就这样穿！
  '69a96c7d000000002202effa',  // 160 90｜就这样穿出明媚又漂亮的早春穿搭～
];

async function main() {
  console.log('🔍 开始验证博文详情页选择器...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    const page = await context.newPage();
    
    const results = [];
    
    for (const noteId of NOTE_IDS) {
      const url = `https://www.xiaohongshu.com/explore/${noteId}`;
      console.log(`\n📍 测试笔记：${noteId}`);
      console.log(`URL: ${url}\n`);
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        
        // 检查是否成功加载
        const title = await page.title();
        if (title.includes('小红书') || title.includes('笔记')) {
          console.log('✅ 页面加载成功');
          
          // 测试选择器
          const selectors = {
            '图片': ['[class*="image"] img', '.note-image img', 'img[class*="image"]'],
            '标题': ['.note-title', '[class*="title"]', '.title'],
            '内容': ['.note-content', '.content', '[class*="content"]', '.desc'],
            '点赞数': ['.like-count', '[class*="like"] .count', '.likes', '.like-wrapper .count'],
            '收藏数': ['.collect-count', '[class*="collect"] .count', '.collects'],
            '评论数': ['.comment-count', '[class*="comment"] .count', '.comments'],
          };
          
          const foundSelectors = {};
          
          for (const [name, selectorList] of Object.entries(selectors)) {
            let found = false;
            for (const selector of selectorList) {
              try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                  const text = await page.$eval(selector, el => el.textContent?.trim() || el.getAttribute('src')?.substring(0, 50) || '有内容');
                  console.log(`  ✅ ${name}: ${selector} => "${text.substring(0, 30)}..."`);
                  foundSelectors[name] = selector;
                  found = true;
                  break;
                }
              } catch (e) {
                // ignore
              }
            }
            if (!found) {
              console.log(`  ❌ ${name}: 未找到`);
              foundSelectors[name] = null;
            }
          }
          
          results.push({
            noteId,
            url,
            status: 'success',
            selectors: foundSelectors,
          });
          
        } else {
          console.log(`⚠️ 页面可能受限或已删除`);
          results.push({
            noteId,
            url,
            status: 'failed',
            reason: '页面受限或已删除',
          });
        }
        
      } catch (error) {
        console.log(`❌ 访问失败：${error.message}`);
        results.push({
          noteId,
          url,
          status: 'error',
          error: error.message,
        });
      }
    }
    
    // 保存结果
    const resultFile = '/home/halfthin/dev/sop/content-publish-platform/.workspace/tests/note-detail-final-verify.json';
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    console.log(`\n✅ 验证结果已保存：${resultFile}\n`);
    
    // 打印摘要
    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`📊 验证摘要:`);
    console.log(`  总测试数：${results.length}`);
    console.log(`  成功：${successCount}`);
    console.log(`  失败：${results.length - successCount}`);
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
