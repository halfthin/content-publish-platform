/**
 * 小红书智能页面分析器 v2.0
 * 
 * 核心能力：
 * - 不依赖固定选择器
 * - 通过文本内容定位
 * - 动态分析 DOM 结构
 * - 自动适应页面变化
 */

import { chromium } from 'playwright';
import { writeFile, readFile } from 'fs/promises';

/**
 * 生成 CSS 选择器路径
 */
function generateSelector(element) {
  const path = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase();
    
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else {
      const className = current.className?.toString().split(' ')[0];
      if (className && className.trim()) {
        selector += `.${className.replace(/\s+/g, '.')}`;
      }
      
      const sibling = current.previousElementSibling;
      if (sibling && sibling.nodeName === current.nodeName && sibling.className === current.className) {
        let count = 1;
        let prev = current.previousElementSibling;
        while (prev && prev.nodeName === current.nodeName && prev.className === current.className) {
          count++;
          prev = prev.previousElementSibling;
        }
        selector += `:nth-of-type(${count})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

/**
 * 分析搜索页面
 */
async function analyzeSearchPage(page) {
  console.log('🔍 分析搜索页面...');
  
  // 等待搜索结果加载
  await page.waitForSelector('section.note-item', { timeout: 10000 });
  
  // 提取所有笔记卡片
  const cards = await page.$$('section.note-item');
  console.log(`✅ 找到 ${cards.length} 个笔记卡片`);
  
  const results = [];
  
  for (let i = 0; i < Math.min(cards.length, 5); i++) {
    const card = cards[i];
    
    try {
      // 提取笔记 URL
      const noteLinks = await card.$$eval('a[href*="/explore/"], a[href*="/search_result/"]', 
        links => links.map(link => link.href)
      );
      
      // 提取博主 URL
      const authorLinks = await card.$$eval('a[href*="/user/profile/"]', 
        links => links.map(link => link.href)
      );
      
      // 提取标题
      const title = await card.$eval('.title, [class*="title"]', el => el.textContent?.trim()).catch(() => '无标题');
      
      // 提取作者
      const author = await card.$eval('.author .name, [class*="author"] .name', el => el.textContent?.trim()).catch(() => '未知');
      
      if (noteLinks.length > 0 || authorLinks.length > 0) {
        results.push({
          noteUrl: noteLinks[0] || null,
          authorUrl: authorLinks[0] || null,
          title,
          author,
        });
      }
    } catch (error) {
      console.warn(`⚠️ 提取第 ${i + 1} 个卡片失败:`, error.message);
    }
  }
  
  console.log(`✅ 提取到 ${results.length} 个有效结果\n`);
  return results;
}

/**
 * 分析博主主页（核心功能：通过文本定位）
 */
async function analyzeUserProfile(page) {
  console.log('👤 分析博主主页...');
  
  // 等待页面加载
  await page.waitForTimeout(3000);
  
  // 策略 1：通过"小红书号："文本定位
  const userData = await page.evaluate(() => {
    // 在页面上下文中定义 generateSelector
    function generateSelector(element) {
      const path = [];
      let current = element;
      
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();
        
        if (current.id) {
          selector += `#${current.id}`;
          path.unshift(selector);
          break;
        } else {
          const className = current.className?.toString().split(' ')[0];
          if (className && className.trim()) {
            selector += `.${className.replace(/\s+/g, '.')}`;
          }
          
          const sibling = current.previousElementSibling;
          if (sibling && sibling.nodeName === current.nodeName && sibling.className === current.className) {
            let count = 1;
            let prev = current.previousElementSibling;
            while (prev && prev.nodeName === current.nodeName && prev.className === current.className) {
              count++;
              prev = prev.previousElementSibling;
            }
            selector += `:nth-of-type(${count})`;
          }
        }
        
        path.unshift(selector);
        current = current.parentElement;
      }
      
      return path.join(' > ');
    }
    
    try {
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
        
        // 检查是否包含博主相关关键词
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
      const nickname = profileContainer.querySelector('[class*="nickname"], [class*="name"], h1, .user-name')?.textContent?.trim() ||
                      Array.from(profileContainer.querySelectorAll('div, span')).find(el => {
                        const text = el.textContent?.trim();
                        return text && text.length < 50 && !text.includes('关注') && !text.includes('粉丝') && !text.includes('小红书号');
                      })?.textContent?.trim();
      
      // 提取小红书号
      const userIdText = Array.from(profileContainer.querySelectorAll('*')).find(el => 
        el.textContent?.includes('小红书号：')
      );
      const userId = userIdText?.textContent?.replace('小红书号：', '').trim() || '未找到';
      
      // 提取 IP 属地
      const ipText = Array.from(profileContainer.querySelectorAll('*')).find(el => 
        el.textContent?.includes('IP') || el.textContent?.includes('属地')
      );
      const ipLocation = ipText?.textContent?.replace(/.*?IP.*?：?/, '').split(/[\s,]/)[0].trim() || '未找到';
      
      // 提取统计数据
      const statElements = profileContainer.querySelectorAll('[class*="count"], [class*="num"], .user-interactions .count');
      const stats = Array.from(statElements).map(el => el.textContent?.trim()).filter(Boolean);
      
      return {
        nickname: nickname || '未找到',
        userId,
        ipLocation,
        followCount: stats[0] || '未找到',
        fansCount: stats[1] || '未找到',
        likesCount: stats[2] || '未找到',
        containerSelector: generateSelector(profileContainer),
      };
    } catch (error) {
      return { error: error.message };
    }
  });
  
  if (userData.error) {
    console.log(`❌ 分析失败：${userData.error}`);
    return null;
  }
  
  console.log('✅ 博主信息:');
  console.log(`   昵称：${userData.nickname}`);
  console.log(`   小红书号：${userData.userId}`);
  console.log(`   IP 属地：${userData.ipLocation}`);
  console.log(`   关注：${userData.followCount}`);
  console.log(`   粉丝：${userData.fansCount}`);
  console.log(`   获赞：${userData.likesCount}\n`);
  
  return userData;
}

