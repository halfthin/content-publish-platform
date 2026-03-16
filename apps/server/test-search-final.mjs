/**
 * 小红书搜索最终测试 - 使用提供的 Cookie
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Cookie 配置
const VALID_COOKIES = [
  { name: "a1", value: "199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821", domain: ".xiaohongshu.com", path: "/" },
  { name: "id_token", value: "VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg", domain: ".xiaohongshu.com", path: "/" },
  { name: "web_session", value: "040069b557e75f10f74b91dd9f3b4b6a3ce9e5", domain: ".xiaohongshu.com", path: "/" },
  { name: "xsecappid", value: "xhs-pc-web", domain: ".xiaohongshu.com", path: "/" },
  { name: "webId", value: "e848b3ccac9c3f57790ef018a6fb43fd", domain: ".xiaohongshu.com", path: "/" },
];

async function main() {
  console.log('🧪 开始小红书搜索最终测试...\n');
  
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
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=通勤穿搭&source=web_search_result_notes', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    await page.waitForTimeout(10000);
    
    // 2. 检查登录状态
    console.log('=== 2. 检查登录状态 ===');
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img, [class*="user"] img');
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '⚠️ 未检测到登录状态\n');
    
    // 3. 保存页面 HTML 供分析
    console.log('=== 3. 保存页面 HTML ===');
    const html = await page.content();
    const htmlFile = path.join('/home/halfthin/dev/content-publish-platform/.workspace/debug', 'search-page-with-cookie.html');
    
    // 确保目录存在
    const dir = path.dirname(htmlFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(htmlFile, html);
    console.log(`✅ HTML 已保存到：${htmlFile}\n`);
    
    // 4. 查找博主卡片
    console.log('=== 4. 查找博主卡片 ===');
    const cardSelectors = [
      '.note-item',
      '.search-result-item',
      '.note-card',
      '[class*="note"]',
      '[class*="card"]',
      '[class*="search-result"]',
      'section[class*="note"]',
      'article[class*="note"]',
    ];
    
    let resultCards = [];
    for (const selector of cardSelectors) {
      try {
        resultCards = await page.$$(selector);
        if (resultCards.length > 0) {
          console.log(`✅ 找到匹配的选择器：${selector} (${resultCards.length} 个)\n`);
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (resultCards.length === 0) {
      console.log('❌ 未找到博主卡片\n');
      await browser.close();
      return;
    }
    
    // 5. 分析第一个卡片的 HTML 结构
    console.log('=== 5. 分析卡片结构 ===');
    const firstCard = resultCards[0];
    const cardHtml = await firstCard.innerHTML();
    const cardHtmlFile = path.join(dir, 'first-card.html');
    fs.writeFileSync(cardHtmlFile, cardHtml);
    console.log(`✅ 第一个卡片 HTML 已保存到：${cardHtmlFile}\n`);
    
    // 6. 尝试不同的选择器组合
    console.log('=== 6. 测试不同选择器 ===');
    const testSelectors = {
      '标题': ['[class*="title"]', '.title', 'h3', '[class*="content"]', '.note-content'],
      '作者': ['[class*="author"]', '[class*="user"]', '.nickname', '.username', '[class*="name"]'],
      '点赞': ['[class*="like"]', '[class*="heart"]', '[class*="collect"]', '[class*="star"]'],
    };
    
    for (const [fieldName, selectors] of Object.entries(testSelectors)) {
      console.log(`\n测试 ${fieldName}:`);
      for (const selector of selectors) {
        try {
          const el = await firstCard.$(selector);
          if (el) {
            const text = await el.textContent();
            console.log(`  ✅ ${selector}: "${text?.trim()?.substring(0, 50) || '无文本'}"`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    console.log('\n=== 测试完成 ===');
    console.log('\n📁 生成的文件:');
    console.log(`  - ${htmlFile} (完整页面 HTML)`);
    console.log(`  - ${cardHtmlFile} (第一个卡片 HTML)`);
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

main();
