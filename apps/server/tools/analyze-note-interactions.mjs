/**
 * 分析博文详情页互动区域
 * 目标：找到收藏数和评论数的选择器
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

// 有效的笔记 ID（从博主主页获取）
const NOTE_ID = '698c42b6000000000c0379c4';
const NOTE_URL = `https://www.xiaohongshu.com/explore/${NOTE_ID}`;

async function main() {
  console.log('🔍 分析博文详情页互动区域...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    const page = await context.newPage();
    
    console.log(`📍 访问：${NOTE_URL}`);
    await page.goto(NOTE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    // 保存 HTML
    const html = await page.content();
    fs.writeFileSync('/home/halfthin/dev/content-publish-platform/.workspace/debug/note-detail-interactions.html', html);
    console.log('✅ HTML 已保存\n');
    
    // 分析互动区域
    const interactions = await page.evaluate(() => {
      const results = {
        likeArea: [],
        collectArea: [],
        commentArea: [],
        allButtons: [],
        interactionBar: [],
      };
      
      // 查找所有按钮和互动元素
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = el.className || '';
        const tagName = el.tagName.toLowerCase();
        
        const classStr = String(className);
        
        // 查找点赞
        if (text.includes('点赞') || text.includes('喜欢') || classStr.includes('like')) {
          results.likeArea.push({
            tag: tagName,
            class: classStr.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 30),
            parentClass: el.parentElement?.className || '',
          });
        }
        
        // 查找收藏
        if (text.includes('收藏') || text.includes('collect') || classStr.includes('collect')) {
          results.collectArea.push({
            tag: tagName,
            class: classStr.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 30),
            parentClass: el.parentElement?.className || '',
          });
        }
        
        // 查找评论
        if (text.includes('评论') || text.includes('comment') || classStr.includes('comment')) {
          results.commentArea.push({
            tag: tagName,
            class: classStr.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 30),
            parentClass: el.parentElement?.className || '',
          });
        }
      });
      
      // 查找互动栏
      const bars = document.querySelectorAll('[class*="interaction"], [class*="interact"], [class*="action"]');
      bars.forEach(bar => {
        const text = bar.textContent?.trim() || '';
        if (text.length > 0 && text.length < 100) {
          results.interactionBar.push({
            class: bar.className.split(' ').slice(0, 5).join('.'),
            text: text.substring(0, 80),
            children: Array.from(bar.children).map(c => ({
              tag: c.tagName.toLowerCase(),
              class: (c.className || '').split(' ').slice(0, 3).join('.'),
              text: (c.textContent || '').trim().substring(0, 20),
            })).slice(0, 10),
          });
        }
      });
      
      // 查找所有按钮
      const buttons = document.querySelectorAll('button, [role="button"], [class*="btn"]');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim() || '';
        if (text.length > 0 && text.length < 50) {
          results.allButtons.push({
            tag: btn.tagName.toLowerCase(),
            class: (btn.className || '').split(' ').slice(0, 5).join('.'),
            text: text,
          });
        }
      });
      
      // 限制结果
      Object.keys(results).forEach(key => {
        results[key] = results[key].slice(0, 15);
      });
      
      return results;
    });
    
    // 打印结果
    console.log('=== 点赞相关元素 ===');
    interactions.likeArea.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
    });
    
    console.log('\n=== 收藏相关元素 ===');
    interactions.collectArea.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
    });
    
    console.log('\n=== 评论相关元素 ===');
    interactions.commentArea.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag}> ${el.class ? '.' + el.class : ''}`);
      console.log(`   文本："${el.text}"`);
    });
    
    console.log('\n=== 互动栏结构 ===');
    interactions.interactionBar.forEach((el, i) => {
      console.log(`${i + 1}. 容器：.${el.class}`);
      console.log(`   内容："${el.text}"`);
      el.children.forEach((c, j) => {
        console.log(`      ${j + 1}. <${c.tag}> ${c.class ? '.' + c.class : ''} "${c.text}"`);
      });
    });
    
    // 保存结果
    fs.writeFileSync(
      '/home/halfthin/dev/content-publish-platform/.workspace/debug/note-interactions-analysis.json',
      JSON.stringify(interactions, null, 2)
    );
    console.log('\n✅ 分析结果已保存\n');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
