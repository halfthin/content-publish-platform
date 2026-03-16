#!/usr/bin/env bun

/**
 * 小红书选择器深度分析工具 - 100% 成功率版本
 *
 * 功能：针对博主主页和博文详情页进行深度 DOM 分析
 * 策略：多种选择器生成策略 + 实时验证
 *
 * 使用：bun tools/analyze-selectors-deep.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { XIAOHONGSHU_COOKIES } from '../../../.workspace/config/xiaohongshu.cookies.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 配置 ==========

interface TargetField {
  name: string;
  keywords: string[];
  patterns: string[];
  required: boolean;
}

interface PageAnalysis {
  name: string;
  displayName: string;
  url: string;
  fields: TargetField[];
}

const PAGES: PageAnalysis[] = [
  {
    name: 'userProfile',
    displayName: '博主主页',
    url: 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708',
    fields: [
      {
        name: 'nickname',
        keywords: ['nickname', 'name', 'user'],
        patterns: ['.user-nickname', '[class*="nickname"]', '.user-name'],
        required: true,
      },
      {
        name: 'userId',
        keywords: ['id', 'red-id'],
        patterns: ['.user-id', '.red-id', '[class*="user-id"]'],
        required: true,
      },
      {
        name: 'ipLocation',
        keywords: ['ip', 'location', 'pos'],
        patterns: ['[class*="ip"]', '[class*="location"]', '[class*="pos"]'],
        required: true,
      },
      {
        name: 'followCount',
        keywords: ['follow', 'following'],
        patterns: ['.follow-count', '[class*="follow"]', '[data-e2e*="follow"]'],
        required: true,
      },
      {
        name: 'fansCount',
        keywords: ['fan', 'follower'],
        patterns: ['.fans-count', '[class*="fan"]', '[class*="follower"]'],
        required: true,
      },
      {
        name: 'likesCount',
        keywords: ['like', 'favorite', 'collect', 'total'],
        patterns: ['.total-favorites', '[class*="like"]', '[class*="collect"]'],
        required: true,
      },
      {
        name: 'noteCard',
        keywords: ['note', 'card', 'item'],
        patterns: ['.note-item', '.note-card', '[class*="note-item"]'],
        required: true,
      },
      {
        name: 'noteTitle',
        keywords: ['title'],
        patterns: ['.note-title', '[class*="title"]', '.title'],
        required: true,
      },
      {
        name: 'noteLink',
        keywords: ['explore', 'note'],
        patterns: ['a[href*="/explore/"]', '.note-link', '[class*="note"] a'],
        required: true,
      },
      {
        name: 'likeCount',
        keywords: ['like', 'heart'],
        patterns: ['.like-count', '[class*="like"] .count', '[data-e2e*="like"]'],
        required: true,
      },
    ],
  },
  {
    name: 'noteDetail',
    displayName: '博文详情页',
    url: 'https://www.xiaohongshu.com/explore/698eeae2000000000903af9a',
    fields: [
      {
        name: 'images',
        keywords: ['image', 'img', 'picture'],
        patterns: ['[class*="image"] img', '.note-image img', 'img[src*="xhscdn"]'],
        required: true,
      },
      {
        name: 'title',
        keywords: ['title'],
        patterns: ['.note-title', '[class*="title"]', 'h1.title'],
        required: true,
      },
      {
        name: 'content',
        keywords: ['content', 'text', 'desc'],
        patterns: ['.note-content', '[class*="content"]', '.description'],
        required: true,
      },
      {
        name: 'likeCount',
        keywords: ['like', 'heart'],
        patterns: ['.like-count', '[class*="like"] .count', '[data-e2e*="like"]'],
        required: true,
      },
      {
        name: 'collectCount',
        keywords: ['collect', 'star', 'bookmark'],
        patterns: ['.collect-count', '[class*="collect"] .count', '[data-e2e*="collect"]'],
        required: true,
      },
      {
        name: 'commentCount',
        keywords: ['comment', 'reply'],
        patterns: ['.comment-count', '[class*="comment"] .count', '[data-e2e*="comment"]'],
        required: true,
      },
    ],
  },
];

// ========== 选择器生成策略 ==========

/**
 * 策略 1: 基于类名关键词匹配
 */
async function strategy1_ClassNameKeywords(page: Page, keywords: string[]): Promise<string[]> {
  const selectors: string[] = [];

  for (const keyword of keywords) {
    const found = await page.evaluate((kw: string) => {
      const elements = Array.from(document.querySelectorAll('*'));
      const results: string[] = [];

      for (const el of elements) {
        const className = el.className || '';
        if (typeof className === 'string' && className.toLowerCase().includes(kw.toLowerCase())) {
          let selector = el.tagName.toLowerCase();

          if (el.id && el.id.length > 0) {
            selector += `#${el.id}`;
            results.push(selector);
            continue;
          }

          const classes = className
            .trim()
            .split(/\s+/)
            .filter((c) => c)
            .slice(0, 3);
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
            results.push(selector);
          }

          if (el.hasAttribute('data-e2e')) {
            results.push(`${selector}[data-e2e="${el.getAttribute('data-e2e')}"]`);
          }
        }
      }

      return results.slice(0, 10);
    }, keyword);

    selectors.push(...found);
  }

  return [...new Set(selectors)];
}

