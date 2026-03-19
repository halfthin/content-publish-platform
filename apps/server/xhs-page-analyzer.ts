#!/usr/bin/env bun

/**
 * 小红书页面结构分析器 - 主入口
 *
 * 功能:
 * - 自动捕获页面 DOM 结构
 * - 分析元素层级关系
 * - 生成选择器建议
 * - 输出可视化报告
 *
 * 使用示例:
 *   bun xhs-page-analyzer.ts --page search --keyword "博主"
 *   bun xhs-page-analyzer.ts --page profile --userId "xxx"
 *   bun xhs-page-analyzer.ts --page note --noteId "xxx"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { XIAOHONGSHU_COOKIES } from '../../.workspace/config/xiaohongshu.cookies.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 类型定义 ==========

interface AnalyzerConfig {
  pageType: 'search' | 'profile' | 'note';
  keyword?: string;
  userId?: string;
  noteId?: string;
  outputDir: string;
  headless: boolean;
  waitTime: number;
}

interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  classes: string[];
  attributes: Record<string, string>;
  text?: string;
  children: ElementInfo[];
  depth: number;
  selector: string;
}

interface SelectorSuggestion {
  field: string;
  selectors: string[];
  confidence: number;
  stability: 'high' | 'medium' | 'low';
}

interface AnalysisResult {
  pageType: string;
  timestamp: string;
  url: string;
  title: string;
  elementCount: number;
  domStructure: ElementInfo | null;
  selectors: SelectorSuggestion[];
  statistics: {
    totalElements: number;
    uniqueClasses: number;
    maxDepth: number;
    interactiveElements: number;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

// ========== 参数解析 ==========

function parseArgs(): AnalyzerConfig {
  const args = process.argv.slice(2);
  const config: AnalyzerConfig = {
    pageType: 'search',
    outputDir: path.join(__dirname, '../../.workspace/debug'),
    headless: true,
    waitTime: 5000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--page':
        config.pageType = args[++i] as 'search' | 'profile' | 'note';
        break;
      case '--keyword':
        config.keyword = args[++i];
        break;
      case '--userId':
        config.userId = args[++i];
        break;
      case '--noteId':
        config.noteId = args[++i];
        break;
      case '--output':
        config.outputDir = args[++i];
        break;
      case '--headless':
        config.headless = args[++i] !== 'false';
        break;
      case '--wait':
        config.waitTime = parseInt(args[++i], 10);
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
🔍 小红书页面结构分析器

用法: bun xhs-page-analyzer.ts [选项]

选项:
  --page <type>     页面类型 (search|profile|note), 默认：search
  --keyword <word>  搜索关键词 (search 页面需要)
  --userId <id>     用户 ID (profile 页面需要)
  --noteId <id>     笔记 ID (note 页面需要)
  --output <dir>    输出目录，默认：.workspace/debug/
  --headless <bool> 无头模式，默认：true
  --wait <ms>       等待时间 (毫秒), 默认：5000
  --help            显示帮助信息

示例:
  bun xhs-page-analyzer.ts --page search --keyword "博主"
  bun xhs-page-analyzer.ts --page profile --userId "5d2d3e4f000000001200350a"
  bun xhs-page-analyzer.ts --page note --noteId "65e8f9a00000000012034bcd"
`);
}

// ========== DOM 捕获模块 ==========

async function captureDOM(page: Page, _config: AnalyzerConfig): Promise<ElementInfo | null> {
  console.log('🔍 捕获 DOM 结构...');

  return await page.evaluate(() => {
    function getElementSelector(element: Element): string {
      if (element.id) {
        return `#${element.id}`;
      }

      let selector = element.tagName.toLowerCase();

      if (element.className && typeof element.className === 'string') {
        const classes = element.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.startsWith('['));
        if (classes.length > 0) {
          selector += `.${classes.slice(0, 3).join('.')}`;
        }
      }

      if (element.hasAttribute('data-e2e')) {
        selector += `[data-e2e="${element.getAttribute('data-e2e')}"]`;
      }

      return selector;
    }

    function extractElementInfo(element: Element, depth: number = 0): ElementInfo | null {
      if (depth > 10) return null; // 限制深度

      const classes =
        element.className && typeof element.className === 'string'
          ? element.className
              .trim()
              .split(/\s+/)
              .filter((c) => c)
          : [];

      const attributes: Record<string, string> = {};
      for (const attr of Array.from(element.attributes)) {
        if (!['class', 'style', 'src'].includes(attr.name)) {
          attributes[attr.name] = attr.value;
        }
      }

      const children: ElementInfo[] = [];
      for (const child of Array.from(element.children)) {
        const childInfo = extractElementInfo(child, depth + 1);
        if (childInfo) {
          children.push(childInfo);
        }
      }

      return {
        tagName: element.tagName.toLowerCase(),
        id: element.id || undefined,
        className:
          element.className && typeof element.className === 'string'
            ? element.className.trim()
            : undefined,
        classes,
        attributes,
        text: element.textContent?.trim().slice(0, 100) || undefined,
        children,
        depth,
        selector: getElementSelector(element),
      };
    }

    // 查找主要内容区域
    const mainContent = document.querySelector('body');
    if (!mainContent) return null;

    return extractElementInfo(mainContent, 0);
  });
}

// ========== 结构分析模块 ==========

function analyzeStructure(domStructure: ElementInfo | null): AnalysisResult['statistics'] {
  let totalElements = 0;
  let maxDepth = 0;
  const classes = new Set<string>();
  let interactiveElements = 0;

  function traverse(element: ElementInfo | null) {
    if (!element) return;

    totalElements++;
    if (element.depth > maxDepth) maxDepth = element.depth;

    element.classes.forEach((c) => {
      classes.add(c);
    });

    if (['button', 'a', 'input', 'select'].includes(element.tagName)) {
      interactiveElements++;
    }

    element.children.forEach(traverse);
  }

  traverse(domStructure);

  return {
    totalElements,
    uniqueClasses: classes.size,
    maxDepth,
    interactiveElements,
  };
}

// ========== 选择器生成模块 ==========

function generateSelectors(
  domStructure: ElementInfo | null,
  pageType: string
): SelectorSuggestion[] {
  const suggestions: SelectorSuggestion[] = [];

  if (!domStructure) return suggestions;

  function findElements(element: ElementInfo, targetClass: string): string[] {
    const selectors: string[] = [];

    if (element.classes.some((c) => c.includes(targetClass))) {
      selectors.push(element.selector);
    }

    element.children.forEach((child) => {
      selectors.push(...findElements(child, targetClass));
    });

    return selectors;
  }

  // 根据页面类型生成选择器
  if (pageType === 'search') {
    suggestions.push({
      field: 'noteCard',
      selectors: findElements(domStructure, 'note'),
      confidence: 0.9,
      stability: 'high',
    });

    suggestions.push({
      field: 'noteTitle',
      selectors: findElements(domStructure, 'title'),
      confidence: 0.85,
      stability: 'high',
    });

    suggestions.push({
      field: 'authorName',
      selectors: findElements(domStructure, 'author'),
      confidence: 0.85,
      stability: 'high',
    });

    suggestions.push({
      field: 'likeCount',
      selectors: findElements(domStructure, 'like'),
      confidence: 0.8,
      stability: 'medium',
    });
  } else if (pageType === 'profile') {
    suggestions.push({
      field: 'userInfo',
      selectors: findElements(domStructure, 'user'),
      confidence: 0.9,
      stability: 'high',
    });

    suggestions.push({
      field: 'followerCount',
      selectors: findElements(domStructure, 'fan'),
      confidence: 0.85,
      stability: 'high',
    });
  }

  return suggestions;
}

// ========== 报告生成模块 ==========

function generateMarkdownReport(result: AnalysisResult): string {
  return `# 🔍 小红书页面结构分析报告

**页面类型**: ${result.pageType}  
**分析时间**: ${result.timestamp}  
**页面 URL**: ${result.url}  
**页面标题**: ${result.title}

---

## 📊 统计信息

| 指标 | 数值 |
|------|------|
| 元素总数 | ${result.statistics.totalElements} |
| 唯一类名 | ${result.statistics.uniqueClasses} |
| 最大深度 | ${result.statistics.maxDepth} |
| 交互元素 | ${result.statistics.interactiveElements} |

---

## 🎯 选择器建议

${result.selectors
  .map(
    (s) => `
### ${s.field}
- **置信度**: ${(s.confidence * 100).toFixed(0)}%
- **稳定性**: ${s.stability === 'high' ? '高' : s.stability === 'medium' ? '中' : '低'}
- **推荐选择器**:
${s.selectors
  .slice(0, 5)
  .map((sel) => `  - \`${sel}\``)
  .join('\n')}
`
  )
  .join('\n')}

---

## 📁 DOM 结构

\`\`\`json
${JSON.stringify(result.domStructure, null, 2).slice(0, 5000)}...
\`\`\`

---

**生成时间**: ${new Date().toISOString()}
`;
}

function generateHTMLReport(result: AnalysisResult): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>小红书页面结构分析 - ${result.pageType}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #ff2442; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .stat-card { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #ff2442; }
    .selector-group { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
    .selector { font-family: monospace; background: #f0f0f0; padding: 5px 10px; margin: 5px 0; display: block; }
    .confidence-high { color: green; }
    .confidence-medium { color: orange; }
    .confidence-low { color: red; }
  </style>
</head>
<body>
  <h1>🔍 小红书页面结构分析</h1>
  <p><strong>页面类型:</strong> ${result.pageType} | <strong>时间:</strong> ${result.timestamp}</p>
  
  <h2>📊 统计信息</h2>
  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">${result.statistics.totalElements}</div>
      <div>元素总数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${result.statistics.uniqueClasses}</div>
      <div>唯一类名</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${result.statistics.maxDepth}</div>
      <div>最大深度</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${result.statistics.interactiveElements}</div>
      <div>交互元素</div>
    </div>
  </div>

  <h2>🎯 选择器建议</h2>
  ${result.selectors
    .map(
      (s) => `
    <div class="selector-group">
      <h3>${s.field}</h3>
      <p>置信度：<span class="confidence-${s.stability}">${(s.confidence * 100).toFixed(0)}%</span> | 稳定性：${s.stability}</p>
      ${s.selectors
        .slice(0, 5)
        .map((sel) => `<code class="selector">${sel}</code>`)
        .join('')}
    </div>
  `
    )
    .join('')}

  <h2>📁 DOM 结构 (JSON)</h2>
  <pre style="background: #f5f5f5; padding: 15px; overflow: auto; max-height: 500px;">
${JSON.stringify(result.domStructure, null, 2).slice(0, 10000)}
  </pre>
</body>
</html>
`;
}

// ========== 主函数 ==========

async function main() {
  const config = parseArgs();
  console.log('🚀 小红书页面结构分析器启动\n');
  console.log('='.repeat(60));
  console.log(`页面类型：${config.pageType}`);
  console.log(`输出目录：${config.outputDir}`);
  console.log(`无头模式：${config.headless}`);
  console.log(`${'='.repeat(60)}\n`);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // 创建输出目录
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // 启动浏览器
    console.log('🌐 启动浏览器...');
    browser = await chromium.launch({
      headless: config.headless,
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

    page = await context.newPage();

    // 访问页面
    let targetUrl = '';
    switch (config.pageType) {
      case 'search':
        targetUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(config.keyword || '博主')}`;
        break;
      case 'profile':
        targetUrl = `https://www.xiaohongshu.com/user/profile/${config.userId || '5d2d3e4f000000001200350a'}`;
        break;
      case 'note':
        targetUrl = `https://www.xiaohongshu.com/explore/${config.noteId || '65e8f9a00000000012034bcd'}`;
        break;
    }

    console.log(`📍 访问页面：${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });

    console.log(`⏳ 等待 ${config.waitTime}ms...`);
    await page.waitForTimeout(config.waitTime);

    const title = await page.title();
    console.log(`📄 页面标题：${title}`);

    // 捕获 DOM
    const domStructure = await captureDOM(page, config);

    // 分析结构
    console.log('📊 分析 DOM 结构...');
    const statistics = analyzeStructure(domStructure);

    // 生成选择器
    console.log('🎯 生成选择器建议...');
    const selectors = generateSelectors(domStructure, config.pageType);

    // 生成结果
    const result: AnalysisResult = {
      pageType: config.pageType,
      timestamp: new Date().toISOString(),
      url: page.url(),
      title,
      elementCount: statistics.totalElements,
      domStructure,
      selectors,
      statistics,
    };

    // 保存报告
    console.log('\n💾 保存报告...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // JSON 报告
    const jsonPath = path.join(
      config.outputDir,
      `dom-structure-${config.pageType}-${timestamp}.json`
    );
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    console.log(`  ✅ JSON: ${path.basename(jsonPath)}`);

    // Markdown 报告
    const mdPath = path.join(
      config.outputDir,
      `analysis-report-${config.pageType}-${timestamp}.md`
    );
    fs.writeFileSync(mdPath, generateMarkdownReport(result));
    console.log(`  ✅ Markdown: ${path.basename(mdPath)}`);

    // HTML 报告
    const htmlPath = path.join(
      config.outputDir,
      `element-tree-${config.pageType}-${timestamp}.html`
    );
    fs.writeFileSync(htmlPath, generateHTMLReport(result));
    console.log(`  ✅ HTML: ${path.basename(htmlPath)}`);

    // 选择器配置
    const selectorsPath = path.join(
      config.outputDir,
      `selectors-${config.pageType}-${timestamp}.json`
    );
    fs.writeFileSync(selectorsPath, JSON.stringify(result.selectors, null, 2));
    console.log(`  ✅ 选择器：${path.basename(selectorsPath)}`);

    // 打印摘要
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 分析摘要');
    console.log('='.repeat(60));
    console.log(`元素总数：${statistics.totalElements}`);
    console.log(`唯一类名：${statistics.uniqueClasses}`);
    console.log(`最大深度：${statistics.maxDepth}`);
    console.log(`交互元素：${statistics.interactiveElements}`);
    console.log(`选择器建议：${selectors.length} 个`);
    console.log('='.repeat(60));

    console.log('\n✅ 分析完成！\n');
  } catch (error: unknown) {
    console.error('\n❌ 分析失败:', getErrorMessage(error));
    const stack = getErrorStack(error);
    if (stack) {
      console.error(stack);
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

// 运行
main();
