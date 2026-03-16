/**
 * 博文详情页选择器验证脚本
 * 
 * 验证 xiaohongshu-note-selectors.ts 中的选择器
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

// 测试博文列表（从搜索结果中获取）
const TEST_NOTES = [
  // 需要从搜索页面获取实际笔记 URL
];

// 选择器配置
const NOTE_SELECTORS = {
  images: ['[class*="image"] img', '.note-image img', 'img[class*="image"]', '[class*="img"] img'],
  title: ['.note-title', '[class*="title"]', '.title', 'h1[class*="title"]'],
  content: ['.note-content', '.content', '[class*="content"]', '.desc', '[class*="desc"]'],
  likeCount: ['.like-count', '[class*="like"] .count', '.likes', '[class*="like-count"]'],
  collectCount: ['.collect-count', '[class*="collect"] .count', '.collects', '[class*="collect-count"]'],
  commentCount: ['.comment-count', '[class*="comment"] .count', '.comments', '[class*="comment-count"]'],
};

async function main() {
  console.log('🧪 开始验证博文详情页选择器...\n');
  
  const results = {
    testTime: new Date().toISOString(),
    pageType: 'noteDetail',
    status: 'running',
    notes: [],
  };
  
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
    
    // 先访问搜索页面获取笔记 URL
    console.log('=== 访问搜索页面获取笔记 URL ===');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=穿搭&source=web_search_result_notes', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(10000);
    
    // 获取第一个笔记的 URL
    const noteLinks = await page.$$('a[href*="/explore/"]');
    if (noteLinks.length > 0) {
      const firstNoteUrl = await noteLinks[0].getAttribute('href');
      const fullUrl = firstNoteUrl.startsWith('http') ? firstNoteUrl : `https://www.xiaohongshu.com${firstNoteUrl}`;
      console.log(`找到笔记 URL: ${fullUrl}\n`);
      TEST_NOTES.push({ url: fullUrl, title: '测试笔记' });
    } else {
      console.log('❌ 未找到笔记链接\n');
    }
    
    // 测试每个笔记
    for (const note of TEST_NOTES) {
      console.log(`=== 测试笔记：${note.title || '未知'} ===`);
      console.log(`URL: ${note.url}\n`);
      
      try {
        await page.goto(note.url, {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await page.waitForTimeout(10000);
        
        // 保存页面 HTML
        const html = await page.content();
        const htmlFile = '/home/halfthin/dev/content-publish-platform/.workspace/debug/note-detail-html.html';
        const dir = path.dirname(htmlFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(htmlFile, html);
        console.log(`✅ 页面 HTML 已保存到：${htmlFile}\n`);
        
        // 测试每个选择器
        const selectorResults = {};
        
        for (const [fieldName, selectors] of Object.entries(NOTE_SELECTORS)) {
          console.log(`测试 ${fieldName}:`);
          
          let found = false;
          for (const selector of selectors) {
            try {
              const elements = await page.$$(selector);
              if (elements.length > 0) {
                const text = await elements[0].textContent();
                const tagName = await elements[0].evaluate(el => el.tagName.toLowerCase());
                
                if (tagName === 'img') {
                  const src = await elements[0].getAttribute('src');
                  console.log(`  ✅ ${selector}: <img> (${elements.length} 个)`);
                  selectorResults[fieldName] = {
                    status: 'success',
                    selector,
                    count: elements.length,
                    text: src?.substring(0, 100),
                  };
                } else {
                  console.log(`  ✅ ${selector}: "${text?.trim()?.substring(0, 50) || '无文本'}" (${elements.length} 个)`);
                  selectorResults[fieldName] = {
                    status: 'success',
                    selector,
                    count: elements.length,
                    text: text?.trim()?.substring(0, 100),
                  };
                }
                found = true;
                break;
              }
            } catch (error) {
              // ignore
            }
          }
          
          if (!found) {
            console.log(`  ❌ 未找到匹配元素\n`);
            selectorResults[fieldName] = {
              status: 'failed',
              selector: null,
              count: 0,
              text: null,
            };
          }
        }
        
        results.notes.push({
          url: note.url,
          title: note.title,
          selectors: selectorResults,
        });
        
        console.log('');
        
      } catch (error) {
        console.log(`❌ 访问失败：${error.message}\n`);
        results.notes.push({
          url: note.url,
          title: note.title,
          error: error.message,
        });
      }
    }
    
    // 生成报告
    results.status = 'success';
    
    const reportDir = '/home/halfthin/dev/content-publish-platform/.workspace/tests';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, 'note-detail-verify-result.json');
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`✅ 测试结果已保存到：${reportFile}\n`);
    
    // 打印摘要
    console.log('=== 验证摘要 ===');
    const successCount = results.notes[0]?.selectors ? 
      Object.values(results.notes[0].selectors).filter(s => s.status === 'success').length : 0;
    const totalCount = Object.keys(NOTE_SELECTORS).length;
    console.log(`成功：${successCount}/${totalCount}`);
    
    await browser.close();
    console.log('\n✅ 验证完成！');
    
  } catch (error) {
    console.error('❌ 验证失败:', error.message);
    results.status = 'failed';
    results.error = error.message;
  } finally {
    if (browser) await browser.close();
  }
}

main();
