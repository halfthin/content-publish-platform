/**
 * 小红书博主信息采集 - 简化版（直接访问博主主页）
 * 
 * 使用方法:
 * bun test-xiaohongshu-simple.mjs
 * 
 * 流程:
 * 1. 加载 Cookie
 * 2. 访问博主主页列表
 * 3. 采集博主信息
 * 4. 采集博主的前 3 篇笔记
 */

import { XiaohongshuScraper } from './src/services/xiaohongshu-scraper.service.js';
import { writeFile } from 'fs/promises';
import { initializeBrowser } from './src/config/playwright.js';

// 博主主页 URL 列表（示例，可以替换成实际的博主）
const BLOGGER_URLS = [
  'https://www.xiaohongshu.com/user/profile/5d3b8d07000000001000641e',  // 示例博主 1
  'https://www.xiaohongshu.com/user/profile/5e8d9f0a0000000001000a3b',  // 示例博主 2
  'https://www.xiaohongshu.com/user/profile/5f2c1e0b0000000001000c7d',  // 示例博主 3
];

async function main() {
  console.log('🚀 开始采集博主信息（简化版）...\n');

  await initializeBrowser({ headless: false });

  const scraper = new XiaohongshuScraper({
    accountId: 'test-account',
    headless: false,
    timeout: 90000,
    maxBloggers: 3,
    maxNotes: 3,
  });

  const results = {
    bloggers: [],
    notes: [],
    collectedAt: new Date().toISOString(),
  };

  try {
    // 1. 初始化
    console.log('📦 初始化浏览器...');
    await scraper.initialize();
    console.log('✅ 浏览器初始化完成\n');

    // 2. 加载 Cookie
    console.log('🍪 加载 Cookie...');
    const cookieLoaded = await scraper.loadCookies();
    if (!cookieLoaded) {
      console.log('❌ Cookie 加载失败，请检查配置文件');
      process.exit(1);
    }
    console.log('✅ Cookie 加载成功\n');

    // 3. 遍历博主主页
    for (let i = 0; i < Math.min(BLOGGER_URLS.length, 3); i++) {
      const url = BLOGGER_URLS[i];
      console.log(`\n👤 采集博主 ${i + 1}/3: ${url}`);
      
      try {
        // 访问博主主页
        if (scraper.page) {
          await scraper.page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000,
          });
          
          // 等待主页加载
          await scraper.page.waitForTimeout(3000);
          
          // 采集博主信息
          console.log('📊 采集博主信息...');
          const profile = await scraper.collectBloggerProfile();
          console.log(`✅ 博主：${profile.nickname}`);
          console.log(`   小红书号：${profile.userId}`);
          console.log(`   粉丝：${profile.fansCount}`);
          console.log(`   关注：${profile.followCount}`);
          console.log(`   获赞：${profile.likesCount}`);
          
          results.bloggers.push(profile);
          
          // 采集笔记
          console.log('\n📝 采集笔记...');
          const notes = await scraper.collectBloggerNotes(3);
          console.log(`✅ 采集 ${notes.length} 篇笔记`);
          
          notes.forEach((note, idx) => {
            console.log(`   ${idx + 1}. ${note.title}`);
            console.log(`      点赞：${note.likeCount}, 收藏：${note.collectCount}, 评论：${note.commentCount}`);
          });
          
          results.notes.push(...notes);
          
          // 等待一下，避免请求过快
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ 采集博主 ${i + 1} 失败:`, error.message);
      }
    }

    // 4. 输出汇总
    console.log('\n' + '='.repeat(60));
    console.log('📊 采集汇总');
    console.log('='.repeat(60));
    console.log(`博主数量：${results.bloggers.length}`);
    console.log(`笔记数量：${results.notes.length}`);
    
    console.log('\n👥 博主列表:');
    results.bloggers.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.nickname} (${b.fansCount || '未知'} 粉丝)`);
    });
    
    console.log('\n📝 笔记列表:');
    results.notes.forEach((note, i) => {
      console.log(`  ${i + 1}. ${note.title} - ${note.authorName}`);
      console.log(`     ❤️ ${note.likeCount} ⭐ ${note.collectCount} 💬 ${note.commentCount}`);
    });

    // 5. 保存结果
    const outputFile = `/home/halfthin/dev/content-publish-platform/.workspace/tests/blogger-collection-${new Date().toISOString().slice(0, 19)}.json`;
    await writeFile(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 结果已保存到：${outputFile}`);

    console.log('\n✅ 采集完成！\n');
  } catch (error) {
    console.error('\n❌ 采集失败:', error);
    process.exit(1);
  } finally {
    console.log('🔒 关闭浏览器...');
    await scraper.close();
    console.log('✅ 浏览器已关闭\n');
  }
}

main().catch(console.error);
