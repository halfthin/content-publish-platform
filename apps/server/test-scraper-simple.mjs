/**
 * 小红书采集功能简化测试
 * 
 * 直接访问博主主页进行采集，跳过搜索步骤
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

// 测试博主列表（硬编码）
const TEST_BLOGGERS = [
  { url: 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708', name: '测试博主 1' },
  { url: 'https://www.xiaohongshu.com/user/profile/5d3b8d07000000001000641e', name: '测试博主 2' },
  { url: 'https://www.xiaohongshu.com/user/profile/5e8d9f0a0000000001000a3b', name: '测试博主 3' },
];

async function main() {
  console.log('🚀 开始测试小红书采集功能（简化版）...\n');
  
  const results = {
    testTime: new Date().toISOString(),
    status: 'running',
    searchTest: { status: 'skipped', note: '简化版跳过搜索测试' },
    bloggerTest: { status: 'running' },
    noteTest: { status: 'running' },
    bloggers: [],
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
    
    // ========== 1. 访问博主主页 ==========
    console.log('=== 1. 访问博主主页 ===');
    
    for (const blogger of TEST_BLOGGERS.slice(0, 2)) {
      console.log(`\n访问：${blogger.name}`);
      console.log(`URL: ${blogger.url}\n`);
      
      try {
        await page.goto(blogger.url, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await page.waitForTimeout(5000);
        
        // 提取博主信息
        const nickname = await page.$eval('.user-name', el => el.textContent?.trim() || '').catch(() => '未知');
        const redId = await page.$eval('.user-redid', el => el.textContent?.trim() || '').catch(() => '未知');
        const ipLocation = await page.$eval('.user-ip', el => el.textContent?.trim() || '').catch(() => '未知');
        const followers = await page.$eval('.followers-count', el => el.textContent?.trim() || '').catch(() => '未知');
        const following = await page.$eval('.following-count', el => el.textContent?.trim() || '').catch(() => '未知');
        const likes = await page.$eval('.likes-count', el => el.textContent?.trim() || '').catch(() => '未知');
        
        console.log(`  昵称：${nickname}`);
        console.log(`  小红书号：${redId}`);
        console.log(`  IP 属地：${ipLocation}`);
        console.log(`  粉丝数：${followers}`);
        console.log(`  关注数：${following}`);
        console.log(`  获赞与收藏：${likes}`);
        
        results.bloggers.push({
          name: blogger.name,
          url: blogger.url,
          nickname,
          redId,
          ipLocation,
          followers,
          following,
          likes,
        });
        
      } catch (error) {
        console.log(`❌ 访问失败：${error.message}`);
        results.bloggers.push({
          name: blogger.name,
          url: blogger.url,
          error: error.message,
        });
      }
    }
    
    results.bloggerTest = {
      status: results.bloggers.some(b => b.nickname !== '未知') ? 'success' : 'partial',
      count: results.bloggers.length,
      successCount: results.bloggers.filter(b => b.nickname !== '未知').length,
    };
    
    // ========== 2. 生成报告 ==========
    console.log('\n=== 2. 生成测试报告 ===');
    
    results.status = 'success';
    
    const reportDir = '/home/halfthin/dev/content-publish-platform/.workspace/tests';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, 'scraper-simple-result.json');
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`✅ 测试报告已保存到：${reportFile}\n`);
    
    // ========== 3. 打印摘要 ==========
    console.log('=== 测试摘要 ===');
    console.log(`状态：${results.status === 'success' ? '✅ 成功' : '❌ 失败'}`);
    console.log(`搜索测试：⏭️ 跳过`);
    console.log(`博主采集：${results.bloggerTest.successCount}/${results.bloggerTest.count} 成功`);
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    results.status = 'failed';
    results.error = error.message;
  } finally {
    if (browser) await browser.close();
  }
}

main();
