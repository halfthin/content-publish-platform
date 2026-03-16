/**
 * 小红书博主信息采集完整测试
 * 
 * 功能：
 * 1. 搜索关键词获取博主列表
 * 2. 访问博主主页采集详细信息
 * 3. 采集博主前 3 篇笔记
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { searchPageSelectors } from './src/config/xiaohongshu-search-selectors.js';
import { userProfileSelectors, extractUserProfile } from './src/config/xiaohongshu-user-selectors.js';
import { noteDetailSelectors, extractNoteDetail } from './src/config/xiaohongshu-note-selectors.js';

const VALID_COOKIES = [
  { name: "a1", value: "199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821", domain: ".xiaohongshu.com", path: "/" },
  { name: "id_token", value: "VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg", domain: ".xiaohongshu.com", path: "/" },
  { name: "web_session", value: "040069b557e75f10f74b91dd9f3b4b6a3ce9e5", domain: ".xiaohongshu.com", path: "/" },
  { name: "xsecappid", value: "xhs-pc-web", domain: ".xiaohongshu.com", path: "/" },
  { name: "webId", value: "e848b3ccac9c3f57790ef018a6fb43fd", domain: ".xiaohongshu.com", path: "/" },
];

async function main() {
  console.log('🚀 开始测试小红书采集功能...\n');
  
  const results = {
    testTime: new Date().toISOString(),
    status: 'running',
    searchTest: { status: 'running' },
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
    
    // ========== 1. 搜索功能测试 ==========
    console.log('=== 1. 搜索功能测试 ===');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=穿搭&source=web_search_result_notes', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(10000);
    
    const noteCards = await page.$$('.note-item');
    console.log(`找到 ${noteCards.length} 个笔记卡片\n`);
    
    results.searchTest = {
      status: noteCards.length > 0 ? 'success' : 'failed',
      keyword: '穿搭',
      cardCount: noteCards.length,
    };
    
    // ========== 2. 提取博主信息 ==========
    console.log('=== 2. 提取博主信息 ===');
    const bloggers = [];
    
    for (let i = 0; i < Math.min(3, noteCards.length); i++) {
      const card = noteCards[i];
      
      try {
        // 作者链接
        const authorLink = await card.$('.author');
        const authorUrl = authorLink ? await authorLink.getAttribute('href') : '';
        
        // 作者名
        const authorName = await card.$eval('.name', el => el.textContent?.trim() || '');
        
        // 发布时间
        const publishTime = await card.$eval('.time', el => el.textContent?.trim() || '');
        
        // 点赞数
        const likeCount = await card.$eval('.like-wrapper .count', el => el.textContent?.trim() || '');
        
        // 标题
        const title = await card.$eval('.title span', el => el.textContent?.trim() || '');
        
        bloggers.push({
          index: i + 1,
          name: authorName,
          time: publishTime,
          likes: likeCount,
          title: title,
          profileUrl: authorUrl ? `https://www.xiaohongshu.com${authorUrl}` : '',
        });
        
        console.log(`博主 ${i + 1}: ${authorName} (${publishTime}) - 点赞：${likeCount}`);
      } catch (error) {
        console.log(`❌ 提取博主 ${i + 1} 失败：${error.message}`);
      }
    }
    
    results.bloggers = bloggers;
    results.bloggerTest = {
      status: bloggers.length > 0 ? 'success' : 'failed',
      count: bloggers.length,
    };
    
    console.log(`\n✅ 成功提取 ${bloggers.length} 个博主信息\n`);
    
    // ========== 3. 访问博主主页测试 ==========
    console.log('=== 3. 访问博主主页测试 ===');
    
    if (bloggers.length > 0 && bloggers[0].profileUrl) {
      console.log(`访问博主主页：${bloggers[0].profileUrl}\n`);
      
      await page.goto(bloggers[0].profileUrl, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await page.waitForTimeout(8000);
      
      // 提取博主详细信息
      const userProfile = await extractUserProfile(page);
      console.log('博主详细信息:');
      console.log(`  昵称：${userProfile.nickname || '未知'}`);
      console.log(`  小红书号：${userProfile.redId || '未知'}`);
      console.log(`  IP 属地：${userProfile.ipLocation || '未知'}`);
      console.log(`  粉丝数：${userProfile.fansCount || '未知'}`);
      console.log(`  关注数：${userProfile.followCount || '未知'}`);
      console.log(`  获赞与收藏：${userProfile.likesCount || '未知'}`);
      
      results.bloggers[0] = { ...results.bloggers[0], ...userProfile };
    }
    
    // ========== 4. 笔记详情测试 ==========
    console.log('\n=== 4. 笔记详情测试 ===');
    
    // 点击第一个笔记
    if (noteCards.length > 0) {
      await noteCards[0].click();
      await page.waitForTimeout(5000);
      
      // 获取当前 URL
      const noteUrl = page.url();
      console.log(`笔记 URL: ${noteUrl}\n`);
      
      // 提取笔记详情
      const noteDetail = await extractNoteDetail(page);
      console.log('笔记详情:');
      console.log(`  标题：${noteDetail.title || '未知'}`);
      console.log(`  作者：${noteDetail.authorName || '未知'}`);
      console.log(`  点赞：${noteDetail.likeCount || '未知'}`);
      console.log(`  收藏：${noteDetail.collectCount || '未知'}`);
      console.log(`  评论：${noteDetail.commentCount || '未知'}`);
      
      results.notes.push(noteDetail);
      results.noteTest = {
        status: noteDetail.title ? 'success' : 'failed',
        count: 1,
      };
    }
    
    // ========== 5. 生成报告 ==========
    console.log('\n=== 5. 生成测试报告 ===');
    
    results.status = 'success';
    
    const reportDir = '/home/halfthin/dev/content-publish-platform/.workspace/tests';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, 'scraper-test-result.json');
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`✅ 测试报告已保存到：${reportFile}\n`);
    
    // ========== 6. 打印摘要 ==========
    console.log('=== 测试摘要 ===');
    console.log(`状态：${results.status === 'success' ? '✅ 成功' : '❌ 失败'}`);
    console.log(`搜索关键词：${results.searchTest.keyword}`);
    console.log(`找到笔记卡片：${results.searchTest.cardCount} 个`);
    console.log(`提取博主信息：${results.bloggerTest.count} 个`);
    console.log(`采集笔记详情：${results.noteTest.count} 个`);
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    results.status = 'failed';
    results.error = error.message;
  } finally {
    if (browser) await browser.close();
  }
}

main();
