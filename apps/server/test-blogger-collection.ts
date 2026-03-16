/**
 * 小红书博主信息采集功能测试
 *
 * 测试时间：2026-03-07 12:45 CST
 * 测试目标：验证博主信息采集功能完整性
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { XIAOHONGSHU_COOKIES } from '../../.workspace/config/xiaohongshu.cookies.js';
import { XiaohongshuScraper } from './src/services/xiaohongshu-scraper.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
  test: string;
  status: '✅' | '❌' | '⚠️';
  message: string;
  data?: any;
}

async function runTests() {
  console.log('🧪 开始小红书博主信息采集功能测试...\n');
  console.log('='.repeat(60));

  const results: TestResult[] = [];
  const startTime = Date.now();

  try {
    // ========== 测试 1: Cookie 加载 ==========
    console.log('\n【测试 1】Cookie 加载与验证');
    console.log('-'.repeat(40));

    try {
      const cookieCount = XIAOHONGSHU_COOKIES.length;
      console.log(`📊 Cookie 数量：${cookieCount}`);

      if (cookieCount > 0) {
        results.push({
          test: 'Cookie 配置',
          status: '✅',
          message: `成功加载 ${cookieCount} 个 Cookie`,
        });
      } else {
        results.push({
          test: 'Cookie 配置',
          status: '❌',
          message: 'Cookie 配置为空',
        });
      }
    } catch (error: any) {
      results.push({
        test: 'Cookie 配置',
        status: '❌',
        message: `加载失败：${error.message}`,
      });
    }

    // ========== 测试 2: 浏览器初始化 ==========
    console.log('\n【测试 2】浏览器初始化');
    console.log('-'.repeat(40));

    let browser;
    let context;
    let page;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });

      // 设置 Cookie
      const fixedCookies = XIAOHONGSHU_COOKIES.map((cookie) => ({
        ...cookie,
        sameSite: cookie.sameSite === 'unspecified' ? 'Lax' : cookie.sameSite,
      }));
      await context.addCookies(fixedCookies);

      page = await context.newPage();

      results.push({
        test: '浏览器初始化',
        status: '✅',
        message: 'Chromium 启动成功，Cookie 已设置',
      });
    } catch (error: any) {
      results.push({
        test: '浏览器初始化',
        status: '❌',
        message: `初始化失败：${error.message}`,
      });
      throw error;
    }

    // ========== 测试 3: 页面访问 ==========
    console.log('\n【测试 3】页面访问能力');
    console.log('-'.repeat(40));

    try {
      await page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      await page.waitForTimeout(3000);

      const title = await page.title();
      console.log(`📄 页面标题：${title}`);

      results.push({
        test: '页面访问',
        status: '✅',
        message: `成功访问小红书首页：${title}`,
      });
    } catch (error: any) {
      results.push({
        test: '页面访问',
        status: '❌',
        message: `访问失败：${error.message}`,
      });
    }

    // ========== 测试 4: 搜索功能 ==========
    console.log('\n【测试 4】搜索功能测试');
    console.log('-'.repeat(40));

    try {
      const searchKeyword = '博主';
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(searchKeyword)}`;

      await page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      await page.waitForTimeout(5000);

      // 检查是否有搜索结果
      const noteItems = await page.$$('section.note-item');
      console.log(`📊 找到 ${noteItems.length} 个笔记卡片`);

      if (noteItems.length > 0) {
        results.push({
          test: '搜索功能',
          status: '✅',
          message: `搜索"${searchKeyword}"成功，找到 ${noteItems.length} 个结果`,
        });
      } else {
        results.push({
          test: '搜索功能',
          status: '⚠️',
          message: '搜索完成但未找到结果',
        });
      }
    } catch (error: any) {
      results.push({
        test: '搜索功能',
        status: '❌',
        message: `搜索失败：${error.message}`,
      });
    }

    // ========== 测试 5: 选择器验证 ==========
    console.log('\n【测试 5】选择器验证');
    console.log('-'.repeat(40));

    try {
      const selectorTests = [
        { name: '笔记卡片', selector: 'section.note-item' },
        { name: '笔记标题', selector: '.note-item .title' },
        { name: '作者昵称', selector: '.note-item .author .name' },
        { name: '发布时间', selector: '.note-item .author .time' },
        { name: '点赞数', selector: '.note-item .like-wrapper .count' },
        { name: '作者头像', selector: '.note-item .author .author-avatar' },
      ];

      let passedCount = 0;

      for (const test of selectorTests) {
        try {
          const elements = await page.$$(test.selector);
          const status = elements.length > 0 ? '✅' : '⚠️';
          console.log(`  ${status} ${test.name}: ${elements.length} 个`);

          if (elements.length > 0) {
            passedCount++;
          }
        } catch (error: any) {
          console.log(`  ❌ ${test.name}: 错误 - ${error.message}`);
        }
      }

      results.push({
        test: '选择器验证',
        status: passedCount === selectorTests.length ? '✅' : '⚠️',
        message: `${passedCount}/${selectorTests.length} 选择器有效`,
      });
    } catch (error: any) {
      results.push({
        test: '选择器验证',
        status: '❌',
        message: `验证失败：${error.message}`,
      });
    }

    // ========== 测试 6: 数据采集 ==========
    console.log('\n【测试 6】数据采集测试');
    console.log('-'.repeat(40));

    try {
      const noteItems = await page.$$('section.note-item');
      const collectedData: any[] = [];

      for (let i = 0; i < Math.min(3, noteItems.length); i++) {
        const card = noteItems[i];

        try {
          const titleEl = await card.$('.title span');
          const nameEl = await card.$('.author .name');
          const timeEl = await card.$('.author .time');
          const likeEl = await card.$('.like-wrapper .count');
          const avatarEl = await card.$('.author .author-avatar');

          const data = {
            title: titleEl ? await titleEl.textContent() : 'N/A',
            author: nameEl ? await nameEl.textContent() : 'N/A',
            time: timeEl ? await timeEl.textContent() : 'N/A',
            likes: likeEl ? await likeEl.textContent() : 'N/A',
            avatar: avatarEl ? await avatarEl.getAttribute('src') : 'N/A',
          };

          collectedData.push(data);
          console.log(`  📝 笔记 ${i + 1}: ${data.title?.substring(0, 20)}...`);
        } catch (error: any) {
          console.log(`  ⚠️ 笔记 ${i + 1} 采集失败：${error.message}`);
        }
      }

      if (collectedData.length > 0) {
        results.push({
          test: '数据采集',
          status: '✅',
          message: `成功采集 ${collectedData.length} 个笔记数据`,
          data: collectedData,
        });
      } else {
        results.push({
          test: '数据采集',
          status: '❌',
          message: '未能采集到任何数据',
        });
      }
    } catch (error: any) {
      results.push({
        test: '数据采集',
        status: '❌',
        message: `采集失败：${error.message}`,
      });
    }

    // ========== 测试 7: 数据保存 ==========
    console.log('\n【测试 7】数据保存测试');
    console.log('-'.repeat(40));

    try {
      const reportDir = path.join(__dirname, '../../.workspace/tests');

      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(reportDir, `blogger-collection-test-${timestamp}.json`);

      const report = {
        testTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        results: results,
      };

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      results.push({
        test: '数据保存',
        status: '✅',
        message: `测试报告已保存：${path.basename(reportPath)}`,
      });

      console.log(`  📁 报告已保存：${reportPath}`);
    } catch (error: any) {
      results.push({
        test: '数据保存',
        status: '❌',
        message: `保存失败：${error.message}`,
      });
    }

    // ========== 清理 ==========
    if (browser) {
      await browser.close();
    }
  } catch (error: any) {
    console.error('\n❌ 测试过程中发生错误:', error.message);
    results.push({
      test: '整体测试',
      status: '❌',
      message: `测试中断：${error.message}`,
    });
  }

  // ========== 生成测试报告 ==========
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试报告汇总');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.status === '✅').length;
  const warning = results.filter((r) => r.status === '⚠️').length;
  const failed = results.filter((r) => r.status === '❌').length;

  console.log(`\n总测试项：${results.length}`);
  console.log(`✅ 通过：${passed}`);
  console.log(`⚠️  警告：${warning}`);
  console.log(`❌ 失败：${failed}`);
  console.log(`⏱️  耗时：${((Date.now() - startTime) / 1000).toFixed(2)}秒\n`);

  console.log('详细结果:');
  for (const result of results) {
    console.log(`  ${result.status} ${result.test}: ${result.message}`);
  }

  // 生成 Markdown 报告
  const markdownReport = generateMarkdownReport(results, startTime);
  const reportPath = path.join(
    __dirname,
    '../../.workspace/tests/BLOGGER_COLLECTION_TEST_2026-03-07.md'
  );
  fs.writeFileSync(reportPath, markdownReport);
  console.log(`\n📄 详细报告：${reportPath}`);

  // 返回测试结果
  return { passed, warning, failed, total: results.length };
}

function generateMarkdownReport(results: TestResult[], startTime: number): string {
  const passed = results.filter((r) => r.status === '✅').length;
  const warning = results.filter((r) => r.status === '⚠️').length;
  const failed = results.filter((r) => r.status === '❌').length;

  return `# 🧪 小红书博主信息采集功能测试报告

**测试时间**: ${new Date().toISOString()}  
**测试耗时**: ${((Date.now() - startTime) / 1000).toFixed(2)}秒  
**测试状态**: ${failed === 0 ? '✅ 通过' : '❌ 失败'}

---

## 📊 测试结果汇总

| 状态 | 数量 | 百分比 |
|------|------|--------|
| ✅ 通过 | ${passed} | ${((passed / results.length) * 100).toFixed(1)}% |
| ⚠️ 警告 | ${warning} | ${((warning / results.length) * 100).toFixed(1)}% |
| ❌ 失败 | ${failed} | ${((failed / results.length) * 100).toFixed(1)}% |
| **总计** | **${results.length}** | **100%** |

---

## 📋 详细测试结果

| 测试项 | 状态 | 结果说明 |
|--------|------|----------|
${results.map((r) => `| ${r.test} | ${r.status} | ${r.message} |`).join('\n')}

---

## ✅ 测试结论

${failed === 0 ? '所有测试项均通过，博主信息采集功能运行正常！' : `有 ${failed} 个测试项失败，需要进一步检查和修复。`}

---

**生成时间**: ${new Date().toISOString()}
`;
}

// 运行测试
runTests()
  .then((result) => {
    console.log('\n✅ 测试完成！');
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  });
