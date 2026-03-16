/**
 * 小红书博主信息采集功能测试
 * 
 * 任务：调试搜索功能 + 验证采集流程
 * 优先级：高
 * 截止：2026-03-07 18:00
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

// 选择器配置 (基于实际页面结构验证)
const SELECTORS = {
  card: '.note-item',
  title: '.title span',
  author: {
    name: '.author .name',
    time: '.author .time',
    avatar: '.author .author-avatar',
  },
  like: '.like-wrapper .count',
  cover: '.cover img',
};

async function main() {
  console.log('🧪 小红书博主信息采集功能测试\n');
  console.log('任务：调试搜索功能 + 验证采集流程');
  console.log('优先级：高 | 截止：2026-03-07 18:00\n');
  
  let browser;
  try {
    // 1. 启动浏览器
    console.log('=== 1. 启动浏览器 ===');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('✅ 浏览器启动成功\n');
    
    // 2. 设置 Cookie
    console.log('=== 2. 设置 Cookie ===');
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    console.log('✅ Cookie 已设置\n');
    
    const page = await context.newPage();
    
    // 3. 访问搜索页面
    console.log('=== 3. 访问搜索页面 ===');
    const keyword = '通勤穿搭';
    const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
    console.log(`搜索关键词：${keyword}`);
    
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ 页面加载成功\n');
    
    await page.waitForTimeout(10000);
    
    // 4. 检查登录状态
    console.log('=== 4. 检查登录状态 ===');
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img, [class*="user"] img');
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '⚠️ 未检测到登录状态\n');
    
    // 5. 查找博主卡片
    console.log('=== 5. 查找博主卡片 ===');
    const cards = await page.$$(SELECTORS.card);
    console.log(`📊 找到 ${cards.length} 个博主卡片\n`);
    
    if (cards.length === 0) {
      console.log('❌ 未找到博主卡片，测试失败\n');
      await browser.close();
      return;
    }
    
    // 6. 采集博主信息
    console.log('=== 6. 采集博主信息 ===\n');
    
    const bloggers = [];
    for (let i = 0; i < Math.min(10, cards.length); i++) {
      const card = cards[i];
      
      try {
        // 提取标题
        const titleEl = await card.$(SELECTORS.title);
        const title = titleEl ? await titleEl.textContent() : '';
        
        // 提取作者名
        const nameEl = await card.$(SELECTORS.author.name);
        const author = nameEl ? await nameEl.textContent() : '';
        
        // 提取发布时间
        const timeEl = await card.$(SELECTORS.author.time);
        const time = timeEl ? await timeEl.textContent() : '';
        
        // 提取点赞数
        const likeEl = await card.$(SELECTORS.like);
        const likes = likeEl ? await likeEl.textContent() : '';
        
        // 提取封面图
        const coverEl = await card.$(SELECTORS.cover);
        const cover = coverEl ? await coverEl.getAttribute('src') : '';
        
        const blogger = {
          index: i + 1,
          title: title?.trim() || '未知',
          author: author?.trim() || '未知',
          time: time?.trim() || '未知',
          likes: likes?.trim() || '0',
          cover: cover || '',
        };
        
        bloggers.push(blogger);
        
        console.log(`--- 博主 ${i + 1} ---`);
        console.log(`标题：${blogger.title}`);
        console.log(`作者：${blogger.author}`);
        console.log(`时间：${blogger.time}`);
        console.log(`点赞：${blogger.likes}`);
        console.log('');
        
      } catch (error) {
        console.log(`❌ 博主 ${i + 1} 采集失败：${error.message}\n`);
      }
    }
    
    // 7. 保存采集结果
    console.log('=== 7. 保存采集结果 ===');
    
    const outputDir = '/home/halfthin/dev/content-publish-platform/.workspace/output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 保存 JSON 格式
    const jsonFile = path.join(outputDir, 'bloggers-collection.json');
    fs.writeFileSync(jsonFile, JSON.stringify(bloggers, null, 2));
    console.log(`✅ JSON 已保存：${jsonFile}\n`);
    
    // 保存 Markdown 格式
    const mdFile = path.join(outputDir, 'bloggers-collection.md');
    let mdContent = '# 小红书博主信息采集结果\n\n';
    mdContent += `**采集时间**: ${new Date().toISOString()}\n`;
    mdContent += `**搜索关键词**: ${keyword}\n`;
    mdContent += `**采集数量**: ${bloggers.length}\n\n`;
    mdContent += '---\n\n';
    
    bloggers.forEach((b, i) => {
      mdContent += `## ${i + 1}. ${b.title}\n\n`;
      mdContent += `- **作者**: ${b.author}\n`;
      mdContent += `- **发布时间**: ${b.time}\n`;
      mdContent += `- **点赞数**: ${b.likes}\n`;
      mdContent += `- **封面图**: ${b.cover ? '✅' : '❌'}\n\n`;
      mdContent += '---\n\n';
    });
    
    fs.writeFileSync(mdFile, mdContent);
    console.log(`✅ Markdown 已保存：${mdFile}\n`);
    
    // 8. 生成测试报告
    console.log('=== 8. 生成测试报告 ===\n');
    
    const successCount = bloggers.filter(b => b.title !== '未知' && b.author !== '未知').length;
    const successRate = ((successCount / bloggers.length) * 100).toFixed(1);
    
    console.log('📊 采集统计:');
    console.log(`  - 总卡片数：${cards.length}`);
    console.log(`  - 成功采集：${successCount}`);
    console.log(`  - 失败采集：${bloggers.length - successCount}`);
    console.log(`  - 成功率：${successRate}%\n`);
    
    console.log('✅ 测试通过！\n');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    
    if (browser) await browser.close();
  }
}

main();
