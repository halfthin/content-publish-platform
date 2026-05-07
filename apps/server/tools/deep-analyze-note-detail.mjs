/**
 * 深度分析博文详情页 DOM 结构 - 简化版
 * 找出收藏数和评论数的正确选择器
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

const NOTE_URL = 'https://www.xiaohongshu.com/explore/698c42b6000000000c0379c4';

async function main() {
  console.log('🔬 开始深度分析博文详情页 DOM...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    const page = await context.newPage();
    
    await page.goto(NOTE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    // 保存完整 HTML
    const html = await page.content();
    const htmlFile = '/home/halfthin/dev/sop/content-publish-platform/.workspace/debug/note-detail-full.html';
    fs.writeFileSync(htmlFile, html);
    console.log(`✅ HTML 已保存：${htmlFile}\n`);
    
    // 查找包含"收藏"和"评论"的元素及其附近数字
    console.log('🔎 查找互动按钮区域...\n');
    
    const result = await page.evaluate(() => {
      const results = {
        withCollect: [],
        withComment: [],
        withLike: [],
        stats: [],
      };
      
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className || '';
        
        // 查找包含关键词的元素
        if (text.includes('收藏') && text.length < 100) {
          const parent = el.parentElement;
          results.withCollect.push({
            tag: el.tagName.toLowerCase(),
            class: className.split(' ').slice(0, 5).join('.'),
            text,
            parentClass: parent?.className?.split(' ').slice(0, 3).join('.') || '',
          });
        }
        
        if (text.includes('评论') && text.length < 100) {
          const parent = el.parentElement;
          results.withComment.push({
            tag: el.tagName.toLowerCase(),
            class: className.split(' ').slice(0, 5).join('.'),
            text,
            parentClass: parent?.className?.split(' ').slice(0, 3).join('.') || '',
          });
        }
        
        if ((text.includes('赞') || text.includes('点赞')) && text.length < 100 && !text.includes('获赞')) {
          const parent = el.parentElement;
          results.withLike.push({
            tag: el.tagName.toLowerCase(),
            class: className.split(' ').slice(0, 5).join('.'),
            text,
            parentClass: parent?.className?.split(' ').slice(0, 3).join('.') || '',
          });
        }
        
        // 查找统计数字
        const numberPattern = /^\d+(\.\d+)?[万kK+]?$/;
        if (numberPattern.test(text) && text.length < 15) {
          const parent = el.parentElement;
          const grandParent = parent?.parentElement;
          results.stats.push({
            tag: el.tagName.toLowerCase(),
            class: className.split(' ').slice(0, 5).join('.'),
            text,
            parentClass: parent?.className?.split(' ').slice(0, 3).join('.') || '',
            grandParentClass: grandParent?.className?.split(' ').slice(0, 3).join('.') || '',
          });
        }
      });
      
      // 去重
      results.withCollect = results.withCollect.slice(0, 10);
      results.withComment = results.withComment.slice(0, 10);
      results.withLike = results.withLike.slice(0, 10);
      results.stats = results.stats.slice(0, 30);
      
      return results;
    });
    
    console.log('📊 包含"收藏"的元素:');
    result.withCollect.forEach((el, i) => {
      console.log(`  ${i + 1}. <${el.tag}>${el.class ? '.' + el.class : ''} "${el.text}"`);
      console.log(`     父：${el.parentClass || '无'}`);
    });
    
    console.log('\n📊 包含"评论"的元素:');
    result.withComment.forEach((el, i) => {
      console.log(`  ${i + 1}. <${el.tag}>${el.class ? '.' + el.class : ''} "${el.text}"`);
      console.log(`     父：${el.parentClass || '无'}`);
    });
    
    console.log('\n📊 包含"赞"的元素:');
    result.withLike.forEach((el, i) => {
      console.log(`  ${i + 1}. <${el.tag}>${el.class ? '.' + el.class : ''} "${el.text}"`);
      console.log(`     父：${el.parentClass || '无'}`);
    });
    
    console.log('\n📊 统计数字元素:');
    result.stats.forEach((el, i) => {
      console.log(`  ${i + 1}. "${el.text}" - <${el.tag}>${el.class ? '.' + el.class : ''}`);
      console.log(`     父：${el.parentClass}, 祖父：${el.grandParentClass}`);
    });
    
    // 保存结果
    const resultFile = '/home/halfthin/dev/sop/content-publish-platform/.workspace/debug/note-detail-structure.json';
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(`\n✅ 分析结果已保存：${resultFile}\n`);
    
    await browser.close();
    console.log('✅ 分析完成！\n');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
