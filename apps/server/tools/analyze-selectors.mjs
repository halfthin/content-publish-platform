/**
 * 小红书页面结构分析器
 * 
 * 功能：访问小红书关键页面，分析 DOM 结构，生成选择器配置
 * 
 * 使用：bun tools/analyze-selectors.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Cookie 配置
const VALID_COOKIES = [
  { name: "a1", value: "199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821", domain: ".xiaohongshu.com", path: "/" },
  { name: "id_token", value: "VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg", domain: ".xiaohongshu.com", path: "/" },
  { name: "web_session", value: "040069b557e75f10f74b91dd9f3b4b6a3ce9e5", domain: ".xiaohongshu.com", path: "/" },
  { name: "xsecappid", value: "xhs-pc-web", domain: ".xiaohongshu.com", path: "/" },
  { name: "webId", value: "e848b3ccac9c3f57790ef018a6fb43fd", domain: ".xiaohongshu.com", path: "/" },
];

// 目标页面配置
const PAGES = [
  {
    name: 'home',
    displayName: '首页',
    url: 'https://www.xiaohongshu.com/explore',
    targets: ['noteCard', 'noteTitle', 'noteLink', 'authorName', 'authorLink', 'searchInput', 'searchButton'],
  },
  {
    name: 'search',
    displayName: '搜索结果页',
    url: 'https://www.xiaohongshu.com/search_result?keyword=穿搭&source=web_search_result_notes',
    targets: ['noteCard', 'noteTitle', 'noteLink', 'authorName', 'authorLink'],
  },
  {
    name: 'userProfile',
    displayName: '博主主页',
    url: 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708',
    targets: ['nickname', 'userId', 'ipLocation', 'followCount', 'fansCount', 'likesCount', 'noteCard', 'noteTitle'],
  },
  {
    name: 'noteDetail',
    displayName: '博文详情页',
    url: null, // 需要从搜索结果中获取
    targets: ['images', 'title', 'content', 'likeCount', 'collectCount', 'commentCount'],
  },
];

// 选择器生成策略
const SELECTOR_STRATEGIES = {
  noteCard: ['.note-item', '.search-result-item', '.note-card', '[class*="note-item"]', '[class*="note-card"]'],
  noteTitle: ['.note-title', '.title', '[class*="title"]', '[class*="note-title"]', 'h3[class*="title"]'],
  noteLink: ['a[href*="/explore/"]', 'a.note-link', '.note-item a', '[class*="note"] a[href*="/"]'],
  authorName: ['.author .name', '.author-name', '[class*="author"] .name', '[class*="nickname"]', '.nickname'],
  authorLink: ['.author[href*="/user/profile/"]', 'a[href*="/user/profile/"]', '.author a'],
  searchInput: ['input[placeholder*="搜索"]', 'input#search-input', '[class*="search"] input', 'input[type="text"]'],
  searchButton: ['button[class*="search"]', '.search-btn', 'button:has-text("搜索")', '[class*="search"] button'],
  nickname: ['.user-nickname', '.nickname', '[class*="nickname"]', '[class*="user-name"]', '.user-name'],
  userId: ['.user-id', '.red-id', '[class*="user-id"]', '[class*="red-id"]'],
  ipLocation: ['[class*="ip"]', '[class*="location"]', '.ip-location', '[class*="ip-location"]'],
  followCount: ['.follow-count', '[class*="follow"]', '.following-count', '[class*="following"]'],
  fansCount: ['.fans-count', '[class*="fan"]', '.followers-count', '[class*="follower"]'],
  likesCount: ['.likes-count', '.total-favorites', '[class*="like"]', '[class*="favorite"]'],
  images: ['[class*="image"] img', '.note-image img', 'img[class*="image"]', '[class*="img"] img'],
  content: ['.note-content', '.content', '[class*="content"]', '.desc', '[class*="desc"]'],
  likeCount: ['.like-count', '[class*="like"] .count', '.likes', '[class*="like-count"]'],
  collectCount: ['.collect-count', '[class*="collect"] .count', '.collects', '[class*="collect-count"]'],
  commentCount: ['.comment-count', '[class*="comment"] .count', '.comments', '[class*="comment-count"]'],
};

async function analyzePage(page, pageName, targets) {
  console.log(`\n📊 分析页面：${pageName}`);
  console.log('='.repeat(50));
  
  const selectors = {};
  
  for (const target of targets) {
    const strategies = SELECTOR_STRATEGIES[target] || [];
    let foundSelector = null;
    let elementCount = 0;
    
    for (const selector of strategies) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          foundSelector = selector;
          elementCount = elements.length;
          console.log(`  ✅ ${target}: ${selector} (${elementCount} 个元素)`);
          break;
        }
      } catch (error) {
        // ignore
      }
    }
    
    if (foundSelector) {
      selectors[target] = {
        selector: foundSelector,
        count: elementCount,
        alternatives: strategies,
      };
    } else {
      console.log(`  ❌ ${target}: 未找到匹配元素`);
      selectors[target] = {
        selector: null,
        count: 0,
        alternatives: strategies,
      };
    }
  }
  
  return selectors;
}

async function main() {
  console.log('🚀 开始分析小红书页面结构...\n');
  
  const results = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    pages: {},
  };
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('✅ 浏览器启动成功\n');
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    console.log('✅ Cookie 已设置\n');
    
    const page = await context.newPage();
    
    // 分析各个页面
    for (const pageInfo of PAGES) {
      if (!pageInfo.url) {
        console.log(`⏭️ 跳过页面：${pageInfo.displayName} (无 URL)\n`);
        continue;
      }
      
      try {
        console.log(`\n=== 访问：${pageInfo.displayName} ===`);
        console.log(`URL: ${pageInfo.url}\n`);
        
        await page.goto(pageInfo.url, {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await page.waitForTimeout(10000);
        
        // 分析页面
        const selectors = await analyzePage(page, pageInfo.displayName, pageInfo.targets);
        
        results.pages[pageInfo.name] = {
          name: pageInfo.displayName,
          url: pageInfo.url,
          selectors: selectors,
          analyzedAt: new Date().toISOString(),
        };
        
      } catch (error) {
        console.log(`❌ 访问失败：${error.message}\n`);
        results.pages[pageInfo.name] = {
          name: pageInfo.displayName,
          url: pageInfo.url,
          error: error.message,
          selectors: {},
        };
      }
    }
    
    // 生成配置文件
    console.log('\n=== 生成配置文件 ===\n');
    
    const configDir = '/home/halfthin/dev/sop/content-publish-platform';
    const configFile = path.join(configDir, 'selector.conf.json');
    
    // 简化配置格式
    const simplifiedConfig = {
      version: results.version,
      generatedAt: results.generatedAt,
      pages: {},
    };
    
    for (const [pageName, pageData] of Object.entries(results.pages)) {
      if (pageData.error) {
        console.log(`⚠️ 跳过页面：${pageName} (分析失败)`);
        continue;
      }
      
      simplifiedConfig.pages[pageName] = {
        name: pageData.name,
        url: pageData.url,
        selectors: {},
      };
      
      for (const [targetName, targetData] of Object.entries(pageData.selectors)) {
        simplifiedConfig.pages[pageName].selectors[targetName] = targetData.alternatives;
      }
      
      console.log(`✅ 页面：${pageName} - ${Object.keys(pageData.selectors).length} 个选择器`);
    }
    
    // 保存配置
    fs.writeFileSync(configFile, JSON.stringify(simplifiedConfig, null, 2));
    console.log(`\n✅ 配置文件已保存到：${configFile}\n`);
    
    // 生成报告
    const reportDir = '/home/halfthin/dev/sop/content-publish-platform/.workspace/tests';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, 'selector-analysis-report.md');
    const report = generateReport(results, simplifiedConfig);
    fs.writeFileSync(reportFile, report);
    console.log(`✅ 测试报告已保存到：${reportFile}\n`);
    
    // 打印摘要
    console.log('=== 分析摘要 ===');
    console.log(`总页面数：${Object.keys(results.pages).length}`);
    console.log(`成功页面：${Object.keys(simplifiedConfig.pages).length}`);
    console.log(`总选择器数：${Object.values(simplifiedConfig.pages).reduce((sum, p) => sum + Object.keys(p.selectors).length, 0)}`);
    
    await browser.close();
    console.log('\n✅ 分析完成！');
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

function generateReport(results, config) {
  let report = `# 📊 小红书页面结构分析报告\n\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n`;
  report += `**版本**: ${config.version}\n\n`;
  
  report += `## 1. 分析结果\n\n`;
  
  for (const [pageName, pageData] of Object.entries(config.pages)) {
    report += `### ${pageData.name}\n\n`;
    report += `**URL**: ${pageData.url}\n\n`;
    report += `| 目标元素 | 选择器 |\n`;
    report += `|----------|--------|\n`;
    
    for (const [targetName, selectors] of Object.entries(pageData.selectors)) {
      report += `| ${targetName} | \`${selectors[0] || '未找到'}\` |\n`;
    }
    
    report += `\n`;
  }
  
  report += `## 2. 配置文件\n\n`;
  report += `**位置**: \`selector.conf.json\`\n\n`;
  report += `**结构**:\n`;
  report += `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n`;
  
  report += `## 3. 使用建议\n\n`;
  report += `1. 优先使用每个目标的第一个选择器（最稳定）\n`;
  report += `2. 如果第一个选择器失效，尝试备选选择器\n`;
  report += `3. 定期验证选择器有效性\n`;
  report += `4. 关注小红书页面结构变化\n\n`;
  
  report += `---\n\n`;
  report += `**报告生成**: 小红书页面结构分析器 v1.0.0\n`;
  
  return report;
}

main();
