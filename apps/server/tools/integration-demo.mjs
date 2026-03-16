/**
 * 使用选择器配置采集数据
 * 
 * 演示如何在 content-publish-platform 中正确使用 selector.conf.json
 */

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { SelectorConfigLoader } from '../src/utils/selector-config-loader.js';

/**
 * 随机延迟（模拟真人操作）
 */
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`⏳ 等待 ${delay}ms (模拟真人操作)...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 采集博主主页信息
 */
async function collectUserProfile(page, configLoader) {
  console.log('\n👤 采集博主主页信息...\n');
  
  const selectors = configLoader.getSelectors('userProfile');
  
  // 1. 通过文本定位查找"小红书号："
  const userData = await page.evaluate(() => {
    // 查找包含"小红书号："的文本节点
    const textNodes = document.evaluate(
      "//text()[contains(., '小红书号：')]",
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    
    if (textNodes.snapshotLength === 0) {
      return { error: '未找到"小红书号："文本' };
    }
    
    const userIdElement = textNodes.snapshotItem(0).parentElement;
    
    // 向上查找博主信息容器
    let current = userIdElement;
    let profileContainer = null;
    
    while (current && current.parentElement) {
      const parent = current.parentElement;
      const text = parent.textContent || '';
      
      if ((text.includes('关注') || text.includes('粉丝')) && 
          (text.includes('获赞') || text.includes('收藏'))) {
        profileContainer = parent;
        break;
      }
      
      current = parent;
    }
    
    if (!profileContainer) {
      return { error: '未找到博主信息容器' };
    }
    
    // 从容器提取数据
    const nickname = profileContainer.querySelector('[class*="nickname"], [class*="name"], h1')?.textContent?.trim();
    const userIdText = Array.from(profileContainer.querySelectorAll('*')).find(el => 
      el.textContent?.includes('小红书号：')
    );
    const userId = userIdText?.textContent?.replace('小红书号：', '').trim();
    const ipText = Array.from(profileContainer.querySelectorAll('*')).find(el => 
      el.textContent?.includes('IP') || el.textContent?.includes('属地')
    );
    const ipLocation = ipText?.textContent?.replace(/.*?IP.*?：?/, '').split(/[\s,]/)[0].trim();
    
    const stats = profileContainer.querySelectorAll('[class*="count"], [class*="num"]');
    
    return {
      nickname: nickname || '未找到',
      userId: userId || '未找到',
      ipLocation: ipLocation || '未找到',
      followCount: stats[0]?.textContent?.trim() || '未找到',
      fansCount: stats[1]?.textContent?.trim() || '未找到',
      likesCount: stats[2]?.textContent?.trim() || '未找到',
    };
  });
  
  if (userData.error) {
    console.log(`❌ 采集失败：${userData.error}`);
    return null;
  }
  
  console.log('✅ 博主信息:');
  console.log(`   昵称：${userData.nickname}`);
  console.log(`   小红书号：${userData.userId}`);
  console.log(`   IP 属地：${userData.ipLocation}`);
  console.log(`   关注：${userData.followCount}`);
  console.log(`   粉丝：${userData.fansCount}`);
  console.log(`   获赞：${userData.likesCount}`);
  
  return userData;
}

/**
 * 采集笔记详情信息
 */
async function collectNoteDetail(page, configLoader) {
  console.log('\n📖 采集笔记详情...\n');
  
  // 1. 采集 DOM 数据
  const noteData = await page.evaluate(() => {
    // 查找笔记详情容器
    let container = document.querySelector('.note-detail-mask') || 
                   document.querySelector('[class*="note-detail"]') ||
                   document.body;
    
    // 1. 主图
    const images = Array.from(container.querySelectorAll('img'))
      .map(img => img.src || img.getAttribute('data-src'))
      .filter(src => src && (src.includes('sns-img') || src.includes('xhscdn')));
    
    // 2. 标题和文案
    const title = container.querySelector('h1, [class*="title"]')?.textContent?.trim() || '未找到';
    const content = container.querySelector('[class*="content"], [class*="desc"]')?.textContent?.trim() || '未找到';
    
    // 3. 互动数据
    const interactData = {};
    
    // 查找互动区域
    const interactArea = container.querySelector('[class*="Interaction"]') || 
                        container.querySelector('[class*="interaction"]');
    
    if (interactArea) {
      const buttons = interactArea.querySelectorAll('button, [class*="button"]');
      
      buttons.forEach(btn => {
        const count = btn.querySelector('.count, [class*="count"]')?.textContent?.trim();
        if (!count) return;
        
        const className = btn.className?.toLowerCase() || '';
        const text = btn.textContent?.toLowerCase() || '';
        
        if (className.includes('like') || text.includes('点赞')) {
          interactData.likeCount = count;
        } else if (className.includes('collect') || className.includes('favorite') || text.includes('收藏')) {
          interactData.collectCount = count;
        } else if (className.includes('comment') || text.includes('评论')) {
          interactData.commentCount = count;
        }
      });
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
  
  // 2. 如果 DOM 提取失败，尝试从 JSON 提取（备用）
  if (noteData.likeCount === '未找到' || noteData.collectCount === '未找到' || noteData.commentCount === '未找到') {
    const jsonData = await page.evaluate(() => {
      const pathParts = window.location.pathname.split('/');
      const noteId = pathParts[pathParts.length - 1];
      const noteJson = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.note;
      
      if (!noteJson || !noteJson.interactInfo) return {};
      
      return {
        likeCount: noteJson.interactInfo.likedCount?.toString(),
        collectCount: noteJson.interactInfo.collectedCount?.toString(),
        commentCount: noteJson.interactInfo.commentCount?.toString(),
      };
    });
    
    // 合并数据
    if (jsonData.likeCount && noteData.likeCount === '未找到') {
      noteData.likeCount = jsonData.likeCount;
    }
    if (jsonData.collectCount && noteData.collectCount === '未找到') {
      noteData.collectCount = jsonData.collectCount;
    }
    if (jsonData.commentCount && noteData.commentCount === '未找到') {
      noteData.commentCount = jsonData.commentCount;
    }
  }
  
  console.log('📊 采集结果:');
  console.log(`✅ 标题：${noteData.title}`);
  console.log(`✅ 文案：${noteData.content.substring(0, 100)}${noteData.content.length > 100 ? '...' : ''}`);
  console.log(`✅ 主图：${noteData.images.length} 张`);
  if (noteData.images.length > 0) {
    console.log(`   ${noteData.images[0].substring(0, 80)}...`);
  }
  console.log(`✅ 点赞：${noteData.likeCount}`);
  console.log(`✅ 收藏：${noteData.collectCount}`);
  console.log(`✅ 评论：${noteData.commentCount}`);
  
  return noteData;
}

/**
 * 主函数：演示完整采集流程
 */
async function main() {
  console.log('🚀 content-publish-platform 选择器配置集成演示\n');
  console.log('=' .repeat(60));
  
  // 1. 加载选择器配置
  console.log('📋 步骤 1: 加载选择器配置...\n');
  const configLoader = new SelectorConfigLoader();
  await configLoader.load();
  
  const summary = configLoader.getSummary();
  console.log(`\n✅ 配置版本：v${summary.version}`);
  console.log(`   更新时间：${summary.updatedAt}`);
  console.log(`   页面配置:`);
  Object.entries(summary.pages).forEach(([page, info]) => {
    const icon = info.verified ? '✅' : '⚠️';
    console.log(`     ${icon} ${page}: ${info.selectorCount} 个选择器 (${info.successRate})`);
  });
  console.log();
  
  // 2. 初始化浏览器
  console.log('🌐 步骤 2: 初始化浏览器...\n');
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  
  const page = await context.newPage();
  
  try {
    // 3. 加载 Cookie
    console.log('🍪 步骤 3: 加载 Cookie...\n');
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
      await randomDelay(2000, 4000);
    }
    
    // 4. 搜索
    console.log('🔍 步骤 4: 搜索关键词...\n');
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=穿搭', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await randomDelay(3000, 5000);
    
    // 5. 采集博主信息
    console.log('📊 步骤 5: 采集博主信息...\n');
    const userProfileData = await collectUserProfile(page, configLoader);
    
    // 6. 采集笔记列表
    console.log('\n📝 步骤 6: 采集笔记列表...\n');
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
    
    console.log(`✅ 找到 ${notes.length} 篇笔记:`);
    notes.forEach((note, i) => {
      console.log(`   ${i + 1}. ${note.title} - ${note.author} (❤️ ${note.likeCount})`);
    });
    
    // 7. 采集笔记详情
    if (notes.length > 0 && notes[0].url) {
      console.log(`\n📖 步骤 7: 采集笔记详情...\n`);
      await page.goto(notes[0].url, { waitUntil: 'networkidle', timeout: 60000 });
      await randomDelay(3000, 5000);
      
      const noteDetailData = await collectNoteDetail(page, configLoader);
      
      // 8. 保存结果
      const { writeFile } = await import('fs/promises');
      const result = {
        collectedAt: new Date().toISOString(),
        configVersion: configLoader.getVersion(),
        userProfile: userProfileData,
        notes: notes,
        noteDetail: noteDetailData,
      };
      
      const outputFile = `/home/halfthin/dev/content-publish-platform/.workspace/tests/integration-demo-${new Date().toISOString().slice(0, 19)}.json`;
      await writeFile(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n💾 结果已保存到：${outputFile}`);
    }
    
    console.log('\n✅ 演示完成！\n');
    
  } catch (error) {
    console.error('❌ 采集失败:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
