/**
 * 测试采集并保存结果
 * 
 * 运行后会在 .workspace/tests/ 目录保存采集数据
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';

async function main() {
  console.log('🚀 开始采集测试数据...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 加载 Cookie
    const cookiePath = '/home/halfthin/dev/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
    const cookieContent = await readFile(cookiePath, 'utf-8');
    const match = cookieContent.match(/export const XIAOHONGSHU_COOKIES = (\[.*?\]);/s);
    if (match) {
      const cookiesJson = match[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
      const cookies = JSON.parse(cookiesJson);
      const playwrightCookies = cookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
        expires: c.expirationDate || -1, httpOnly: c.httpOnly || false, secure: c.secure || false,
      }));
      await context.addCookies(playwrightCookies);
      console.log('✅ Cookie 加载成功\n');
    }
    
    // 1. 采集博主主页
    console.log('👤 采集博主主页...');
    const userProfileUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
    await page.goto(userProfileUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    const userProfileData = {
      url: userProfileUrl,
      collectedAt: new Date().toISOString(),
      data: await page.evaluate(() => {
        try {
          // DOM 提取
          const nickname = document.querySelector('.user-nickname')?.textContent?.trim() || '未找到';
          const counts = document.querySelectorAll('.user-interactions .count');
          const followCount = counts[0]?.textContent?.trim() || '未找到';
          const fansCount = counts[1]?.textContent?.trim() || '未找到';
          const likesCount = counts[2]?.textContent?.trim() || '未找到';
          
          // JSON 提取
          const state = window.__INITIAL_STATE__?.user?.userPageData?.basicInfo;
          
          return {
            nickname,
            userId: state?.redId || '未找到',
            ipLocation: state?.ipLocation || '未找到',
            followCount,
            fansCount,
            likesCount,
          };
        } catch (error) {
          return { error: error.message };
        }
      }),
    };
    
    console.log('✅ 博主主页采集完成');
    console.log(`   昵称：${userProfileData.data.nickname}`);
    console.log(`   小红书号：${userProfileData.data.userId}`);
    console.log(`   IP 属地：${userProfileData.data.ipLocation}`);
    console.log(`   粉丝：${userProfileData.data.fansCount}`);
    
    // 2. 采集笔记列表
    console.log('\n📝 采集笔记列表...');
    const notes = await page.$$eval('.note-item', cards => {
      return cards.slice(0, 3).map(card => {
        const titleEl = card.querySelector('.note-title');
        const linkEl = card.querySelector('a[href*="/explore/"]');
        const likeEl = card.querySelector('[class*="like"] .count');
        return {
          title: titleEl?.textContent?.trim() || '无标题',
          link: linkEl?.getAttribute('href') || '',
          likeCount: likeEl?.textContent?.trim() || '0',
        };
      });
    });
    
    userProfileData.notes = notes;
    console.log(`✅ 采集 ${notes.length} 篇笔记`);
    
    // 3. 保存博主数据
    const userProfileFile = '/home/halfthin/dev/content-publish-platform/.workspace/tests/user-profile-data.json';
    await writeFile(userProfileFile, JSON.stringify(userProfileData, null, 2));
    console.log(`💾 博主数据已保存到：${userProfileFile}\n`);
    
    // 4. 采集博文详情（从笔记列表中选一个）
    if (notes.length > 0 && notes[0].link) {
      const noteUrl = `https://www.xiaohongshu.com${notes[0].link}`;
      console.log('📝 采集博文详情...');
      console.log(`   URL: ${noteUrl}`);
      
      await page.goto(noteUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      const noteDetailData = {
        url: noteUrl,
        collectedAt: new Date().toISOString(),
        data: await page.evaluate(() => {
          try {
            // DOM 提取
            const title = document.querySelector('[class*="title"]')?.textContent?.trim() || '未找到';
            const content = document.querySelector('[class*="content"]')?.textContent?.trim() || '未找到';
            const images = document.querySelectorAll('[class*="image"] img');
            const imageUrls = Array.from(images).map(img => img.getAttribute('src')).filter(Boolean);
            const likeCount = document.querySelector('[class*="like"] .count')?.textContent?.trim() || '未找到';
            
            // JSON 提取
            const pathParts = window.location.pathname.split('/');
            const noteId = pathParts[pathParts.length - 1];
            const noteData = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.note;
            
            return {
              title,
              content,
              images: imageUrls,
              likeCount,
              collectCount: noteData?.interactInfo?.collectedCount || '未找到',
              commentCount: noteData?.interactInfo?.commentCount || '未找到',
            };
          } catch (error) {
            return { error: error.message };
          }
        }),
      };
      
      console.log('✅ 博文详情采集完成');
      console.log(`   标题：${noteDetailData.data.title}`);
      console.log(`   点赞：${noteDetailData.data.likeCount}`);
      console.log(`   收藏：${noteDetailData.data.collectCount}`);
      console.log(`   评论：${noteDetailData.data.commentCount}`);
      console.log(`   图片：${noteDetailData.data.images.length} 张`);
      
      // 保存博文数据
      const noteDetailFile = '/home/halfthin/dev/content-publish-platform/.workspace/tests/note-detail-data.json';
      await writeFile(noteDetailFile, JSON.stringify(noteDetailData, null, 2));
      console.log(`💾 博文数据已保存到：${noteDetailFile}`);
    }
    
    console.log('\n✅ 所有数据采集完成！\n');
    console.log('📁 查看方式:');
    console.log(`   1. 博主数据：${userProfileFile}`);
    if (notes.length > 0 && notes[0].link) {
      console.log(`   2. 博文数据：/home/halfthin/dev/content-publish-platform/.workspace/tests/note-detail-data.json`);
    }
    console.log('\n📊 使用以下命令查看:');
    console.log('   cat .workspace/tests/user-profile-data.json');
    console.log('   cat .workspace/tests/note-detail-data.json');
    
  } catch (error) {
    console.error('❌ 采集失败:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