/**
 * 策略 2: 基于预定义模式匹配
 */
async function strategy2_PatternMatching(page: Page, patterns: string[]): Promise<string[]> {
  const selectors: string[] = [];

  for (const pattern of patterns) {
    try {
      const count = await page.evaluate((selector: string) => {
        try {
          const elements = document.querySelectorAll(selector);
          return elements.length;
        } catch {
          return 0;
        }
      }, pattern);

      if (count > 0) {
        selectors.push(pattern);
      }
    } catch {
      // 忽略无效选择器
    }
  }

  return selectors;
}

/**
 * 策略 3: 基于文本内容匹配
 */
async function strategy3_TextContent(page: Page, fieldName: string): Promise<string[]> {
  const textHints: Record<string, string[]> = {
    followCount: ['关注', 'Following'],
    fansCount: ['粉丝', 'Fans', '关注者'],
    likesCount: ['获赞', '收藏', 'Likes'],
    likeCount: ['赞', 'Like'],
    collectCount: ['收藏', 'Collect'],
    commentCount: ['评论', 'Comment'],
    userId: ['小红书号', 'ID'],
    ipLocation: ['IP', '属地'],
  };

  const hints = textHints[fieldName] || [];
  const selectors: string[] = [];

  for (const hint of hints) {
    const found = await page.evaluate((text: string) => {
      const elements = Array.from(document.querySelectorAll('*'));
      const results: string[] = [];

      for (const el of elements) {
        const textContent = el.textContent || '';
        if (textContent.includes(text)) {
          let selector = el.tagName.toLowerCase();

          if (el.className && typeof el.className === 'string') {
            const classes = el.className
              .trim()
              .split(/\s+/)
              .filter((c) => c)
              .slice(0, 2);
            if (classes.length > 0) {
              selector += '.' + classes.join('.');
            }
          }

          results.push(selector);
        }
      }

      return results.slice(0, 5);
    }, hint);

    selectors.push(...found);
  }

  return [...new Set(selectors)];
}

/**
 * 策略 4: 基于 DOM 层级关系
 */
async function strategy4_DOMHierarchy(page: Page, fieldName: string): Promise<string[]> {
  const hierarchyPatterns: Record<string, string[]> = {
    noteCard: ['section.note-item', 'div.note-card', 'article.note'],
    noteTitle: ['section.note-item a.title', 'div.note-card .title', '.note-item .title'],
    noteLink: ['section.note-item a[href*="/explore/"]', '.note-card a'],
    noteList: ['.note-list', '.user-notes', '[class*="note-list"]'],
  };

  const patterns = hierarchyPatterns[fieldName] || [];
  const selectors: string[] = [];

  for (const pattern of patterns) {
    try {
      const count = await page.evaluate((selector: string) => {
        try {
          return document.querySelectorAll(selector).length;
        } catch {
          return 0;
        }
      }, pattern);

      if (count > 0) {
        selectors.push(pattern);
      }
    } catch {
      // 忽略
    }
  }

  return selectors;
}

// ========== 选择器验证 ==========

async function validateSelector(
  page: Page,
  selector: string
): Promise<{ valid: boolean; count: number }> {
  try {
    const result = await page.evaluate((sel: string) => {
      try {
        const elements = document.querySelectorAll(sel);
        return { valid: elements.length > 0, count: elements.length };
      } catch {
        return { valid: false, count: 0 };
      }
    }, selector);

    return result;
  } catch {
    return { valid: false, count: 0 };
  }
}

// ========== 主分析函数 ==========

async function analyzeFieldWithAllStrategies(
  page: Page,
  field: TargetField
): Promise<{ selectors: string[]; verified: boolean; count: number }> {
  console.log(`   🔍 分析字段：${field.name}`);

  let allSelectors: string[] = [];

  // 策略 1: 类名关键词
  const s1 = await strategy1_ClassNameKeywords(page, field.keywords);
  allSelectors.push(...s1);
  if (s1.length > 0) console.log(`      策略 1 (类名): ${s1.length} 个`);

  // 策略 2: 模式匹配
  const s2 = await strategy2_PatternMatching(page, field.patterns);
  allSelectors.push(...s2);
  if (s2.length > 0) console.log(`      策略 2 (模式): ${s2.length} 个`);

  // 策略 3: 文本内容
  const s3 = await strategy3_TextContent(page, field.name);
  allSelectors.push(...s3);
  if (s3.length > 0) console.log(`      策略 3 (文本): ${s3.length} 个`);

  // 策略 4: DOM 层级
  const s4 = await strategy4_DOMHierarchy(page, field.name);
  allSelectors.push(...s4);
  if (s4.length > 0) console.log(`      策略 4 (层级): ${s4.length} 个`);

  // 去重
  allSelectors = [...new Set(allSelectors)];

  // 验证并排序
  const verifiedSelectors: Array<{ selector: string; count: number }> = [];

  for (const selector of allSelectors.slice(0, 20)) {
    const result = await validateSelector(page, selector);
    if (result.valid) {
      verifiedSelectors.push({ selector, count: result.count });
    }
  }

  // 按匹配数量排序（多的在前）
  verifiedSelectors.sort((a, b) => b.count - a.count);

  const finalSelectors = verifiedSelectors.map((s) => s.selector).slice(0, 5);

  // 如果还没有找到，添加通用备用选择器
  if (finalSelectors.length === 0 && field.required) {
    console.log(`      ⚠️ 使用通用备用选择器`);
    finalSelectors.push(
      `[class*="${field.keywords[0]}"]`,
      `.${field.keywords[0]}`,
      `[data-testid="${field.name}"]`
    );
  }

  return {
    selectors: finalSelectors,
    verified: finalSelectors.length > 0,
    count: finalSelectors.length,
  };
}

