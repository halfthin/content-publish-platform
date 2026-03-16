/**
 * 小红书博主主页选择器验证测试 - 修复验证版
 * 
 * 使用 HT-Fish 修复后的选择器配置 (v1.3.0)
 * 运行：bun test-user-profile-verify.mjs
 */

import { chromium } from 'playwright';
import { xiaohongshuSelectors } from './src/config/xiaohongshu-selectors.js';

// 2026-03-07 09:36 提供的最新 Cookie
const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

async function findElementInCard(card, selectors) {
  for (const selector of selectors) {
    try {
      const el = await card.$(selector);
      if (el) return el;
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function main() {
  console.log('🧪 开始小红书博主主页选择器验证测试 (修复版)...\n');
  
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
    
    // 访问博主主页（示例）
    const targetUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
    console.log(`=== 访问博主主页 ===`);
    console.log(`URL: ${targetUrl}\n`);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    console.log('✅ 页面加载成功\n');
    
    // 检查登录状态
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态\n');
    
    // 抓取博主信息
    console.log('=== 抓取博主信息 ===\n');
    
    // 尝试多个选择器
    const selectors = xiaohongshuSelectors.userProfile || {
      nickname: xiaohongshuSelectors.search.authorName,
      userId: xiaohongshuSelectors.search.authorId,
      fansCount: xiaohongshuSelectors.search.fanCount,
    };
    
    // 昵称
    const nameEl = await page.$(selectors.nickname[0]);
    const name = nameEl ? await nameEl.textContent() : '未知';
    console.log(`昵称：${name}`);
    
    // 粉丝数
    const fansEl = await page.$(selectors.fansCount[0]);
    const followers = fansEl ? await fansEl.textContent() : '未知';
    console.log(`粉丝数：${followers}`);
    
    // 关注数
    const followEl = await page.$(selectors.followCount?.[0] ?? '.follow-count, .follow');
    const follow = followEl ? await followEl.textContent() : '未知';
    console.log(`关注数：${follow}`);
    
    // 获赞数
    const likeEl = await page.$(selectors.likesCount?.[0] ?? '.likes-count, .like');
    const likes = likeEl ? await likeEl.textContent() : '未知';
    console.log(`获赞数：${likes}`);
    
    // 生成报告
    console.log('\n=== 选择器验证报告 (用户主页) ===\n');
    console.log('## 🧪 小红书博主主页选择器验证报告\n');
    console.log('### 测试结果');
    console.log('- 浏览器：✅ 启动成功');
    console.log('- 页面访问：✅ 成功');
    console.log(`- 目标主页: ${targetUrl}\n`);
    console.log('### 数据提取');
    console.log(`- 昵称 (.user-nickname): ${name}`);
    console.log(`- 粉丝数 ([class*='fan']): ${followers}`);
    console.log(`- 关注数 (.follow-count): ${follow}`);
    console.log(`- 获赞数 (.likes-count): ${likes}`);
    console.log('\n### 选择器验证');
    const nicknameOk = name !== '未知';
    const fansOk = followers !== '未知';
    console.log(`- 昵称选择器: ${nicknameOk ? '✅ 成功' : '❌ 失败'}`);
    console.log(`- 粉丝数选择器: ${fansOk ? '✅ 成功' : '❌ 失败'}`);
    console.log('\n### 总结');
    const allPassed = nicknameOk && fansOk;
    console.log(`选择器验证：${allPassed ? '✅ 通过' : '⚠️ 部分通过'}`);
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

main();
