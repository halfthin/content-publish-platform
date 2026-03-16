#!/usr/bin/env bun

/**
 * 小红书选择器分析工具
 *
 * 功能：访问 4 个目标页面，分析 DOM 结构，生成 selector.conf.json
 *
 * 使用：bun tools/analyze-selectors.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { XIAOHONGSHU_COOKIES } from '../../../.workspace/config/xiaohongshu.cookies.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 配置 ==========

interface PageConfig {
  name: string;
  displayName: string;
  url: string;
  targets: string[];
}

const PAGES: PageConfig[] = [
  {
    name: 'home',
    displayName: '首页',
    url: 'https://www.xiaohongshu.com/explore',
    targets: [
      'noteCard',
      'noteTitle',
      'noteLink',
      'authorName',
      'authorLink',
      'searchInput',
      'searchButton',
    ],
  },
  {
    name: 'search',
    displayName: '搜索结果页',
    url: 'https://www.xiaohongshu.com/search_result?keyword=%E7%A9%BF%E6%90%AD&source=web_explore_feed',
    targets: ['noteCard', 'noteTitle', 'noteLink', 'authorName', 'authorLink'],
  },
  {
    name: 'userProfile',
    displayName: '博主主页',
    url: 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708',
    targets: [
      'nickname',
      'userId',
      'ipLocation',
      'followCount',
      'fansCount',
      'likesCount',
      'noteList',
      'noteCard',
      'noteTitle',
      'noteLink',
      'likeCount',
    ],
  },
  {
    name: 'noteDetail',
    displayName: '博文详情页',
    url: 'https://www.xiaohongshu.com/explore/698eeae2000000000903af9a',
    targets: ['images', 'title', 'content', 'likeCount', 'collectCount', 'commentCount'],
  },
];

// ========== 选择器生成 ==========

async function generateSelectorsForTarget(
  page: Page,
  target: string,
  keywords: string[]
): Promise<string[]> {
  const selectors: string[] = [];

  // 策略 1: 查找包含关键词的类名
  for (const keyword of keywords) {
    const found = await page.evaluate((kw: string) => {
      const elements = Array.from(document.querySelectorAll('*'));
      const results: string[] = [];

      for (const el of elements) {
        const className = el.className || '';
        if (typeof className === 'string' && className.includes(kw)) {
          let selector = el.tagName.toLowerCase();

          if (el.id) {
            selector += `#${el.id}`;
          } else {
            const classes = className
              .trim()
              .split(/\s+/)
              .filter((c) => c)
              .slice(0, 2);
            if (classes.length > 0) {
              selector += '.' + classes.join('.');
            }
          }

          if (el.hasAttribute('data-e2e')) {
            selector += `[data-e2e="${el.getAttribute('data-e2e')}"]`;
          }

          results.push(selector);
        }
      }

      return results.slice(0, 5);
    }, keyword);

    selectors.push(...found);
  }

  // 去重
  return [...new Set(selectors)].slice(0, 5);
}

// ========== 页面分析 ==========

async function analyzePage(page: Page, pageConfig: PageConfig): Promise<Record<string, string[]>> {
  console.log(`\n📄 分析页面：${pageConfig.displayName}`);
  console.log(`   URL: ${pageConfig.url}`);

  const selectors: Record<string, string[]> = {};

  // 定义每个目标的关键词
  const targetKeywords: Record<string, string[]> = {
    noteCard: ['note', 'card', 'item', 'feed'],
    noteTitle: ['title', 'heading', 'note-title'],
    noteLink: ['note', 'explore', 'link'],
    authorName: ['author', 'name', 'nickname', 'user'],
    authorLink: ['author', 'user', 'profile'],
    searchInput: ['search', 'input', 'keyword'],
    searchButton: ['search', 'button', 'btn'],
    nickname: ['nickname', 'name', 'user'],
    userId: ['id', 'red-id', 'user-id'],
    ipLocation: ['ip', 'location', 'pos'],
    followCount: ['follow', 'following'],
    fansCount: ['fan', 'follower'],
    likesCount: ['like', 'favorite', 'collect', 'total'],
    noteList: ['note', 'list', 'grid'],
    likeCount: ['like', 'heart', 'count'],
    images: ['image', 'img', 'picture', 'photo'],
    title: ['title', 'heading'],
    content: ['content', 'text', 'desc'],
    collectCount: ['collect', 'star', 'bookmark'],
    commentCount: ['comment', 'reply'],
  };

  for (const target of pageConfig.targets) {
    const keywords = targetKeywords[target] || [target];
    console.log(`   🔍 分析目标：${target}`);

    const targetSelectors = await generateSelectorsForTarget(page, target, keywords);

    if (targetSelectors.length > 0) {
      selectors[target] = targetSelectors;
      console.log(`      ✅ 找到 ${targetSelectors.length} 个选择器`);
    } else {
      // 使用备用策略：查找常见模式
      const fallbackSelectors = await page.evaluate((tgt: string) => {
        const patterns = [
          `[class*="${tgt}"]`,
          `.${tgt}`,
          `[data-testid="${tgt}"]`,
          `[data-e2e="${tgt}"]`,
        ];
        return patterns;
      }, target);

      selectors[target] = fallbackSelectors;
      console.log(`      ⚠️ 使用备用选择器`);
    }
  }

  return selectors;
}

// ========== 主函数 ==========

async function main() {
  console.log('🔍 小红书选择器分析工具\n');
  console.log('='.repeat(60));

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    // 启动浏览器
    console.log('🌐 启动浏览器...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    // 设置 Cookie
    console.log('🍪 设置 Cookie...');
    const fixedCookies = XIAOHONGSHU_COOKIES.map((cookie) => ({
      ...cookie,
      sameSite: cookie.sameSite === 'unspecified' ? 'Lax' : cookie.sameSite,
    }));
    await context.addCookies(fixedCookies);

    const result: any = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      pages: {},
    };

    // 分析每个页面
    for (const pageConfig of PAGES) {
      const page = await context.newPage();

      try {
        console.log(`\n访问：${pageConfig.displayName}`);
        await page.goto(pageConfig.url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);

        const selectors = await analyzePage(page, pageConfig);

        result.pages[pageConfig.name] = {
          name: pageConfig.displayName,
          url: pageConfig.url
            .replace(/\/profile\/[^?]+/, '/profile/*')
            .replace(/\/explore\/[^?]+/, '/explore/*'),
          selectors,
        };
      } catch (error: any) {
        console.error(`❌ 分析失败：${error.message}`);
        result.pages[pageConfig.name] = {
          name: pageConfig.displayName,
          url: pageConfig.url,
          selectors: {},
          error: error.message,
        };
      } finally {
        await page.close();
      }
    }

    // 保存配置
    console.log('\n💾 保存配置文件...');
    const outputPath = path.join(__dirname, '../../selector.conf.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`✅ 配置已保存：${outputPath}`);

    // 生成摘要
    console.log('\n' + '='.repeat(60));
    console.log('📊 分析摘要');
    console.log('='.repeat(60));

    let totalSelectors = 0;
    for (const pageName in result.pages) {
      const pageData = result.pages[pageName];
      const count = Object.keys(pageData.selectors || {}).length;
      totalSelectors += count;
      console.log(`${pageData.name}: ${count} 个选择器`);
    }

    console.log('-'.repeat(60));
    console.log(`总计：${totalSelectors} 个选择器`);
    console.log('='.repeat(60));

    console.log('\n✅ 分析完成！\n');
  } catch (error: any) {
    console.error('\n❌ 分析失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

// 运行
main();