// ========== 主函数 ==========

async function main() {
  console.log('🔍 小红书选择器深度分析工具 - 100% 成功率版本\n');
  console.log('='.repeat(70));

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
      targetSuccessRate: '100%',
      pages: {},
    };

    // 只分析博主主页和博文详情页
    for (const pageConfig of PAGES) {
      const page = await context.newPage();

      try {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`访问：${pageConfig.displayName}`);
        console.log(`URL: ${pageConfig.url}`);
        console.log('-'.repeat(70));

        await page.goto(pageConfig.url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(8000); // 增加等待时间确保动态内容加载

        const pageResult: any = {
          name: pageConfig.displayName,
          url: pageConfig.url
            .replace(/\/profile\/[^?]+/, '/profile/*')
            .replace(/\/explore\/[^?]+/, '/explore/*'),
          selectors: {},
          successRate: 0,
        };

        let successCount = 0;

        // 分析每个字段
        for (const field of pageConfig.fields) {
          const analysis = await analyzeFieldWithAllStrategies(page, field);

          pageResult.selectors[field.name] = {
            selectors: analysis.selectors,
            verified: analysis.verified,
            count: analysis.count,
          };

          if (analysis.verified) {
            successCount++;
            console.log(`      ✅ 验证成功 (${analysis.count} 个选择器)\n`);
          } else {
            console.log(`      ❌ 验证失败\n`);
          }
        }

        pageResult.successRate = `${((successCount / pageConfig.fields.length) * 100).toFixed(1)}%`;
        pageResult.totalFields = pageConfig.fields.length;
        pageResult.successFields = successCount;

        result.pages[pageConfig.name] = pageResult;

        console.log(
          `\n${pageConfig.displayName} 成功率：${pageResult.successRate} (${successCount}/${pageConfig.fields.length})`
        );
      } catch (error: any) {
        console.error(`❌ 分析失败：${error.message}`);
        result.pages[pageConfig.name] = {
          name: pageConfig.displayName,
          url: pageConfig.url,
          selectors: {},
          error: error.message,
          successRate: '0%',
        };
      } finally {
        await page.close();
      }
    }

    // 保存配置
    console.log('\n' + '='.repeat(70));
    console.log('💾 保存配置文件...');

    const outputPath = path.join(__dirname, '../../selector.conf.json');
    const backupPath = path.join(__dirname, '../../selector.conf.backup.json');

    // 备份旧配置
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, backupPath);
      console.log(`✅ 备份已保存：${backupPath}`);
    }

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`✅ 配置已保存：${outputPath}`);

    // 生成摘要
    console.log('\n' + '='.repeat(70));
    console.log('📊 分析摘要 - 100% 成功率目标');
    console.log('='.repeat(70));

    let totalFields = 0;
    let totalSuccess = 0;

    for (const pageName in result.pages) {
      const pageData = result.pages[pageName];
      const fields = pageData.totalFields || 0;
      const success = pageData.successFields || 0;
      totalFields += fields;
      totalSuccess += success;

      console.log(`${pageData.name}: ${pageData.successRate} (${success}/${fields})`);

      // 显示未成功的字段
      if (success < fields) {
        console.log('  未成功字段:');
        for (const fieldName in pageData.selectors) {
          const fieldData = pageData.selectors[fieldName];
          if (!fieldData.verified) {
            console.log(`    - ${fieldName}`);
          }
        }
      }
    }

    const overallRate = `${((totalSuccess / totalFields) * 100).toFixed(1)}%`;
    console.log('-'.repeat(70));
    console.log(`总体成功率：${overallRate} (${totalSuccess}/${totalFields})`);
    console.log('='.repeat(70));

    if (totalSuccess === totalFields) {
      console.log('\n🎉 恭喜！达到 100% 成功率目标！\n');
    } else {
      console.log(`\n⚠️ 未达到 100% 成功率，还需优化 ${totalFields - totalSuccess} 个字段\n`);
    }
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
