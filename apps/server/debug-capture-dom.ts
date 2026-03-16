import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { XIAOHONGSHU_COOKIES } from '../../.workspace/config/xiaohongshu.cookies.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureDOM() {
  console.log('🚀 启动浏览器...');

  const browser = await chromium.launch({
    headless: true, // 无头模式
    args: ['--window-size=1920,1080'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  // 设置 Cookie
  console.log('🍪 设置 Cookie...');
  // 修复 sameSite 属性
  const fixedCookies = XIAOHONGSHU_COOKIES.map((cookie) => ({
    ...cookie,
    sameSite: cookie.sameSite === 'unspecified' ? 'Lax' : cookie.sameSite,
  }));
  await context.addCookies(fixedCookies);

  const page = await context.newPage();

  // 访问搜索页面
  const searchUrl = 'https://www.xiaohongshu.com/search_result?keyword=博主';
  console.log(`📍 访问页面：${searchUrl}`);

  await page.goto(searchUrl, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  // 等待页面加载
  console.log('⏳ 等待页面加载...');
  await page.waitForTimeout(5000);

  // 检查登录状态
  console.log('🔐 检查登录状态...');
  const loginCheck = await page.evaluate(() => {
    // 检查各种可能的登录状态指示器
    const checks = {
      hasWebSession: document.cookie.includes('web_session'),
      hasIdToken: document.cookie.includes('id_token'),
      hasUserAvatar: !!document.querySelector('[class*="avatar"]'),
      hasUserProfile: !!document.querySelector('[class*="user-profile"]'),
      hasLoginButton: !!document.querySelector('[class*="login"]'),
      url: window.location.href,
      title: document.title,
    };
    return checks;
  });
  console.log('登录状态检查:', JSON.stringify(loginCheck, null, 2));

  // 查找所有可能的卡片元素
  console.log('🔍 查找搜索结果卡片...');
  const cardSelectors = [
    'div[class*="note"]',
    'section[class*="note"]',
    'article[class*="note"]',
    '.note-item',
    '.note-card',
    '.search-result-item',
    'div[class*="search-result"]',
    'div[class*="card"]',
    '[data-e2e*="note"]',
    '[data-e2e*="search"]',
  ];

  const cards: any[] = [];
  for (const selector of cardSelectors) {
    try {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`✅ 选择器 "${selector}" 找到 ${elements.length} 个元素`);
        cards.push({ selector, count: elements.length });
      }
    } catch (e) {
      // 忽略错误
    }
  }

  // 保存完整 HTML
  console.log('💾 保存 HTML...');
  const html = await page.content();
  const debugDir = path.join(__dirname, '..', '.workspace', 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = path.join(debugDir, `xiaohongshu-dom-${timestamp}.html`);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`📄 HTML 已保存到：${htmlPath}`);

  // 提取页面结构信息
  console.log('📊 分析页面结构...');
  const structureInfo = await page.evaluate(() => {
    // 获取所有可能的用户信息相关元素
    const infoSelectors = [
      '[class*="name"]',
      '[class*="user"]',
      '[class*="author"]',
      '[class*="avatar"]',
      '[class*="fans"]',
      '[class*="follower"]',
      '[class*="count"]',
      '[data-e2e*="name"]',
      '[data-e2e*="user"]',
      '[data-e2e*="author"]',
    ];

    const elements: any[] = [];
    infoSelectors.forEach((selector) => {
      try {
        const els = document.querySelectorAll(selector);
        if (els.length > 0 && els.length < 50) {
          els.forEach((el: Element) => {
            elements.push({
              selector,
              tagName: el.tagName,
              className: el.className,
              text: el.textContent?.trim().slice(0, 50),
              attributes: Array.from(el.attributes).map((a) => ({
                name: a.name,
                value: a.value.slice(0, 100),
              })),
            });
          });
        }
      } catch (e) {}
    });

    return elements;
  });

  // 保存结构信息
  const structurePath = path.join(debugDir, `structure-info-${timestamp}.json`);
  fs.writeFileSync(structurePath, JSON.stringify(structureInfo, null, 2), 'utf-8');
  console.log(`📋 结构信息已保存到：${structurePath}`);

  // 查找笔记卡片的具体结构
  console.log('🔬 分析笔记卡片内部结构...');
  const cardStructure = await page.evaluate(() => {
    // 尝试找到第一个笔记卡片
    const noteItems = document.querySelectorAll(
      '.note-item, [class*="note-card"], div[class*="note"]'
    );
    if (noteItems.length === 0) {
      return { error: '未找到笔记卡片' };
    }

    const firstCard = noteItems[0];
    const analyzeElement = (el: Element, depth = 0): any => {
      if (depth > 3) return null; // 限制深度

      const children = Array.from(el.children)
        .map((child) => analyzeElement(child, depth + 1))
        .filter(Boolean);

      return {
        tagName: el.tagName,
        className: el.className,
        dataE2e: el.getAttribute('data-e2e'),
        text: el.textContent?.trim().slice(0, 100),
        children: children.length > 0 ? children : undefined,
      };
    };

    return analyzeElement(firstCard);
  });

  const cardStructurePath = path.join(debugDir, `card-structure-${timestamp}.json`);
  fs.writeFileSync(cardStructurePath, JSON.stringify(cardStructure, null, 2), 'utf-8');
  console.log(`🃏 卡片结构已保存到：${cardStructurePath}`);

  console.log('\n✅ DOM 捕获完成！');
  console.log(`\n生成的文件:`);
  console.log(`  - ${htmlPath}`);
  console.log(`  - ${structurePath}`);
  console.log(`  - ${cardStructurePath}`);

  // 保持浏览器打开以便手动检查
  console.log('\n👀 浏览器保持打开状态 30 秒以便手动检查...');
  await page.waitForTimeout(30000);

  await browser.close();
}

captureDOM().catch(console.error);
