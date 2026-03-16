/**
 * 小红书采集功能测试脚本（手动登录版本）
 * 
 * 使用方法:
 * bun test-xiaohongshu-scraper-manual.mjs
 * 
 * 流程:
 * 1. 打开浏览器
 * 2. 人工扫码登录（等待 30 秒）
 * 3. 自动执行采集
 */

import { XiaohongshuScraper } from './src/services/xiaohongshu-scraper.service.js';
import { writeFile } from 'fs/promises';

async function main() {
  console.log('🚀 开始测试小红书采集功能（手动登录版本）...\n');

  const scraper = new XiaohongshuScraper({
    accountId: 'test-account',
    headless: false, // 显示浏览器，用于手动登录
    timeout: 90000,
    maxBloggers: 3,  // 采集前 3 个博主
    maxNotes: 3,     // 每个博主采集前 3 篇笔记
  });

  try {
    // 1. 初始化浏览器
    console.log('📦 初始化浏览器...');
    await scraper.initialize();
    console.log('✅ 浏览器初始化完成\n');

    // 2. 打开小红书首页，等待手动登录
    console.log('🔐 请在浏览器中扫码登录小红书...');
    console.log('⏳ 等待 30 秒...\n');
    
    if (scraper.page) {
      await scraper.page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      
      // 等待 30 秒让用户登录
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    console.log('✅ 登录完成，开始采集...\n');

    // 3. 执行采集
    const keyword = '穿搭';
    console.log(`🔍 搜索关键词："${keyword}"`);
    console.log('📋 采集目标：前 3 个博主，每个博主前 3 篇笔记');
    console.log('⏳ 预计耗时：2-3 分钟\n');
    
    const result = await scraper.scrape(keyword);

    // 4. 输出结果
    console.log('\n📊 采集结果：\n');
    console.log(`搜索关键词：${result.keyword}`);
    console.log(`博主数量：${result.bloggers.length}`);
    console.log(`笔记数量：${result.notes.length}\n`);

    // 5. 输出博主信息
    console.log('👥 博主信息：');
    result.bloggers.forEach((blogger, index) => {
      console.log(`\n${index + 1}. ${blogger.nickname}`);
      console.log(`   小红书号：${blogger.userId || '未获取'}`);
      console.log(`   粉丝数：${blogger.fansCount || '未获取'}`);
      console.log(`   关注数：${blogger.followCount || '未获取'}`);
      console.log(`   获赞：${blogger.likesCount || '未获取'}`);
      console.log(`   IP 属地：${blogger.ipLocation || '未获取'}`);
      console.log(`   主页：${blogger.profileUrl}`);
    });

    // 6. 输出笔记信息
    console.log('\n📝 笔记信息：');
    result.notes.forEach((note, index) => {
      console.log(`\n${index + 1}. ${note.title}`);
      console.log(`   作者：${note.authorName}`);
      console.log(`   点赞：${note.likeCount || '0'}`);
      console.log(`   收藏：${note.collectCount || '0'}`);
      console.log(`   评论：${note.commentCount || '0'}`);
      console.log(`   图片：${note.images.length} 张`);
      console.log(`   链接：${note.noteUrl}`);
    });

    // 7. 保存结果到文件
    const outputFile = `.workspace/tests/scraper-test-result-manual-${new Date().toISOString().slice(0, 19)}.json`;
    await writeFile(outputFile, JSON.stringify(result, null, 2));
    console.log(`\n💾 结果已保存到：${outputFile}`);

    console.log('\n✅ 测试完成！\n');
  } catch (error) {
    console.error('\n❌ 测试失败：', error);
    process.exit(1);
  } finally {
    // 关闭浏览器
    console.log('🔒 关闭浏览器...');
    await scraper.close();
    console.log('✅ 浏览器已关闭\n');
  }
}

// 运行测试
main().catch(console.error);
