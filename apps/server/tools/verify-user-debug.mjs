/**
 * 验证博主主页选择器（调试版）
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
  console.log('🔍 验证博主主页选择器（调试版）...\n');
  
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
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000);
    
    // 检查页面标题
    const title = await page.title();
    console.log(`页面标题：${title}\n`);
    
    // 检查是否登录
    const isLogged = await page.evaluate(() => !!window.__INITIAL_STATE__);
    console.log(`登录状态：${isLogged ? '已登录' : '未登录'}\n`);
    
    // 获取用户数据
    const userData = await page.evaluate(() => {
      if (!window.__INITIAL_STATE__) return null;
      return window.__INITIAL_STATE__.user?.userPageData;
    });
    
    if (userData) {
      console.log('✅ 获取到用户数据:');
      console.log(`  昵称：${userData.basicInfo?.nickname}`);
      console.log(`  小红书号：${userData.basicInfo?.redId}`);
      console.log(`  IP 属地：${userData.basicInfo?.ipLocation}`);
      console.log(`  互动数据：${JSON.stringify(userData.interactions)}`);
    } else {
      console.log('❌ 未获取到用户数据');
      
      // 尝试从 HTML 中提取
      const html = await page.content();
      const redIdMatch = html.match(/"redId":"(\d+)"/);
      const ipMatch = html.match(/"ipLocation":"([^"]+)"/);
      const nicknameMatch = html.match(/"nickname":"([^"]+)"/);
      
      if (redIdMatch) console.log(`  小红书号 (HTML): ${redIdMatch[1]}`);
      if (ipMatch) console.log(`  IP 属地 (HTML): ${ipMatch[1]}`);
      if (nicknameMatch) console.log(`  昵称 (HTML): ${nicknameMatch[1]}`);
    }
    
    // 检查 DOM 元素
    const domCheck = await page.evaluate(() => {
      const checks = {
        'user-interactions': document.querySelector('.user-interactions') ? '找到' : '未找到',
        'user-nickname': document.querySelector('.user-nickname') ? '找到' : '未找到',
        'nickname': document.querySelector('.nickname') ? '找到' : '未找到',
        'count': document.querySelectorAll('.count').length,
      };
      return checks;
    });
    
    console.log('\nDOM 元素检查:');
    for (const [key, value] of Object.entries(domCheck)) {
      console.log(`  ${key}: ${value}`);
    }
    
    // 保存 HTML
    const html = await page.content();
    fs.writeFileSync('/home/halfthin/dev/content-publish-platform/.workspace/debug/user-profile-verify.html', html);
    console.log('\n✅ HTML 已保存\n');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (browser) await browser.close();
  }
}

main();