/**
 * 分析笔记列表
 */
async function analyzeNoteList(page) {
  console.log('📝 分析笔记列表...');
  
  // 查找所有带图片的笔记链接
  const notes = await page.$$eval('a[href*="/explore/"]', links => {
    return links
      .filter(link => link.querySelector('img'))
      .map(link => {
        const img = link.querySelector('img');
        return {
          url: link.href,
          imageUrl: img?.src || img?.getAttribute('data-src') || '',
          title: link.querySelector('.title, [class*="title"]')?.textContent?.trim() || '无标题',
        };
      });
  });
  
  console.log(`✅ 找到 ${notes.length} 篇笔记\n`);
  return notes.slice(0, 10);
}

/**
 * 分析笔记详情（通过 SVG + count 模式）
 */
async function analyzeNoteDetail(page) {
  console.log('📖 分析笔记详情...');
  
  // 等待笔记详情容器
  try {
    await page.waitForSelector('.note-detail-mask, [class*="note-detail"]', { timeout: 10000 });
  } catch (error) {
    console.log('⚠️ 未找到标准笔记详情容器，尝试其他方式...');
  }
  
  await page.waitForTimeout(2000);
  
  const noteData = await page.evaluate(() => {
    try {
      // 查找笔记详情容器
      let container = document.querySelector('.note-detail-mask') || 
                     document.querySelector('[class*="note-detail"]') ||
                     document.querySelector('[class*="note-content"]');
      
      if (!container) {
        // 尝试从 body 查找
        container = document.body;
      }
      
      // 提取标题
      const title = container.querySelector('h1, [class*="title"], .note-title')?.textContent?.trim() || '未找到';
      
      // 提取内容
      const content = container.querySelector('[class*="content"], [class*="desc"], .note-content')?.textContent?.trim() || '未找到';
      
      // 提取图片
      const images = Array.from(container.querySelectorAll('img'))
        .map(img => img.src || img.getAttribute('data-src'))
        .filter(Boolean);
      
      // 提取互动数据（通过 SVG + span.count 模式）
      const interactData = {};
      const interactItems = container.querySelectorAll('svg + span.count, svg ~ span.count, [class*="like"] .count, [class*="collect"] .count, [class*="comment"] .count');
      
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
        
        // 判断类型
        if (svgClass.includes('like') || parentClass.includes('like') || parentClass.includes('InteractionLike')) {
          interactData.likeCount = count;
        } else if (svgClass.includes('collect') || svgClass.includes('favorite') || parentClass.includes('collect') || parentClass.includes('InteractionCollect')) {
          interactData.collectCount = count;
        } else if (svgClass.includes('comment') || svgClass.includes('chat') || parentClass.includes('comment') || parentClass.includes('InteractionComment')) {
          interactData.commentCount = count;
        } else {
          // 按位置判断
          if (index === 0 && !interactData.likeCount) interactData.likeCount = count;
          else if (index === 1 && !interactData.collectCount) interactData.collectCount = count;
          else if (index === 2 && !interactData.commentCount) interactData.commentCount = count;
        }
      });
      
      return {
        title,
        content,
        images,
        ...interactData,
      };
    } catch (error) {
      return { error: error.message };
    }
  });
  
  if (noteData.error) {
    console.log(`❌ 分析失败：${noteData.error}`);
    return null;
  }
  
  console.log('✅ 笔记信息:');
  console.log(`   标题：${noteData.title}`);
  console.log(`   图片：${noteData.images.length} 张`);
  console.log(`   点赞：${noteData.likeCount || '未找到'}`);
  console.log(`   收藏：${noteData.collectCount || '未找到'}`);
  console.log(`   评论：${noteData.commentCount || '未找到'}\n`);
  
  return noteData;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 小红书智能页面分析器 v2.0\n');
  console.log('=' .repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 加载 Cookie
    const cookiePath = '/home/halfthin/dev/sop/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
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
    
    // 1. 搜索
    const keyword = '穿搭';
    console.log(`🔍 搜索关键词："${keyword}"\n`);
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    const searchResults = await analyzeSearchPage(page);
    
    if (searchResults.length === 0) {
      console.log('❌ 未找到搜索结果');
      return;
    }
    
    // 2. 访问博主主页
    const authorUrl = searchResults[0].authorUrl;
    if (authorUrl) {
      console.log(`\n👤 访问博主主页：${authorUrl}\n`);
      await page.goto(authorUrl, { waitUntil: 'networkidle', timeout: 60000 });
      const bloggerData = await analyzeUserProfile(page);
      
      if (bloggerData) {
        // 3. 分析笔记列表
        const notes = await analyzeNoteList(page);
        
        if (notes.length > 0) {
          // 4. 打开笔记详情
          const noteUrl = notes[0].url;
          console.log(`\n📖 访问笔记详情：${noteUrl}\n`);
          await page.goto(noteUrl, { waitUntil: 'networkidle', timeout: 60000 });
          const noteDetail = await analyzeNoteDetail(page);
          
          // 5. 保存结果
          const results = {
            version: '2.0.0',
            analyzedAt: new Date().toISOString(),
            keyword,
            searchResults,
            bloggerData,
            notes,
            noteDetail,
          };
          
          const outputFile = '/home/halfthin/dev/sop/content-publish-platform/.workspace/tests/smart-analyzer-result.json';
          await writeFile(outputFile, JSON.stringify(results, null, 2));
          console.log(`💾 结果已保存到：${outputFile}\n`);
          console.log('✅ 分析完成！\n');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
