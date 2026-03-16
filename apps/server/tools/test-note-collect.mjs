/**
 * 搜索并采集有效笔记
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';

async function main() {
  console.log('🔍 搜索并采集有效笔记\n');
  
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
      await context.addCookies(cookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
        expires: c.expirationDate || -1, httpOnly: c.httpOnly || false, secure: c.secure || false,
      })));
      console.log('✅ Cookie 加载成功\n');
    }
    
    // 搜索
    console.log('🔍 搜索关键词："穿搭"');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=穿搭', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    
    // 提取笔记列表
    const notes = await page.$$eval('section.note-item', cards => {
      return cards.slice(0, 5).map(card => {
        const noteLink = card.querySelector('a[href*="/explore/"]');
        const title = card.querySelector('.title, [class*="title"]');
        const likeCount = card.querySelector('[class*="like"] .count');
        
        return {
          url: noteLink?.href || '',
          title: title?.textContent?.trim() || '无标题',
          likeCount: likeCount?.textContent?.trim() || '0',
        };
      });
    });
    
    console.log(`✅ 找到 ${notes.length} 篇笔记:\n`);
    notes.forEach((note, i) => {
      console.log(`  ${i + 1}. ${note.title} (❤️ ${note.likeCount})`);
    });
    
    // 尝试访问每篇笔记，找到有效的
    let collectedData = null;
    
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      console.log(`\n📖 尝试访问笔记 ${i + 1}/${notes.length}: ${note.title}`);
      
      await page.goto(note.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // 检查是否有效
      const isValid = await page.evaluate(() => {
        const title = document.querySelector('h1, [class*="title"]')?.textContent?.trim() || '';
        return !title.includes('无法浏览') && !title.includes('已被删除') && title !== '未找到';
      });
      
      if (!isValid) {
        console.log('⚠️ 笔记无效，跳过');
        continue;
      }
      
      console.log('✅ 笔记有效，采集数据...\n');
      
      // 采集数据
      collectedData = await page.evaluate((noteUrl) => {
        // 1. 主图
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src || img.getAttribute('data-src'))
          .filter(src => src && (src.includes('sns-img') || src.includes('xhscdn')));
        
        // 2. 标题和文案
        const title = document.querySelector('h1, [class*="title"]')?.textContent?.trim() || '未找到';
        const content = document.querySelector('[class*="content"], [class*="desc"]')?.textContent?.trim() || '未找到';
        
        // 3. 互动数据
        const interactData = {};
        
        // 查找互动区域
        const interactArea = document.querySelector('[class*="Interaction"]') || 
                            document.querySelector('[class*="interaction"]');
        
        if (interactArea) {
          const buttons = interactArea.querySelectorAll('button, [class*="button"]');
          
          buttons.forEach(btn => {
            const count = btn.querySelector('.count, [class*="count"]')?.textContent?.trim();
            if (!count) return;
            
            const className = btn.className?.toLowerCase() || '';
            const text = btn.textContent?.toLowerCase() || '';
            
            if (className.includes('like') || text.includes('点赞') || text.includes('like')) {
              interactData.likeCount = count;
            } else if (className.includes('collect') || className.includes('favorite') || text.includes('收藏') || text.includes('collect')) {
              interactData.collectCount = count;
            } else if (className.includes('comment') || text.includes('评论') || text.includes('chat')) {
              interactData.commentCount = count;
            }
          });
        }
        
        // 从 JSON 提取（备用）
        const pathParts = noteUrl.split('/');
        const noteId = pathParts[pathParts.length - 1];
        const noteJson = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.note;
        
        if (noteJson && noteJson.interactInfo) {
          if (!interactData.likeCount) interactData.likeCount = noteJson.interactInfo.likedCount?.toString();
          if (!interactData.collectCount) interactData.collectCount = noteJson.interactInfo.collectedCount?.toString();
          if (!interactData.commentCount) interactData.commentCount = noteJson.interactInfo.commentCount?.toString();
        }
        
        return {
          url: noteUrl,
          title,
          content,
          images,
          likeCount: interactData.likeCount || '未找到',
          collectCount: interactData.collectCount || '未找到',
          commentCount: interactData.commentCount || '未找到',
        };
      }, note.url);
      
      break; // 成功采集后退出
    }
    
    if (collectedData) {
      // 输出结果
      console.log('\n📊 采集结果:\n');
      console.log(`✅ 标题：${collectedData.title}`);
      console.log(`✅ 文案：${collectedData.content.substring(0, 100)}${collectedData.content.length > 100 ? '...' : ''}`);
      console.log(`✅ 主图：${collectedData.images.length} 张`);
      if (collectedData.images.length > 0) {
        console.log(`   ${collectedData.images[0].substring(0, 80)}...`);
      }
      console.log(`✅ 点赞 (like): ${collectedData.likeCount}`);
      console.log(`✅ 收藏 (collect): ${collectedData.collectCount}`);
      console.log(`✅ 评论 (chat): ${collectedData.commentCount}`);
      
      // 保存结果
      const outputFile = `/home/halfthin/dev/content-publish-platform/.workspace/tests/note-collected-${new Date().toISOString().slice(0, 19)}.json`;
      await writeFile(outputFile, JSON.stringify(collectedData, null, 2));
      console.log(`\n💾 结果已保存到：${outputFile}`);
    } else {
      console.log('\n❌ 未找到有效的笔记');
    }
    
    console.log('\n✅ 测试完成！\n');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
