/**
 * 验证博主主页选择器（最终版）
 * 使用正确的选择器验证 100% 成功率
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
  console.log('🔍 验证博主主页选择器（最终版）...\n');
  
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
    
    // 测试所有选择器
    const selectors = {
      '昵称': [
        '.user-nickname',
        '.nickname',
        '[class*="nickname"]',
        '.user-info .nickname'
      ],
      '小红书号': [
        'JSON: window.__INITIAL_STATE__.user.userPageData.basicInfo.redId'
      ],
      'IP 属地': [
        'JSON: window.__INITIAL_STATE__.user.userPageData.basicInfo.ipLocation'
      ],
      '关注数': [
        '.user-interactions > div:first-child .count',
        '.user-interactions div:has-text("关注") .count'
      ],
      '粉丝数': [
        '.user-interactions > div:nth-child(2) .count',
        '.user-interactions div:has-text("粉丝") .count'
      ],
      '获赞与收藏': [
        '.user-interactions > div:last-child .count',
        '.user-interactions div:has-text("获赞与收藏") .count'
      ],
      '笔记卡片': [
        '.note-item',
        'section.note-item'
      ],
      '笔记标题': [
        '.title',
        '[class*="title"]'
      ],
    };
    
    const results = {};
    let successCount = 0;
    let totalCount = 0;
    
    for (const [name, selectorList] of Object.entries(selectors)) {
      totalCount++;
      console.log(`\n📍 测试：${name}`);
      
      let found = false;
      for (const selector of selectorList) {
        try {
          let value = null;
          
          // JSON 提取
          if (selector.startsWith('JSON:')) {
            const jsonPath = selector.replace('JSON:', '').trim();
            value = await page.evaluate((path) => {
              return path.split('.').reduce((obj, key) => obj?.[key], window);
            }, jsonPath);
            
            if (value) {
              console.log(`  ✅ ${selector} => "${value}"`);
              results[name] = { selector, value, method: 'JSON' };
              found = true;
              successCount++;
              break;
            }
          } else {
            // DOM 提取
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              value = await page.$eval(selector, el => el.textContent?.trim() || '有内容');
              console.log(`  ✅ ${selector} => "${value}" (${elements.length}个)`);
              results[name] = { selector, value, method: 'DOM' };
              found = true;
              successCount++;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
      
      if (!found) {
        console.log(`  ❌ 未找到`);
        results[name] = { selector: null, value: null, method: null, error: '未找到' };
      }
    }
    
    // 打印摘要
    console.log('\n\n========================================');
    console.log(`📊 验证结果：${successCount}/${totalCount} 成功 (${(successCount/totalCount*100).toFixed(1)}%)`);
    console.log('========================================\n');
    
    // 保存结果
    const resultFile = '/home/halfthin/dev/content-publish-platform/.workspace/tests/user-profile-final-100.json';
    fs.writeFileSync(resultFile, JSON.stringify({
      successRate: `${(successCount/totalCount*100).toFixed(1)}%`,
      successCount,
      totalCount,
      results,
      verifiedAt: new Date().toISOString(),
    }, null, 2));
    
    console.log(`✅ 结果已保存：${resultFile}\n`);
    
    await browser.close();
    
    return successCount === totalCount;
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
    return false;
  }
}

main();
