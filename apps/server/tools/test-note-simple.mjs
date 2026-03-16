/**
 * 简单测试笔记详情采集
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';

async function main() {
  console.log('🧪 测试笔记详情采集（简单版）\n');
  
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
    
    // 访问有效的笔记 URL（从之前的搜索结果）
    const testUrls = [
      'https://www.xiaohongshu.com/explore/698eeae2000000000903af9a',  // XiXi 在儿的笔记（12.4 万点赞）
      'https://www.xiaohongshu.com/explore/68e35db0000000000300f350',  // 秋天的 8 套穿搭
    ];
    
    for (const noteUrl of testUrls) {
      console.log(`📖 访问：${noteUrl}`);
      await page.goto(noteUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // 检查页面是否有效
      const title = await page.$eval('h1, [class*="title"]', el => el?.textContent?.trim()).catch(() => '未找到');
      
      if (title.includes('无法浏览') || title.includes('已被删除')) {
        console.log('⚠️ 笔记无效，跳过\n');
        continue;
      }
      
      console.log('✅ 笔记有效，开始采集...\n');
      
      // 采集数据
      const noteData = await page.evaluate(() => {
        // 1. 主图
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src || img.getAttribute('data-src'))
          .filter(src => src && (src.includes('sns-img') || src.includes('xhscdn')));
        
        // 2. 标题和文案
        const title = document.querySelector('h1, [class*="title"]')?.textContent?.trim() || '未找到';
        const content = document.querySelector('[class*="content"], [class*="desc"], p')?.textContent?.trim() || '未找到';
        
        // 3. 互动数据
        const interactData = {};
        
        // 查找所有互动项
        const interactItems = document.querySelectorAll('[class*="Interaction"] .count, [class*="interaction"] .count, svg + span.count');
        
        interactItems.forEach(span => {
          const count = span.textContent?.trim();
          if (!count) return;
          
          const parent = span.parentElement;
          const grandParent = parent?.parentElement;
          const className = (parent?.className + ' ' + grandParent?.className).toLowerCase();
          
          if (className.includes('like')) {
            interactData.likeCount = count;
          } else if (className.includes('collect') || className.includes('favorite')) {
            interactData.collectCount = count;
          } else if (className.includes('comment') || className.includes('chat')) {
            interactData.commentCount = count;
          }
        });
        
        // 从 JSON 提取（备用）
        if (!interactData.likeCount || !interactData.collectCount || !interactData.commentCount) {
          const pathParts = window.location.pathname.split('/');
          const noteId = pathParts[pathParts.length - 1];
          const noteJson = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.note;
          
          if (noteJson) {
            if (!interactData.likeCount) interactData.likeCount = noteJson.interactInfo?.likedCount?.toString();
            if (!interactData.collectCount) interactData.collectCount = noteJson.interactInfo?.collectedCount?.toString();
            if (!interactData.commentCount) interactData.commentCount = noteJson.interactInfo?.commentCount?.toString();
          }
        }
        
        return {
          title,
          content,
          images,
          likeCount: interactData.likeCount || '未找到',
          collectCount: interactData.collectCount || '未找到',
          commentCount: interactData.commentCount || '未找到',
        };
      });
      
      // 输出结果
      console.log('📊 采集结果:\n');
      console.log(`✅ 标题：${noteData.title}`);
      console.log(`✅ 文案：${noteData.content.substring(0, 100)}${noteData.content.length > 100 ? '...' : ''}`);
      console.log(`✅ 主图：${noteData.images.length} 张`);
      if (noteData.images.length > 0) {
        console.log(`   ${noteData.images[0].substring(0, 80)}...`);
      }
      console.log(`✅ 点赞 (like): ${noteData.likeCount}`);
      console.log(`✅ 收藏 (collect): ${noteData.collectCount}`);
      console.log(`✅ 评论 (chat): ${noteData.commentCount}`);
      
      // 保存结果
      const result = {
        url: noteUrl,
        collectedAt: new Date().toISOString(),
        data: noteData,
      };
      
      const outputFile = `/home/halfthin/dev/content-publish-platform/.workspace/tests/note-detail-simple-${new Date().toISOString().slice(0, 19)}.json`;
      await writeFile(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n💾 结果已保存到：${outputFile}\n`);
      
      break; // 成功采集后退出
    }
    
    console.log('✅ 测试完成！\n');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
