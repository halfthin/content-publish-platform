/**
 * 测试笔记详情采集
 * 
 * 验证能否正确获取：
 * - 主图
 * - 文案
 * - like 数
 * - collect 数
 * - chat(评论) 数
 */

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';

async function testNoteDetail() {
  console.log('🧪 测试笔记详情采集...\n');
  
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
    
    // 1. 先搜索找到有效的笔记
    console.log('🔍 搜索关键词："穿搭"');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=穿搭', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    
    // 提取笔记列表
    const notes = await page.$$eval('section.note-item', cards => {
      return cards.slice(0, 3).map(card => {
        const noteLink = card.querySelector('a[href*="/explore/"]');
        const title = card.querySelector('.title, [class*="title"]');
        const author = card.querySelector('.author .name');
        const likeCount = card.querySelector('[class*="like"] .count');
        
        return {
          url: noteLink?.href || '',
          title: title?.textContent?.trim() || '无标题',
          author: author?.textContent?.trim() || '未知',
          likeCount: likeCount?.textContent?.trim() || '0',
        };
      });
    });
    
    console.log(`✅ 找到 ${notes.length} 篇笔记:\n`);
    notes.forEach((note, i) => {
      console.log(`  ${i + 1}. ${note.title} - ${note.author} (❤️ ${note.likeCount})`);
      console.log(`     URL: ${note.url}\n`);
    });
    
    // 2. 访问第一篇笔记详情（尝试前 3 篇，找到有效的为止）
    let noteData = null;
    let noteUrl = '';
    
    for (let i = 0; i < Math.min(notes.length, 3); i++) {
      noteUrl = notes[i].url;
      console.log(`\n📖 访问笔记详情 (${i + 1}/${notes.length}):\n   ${noteUrl}\n`);
      
      await page.goto(noteUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // 检查是否有效
      const isValid = await page.evaluate(() => {
        const title = document.querySelector('h1, [class*="title"]')?.textContent?.trim() || '';
        return !title.includes('无法浏览') && !title.includes('已被删除');
      });
      
      if (isValid) {
        console.log('✅ 笔记有效，开始采集...\n');
        break;
      } else {
        console.log('⚠️ 笔记无效，尝试下一篇...\n');
        await page.waitForTimeout(1000);
      }
    }
    
    // 3. 采集笔记详情数据
    if (noteUrl) {
      console.log('📊 采集笔记详情数据...\n');
      
      await page.goto(noteUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // 3. 采集笔记详情数据
      console.log('📊 采集笔记详情数据...\n');
      
      const noteData = await page.evaluate(() => {
        try {
          // 查找笔记详情容器
          let container = document.querySelector('.note-detail-mask') || 
                         document.querySelector('[class*="note-detail"]') ||
                         document.querySelector('[class*="note-content"]') ||
                         document.body;
          
          // 1. 主图
          const images = Array.from(container.querySelectorAll('img'))
            .map(img => img.src || img.getAttribute('data-src'))
            .filter(src => src && src.includes('sns-img') || src.includes('xhscdn'));
          
          // 2. 文案（标题 + 正文）
          const title = container.querySelector('h1, [class*="title"]')?.textContent?.trim() || '未找到';
          const content = container.querySelector('[class*="content"], [class*="desc"], p')?.textContent?.trim() || '未找到';
          
          // 3. 互动数据（like, collect, chat）
          const interactData = {};
          
          // 方法 1: 通过 SVG + span.count 模式
          const interactItems = container.querySelectorAll('svg + span.count, svg ~ span.count, [class*="count"]');
          
          interactItems.forEach((span, index) => {
            const count = span.textContent?.trim();
            if (!count) return;
            
            // 查找相邻的 SVG
            let svg = span.previousElementSibling;
            while (svg && svg.tagName !== 'svg') {
              svg = svg.previousElementSibling;
            }
            
            const svgClass = svg?.className?.toString() || '';
            const parentClass = span.parentElement?.className?.toString() || '';
            const grandParentClass = span.parentElement?.parentElement?.className?.toString() || '';
            
            // 判断类型（通过 class 或位置）
            if (svgClass.includes('like') || parentClass.includes('like') || grandParentClass.includes('Like') || grandParentClass.includes('like')) {
              interactData.likeCount = count;
            } else if (svgClass.includes('collect') || svgClass.includes('favorite') || parentClass.includes('collect') || grandParentClass.includes('Collect') || grandParentClass.includes('collect')) {
              interactData.collectCount = count;
            } else if (svgClass.includes('comment') || svgClass.includes('chat') || parentClass.includes('comment') || grandParentClass.includes('Comment') || grandParentClass.includes('comment')) {
              interactData.commentCount = count;
            }
          });
          
          // 方法 2: 如果方法 1 失败，尝试从 JSON 提取
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
        } catch (error) {
          return { error: error.message };
        }
      });
      
      // 4. 输出结果
      console.log('📊 采集结果:\n');
      
      if (noteData.error) {
        console.log(`❌ 采集失败：${noteData.error}`);
      } else {
        console.log(`✅ 标题：${noteData.title}`);
        console.log(`✅ 文案：${noteData.content.substring(0, 100)}${noteData.content.length > 100 ? '...' : ''}`);
        console.log(`✅ 主图：${noteData.images.length} 张`);
        if (noteData.images.length > 0) {
          console.log(`   第一张：${noteData.images[0].substring(0, 80)}...`);
        }
        console.log(`✅ 点赞 (like): ${noteData.likeCount}`);
        console.log(`✅ 收藏 (collect): ${noteData.collectCount}`);
        console.log(`✅ 评论 (chat): ${noteData.commentCount}`);
        
        // 5. 保存结果
        const result = {
          url: noteUrl,
          collectedAt: new Date().toISOString(),
          data: noteData,
        };
        
        const { writeFile } = await import('fs/promises');
        const outputFile = '/home/halfthin/dev/content-publish-platform/.workspace/tests/note-detail-test-result.json';
        await writeFile(outputFile, JSON.stringify(result, null, 2));
        console.log(`\n💾 结果已保存到：${outputFile}`);
      }
    }
    
    console.log('\n✅ 测试完成！\n');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

testNoteDetail().catch(console.error);
