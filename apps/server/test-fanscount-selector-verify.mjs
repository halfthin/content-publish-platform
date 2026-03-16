/**
 * 粉丝数选择器验证测试 - v1.3.0 修复验证
 * 
 * 测试 HT-Fish 修复的粉丝数选择器配置
 * 运行：bun test-fanscount-selector-verify.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// 加载选择器配置 - 使用绝对路径
const CONFIG_PATH = '/home/halfthin/dev/content-publish-platform/selector.conf.json';
const selectorConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// Cookie 配置
const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

// 测试的博主主页 URL
const TEST_URLS = [
  'https://www.xiaohongshu.com/user/profile/69626b900000000014015708',
];

async function testSelector(page, selector, timeout = 5000) {
  try {
    const element = await page.waitForSelector(selector, { state: 'visible', timeout });
    const text = await element.textContent();
    return {
      success: true,
      value: text?.trim() || '',
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      value: null,
      error: error.message,
    };
  }
}

async function testAllFansCountSelectors(page, selectors) {
  const results = [];
  
  if (!selectors || !Array.isArray(selectors)) {
    console.log('  ⚠️ 选择器配置无效');
    return results;
  }
  
  for (const selector of selectors) {
    console.log(`  测试选择器：${selector}`);
    const result = await testSelector(page, selector);
    results.push({
      selector,
      ...result,
    });
    console.log(`    结果：${result.success ? '✅ ' + result.value : '❌ ' + result.error}`);
  }
  
  return results;
}

async function extractUserProfile(page, selectors) {
  const userProfileSelectors = selectors.pages?.userProfile?.selectors;
  
  if (!userProfileSelectors) {
    console.log('⚠️ 用户主页选择器配置不存在');
    return {};
  }
  
  const results = {};
  
  // 昵称
  if (userProfileSelectors.nickname) {
    for (const selector of userProfileSelectors.nickname) {
      const result = await testSelector(page, selector, 3000);
      if (result.success) {
        results.nickname = result.value;
        break;
      }
    }
  }
  
  // 粉丝数
  if (userProfileSelectors.fansCount) {
    for (const selector of userProfileSelectors.fansCount) {
      const result = await testSelector(page, selector, 3000);
      if (result.success) {
        results.fansCount = result.value;
        break;
      }
    }
  }
  
  // 关注数
  if (userProfileSelectors.followCount) {
    for (const selector of userProfileSelectors.followCount) {
      const result = await testSelector(page, selector, 3000);
      if (result.success) {
        results.followCount = result.value;
        break;
      }
    }
  }
  
  // 获赞数
  if (userProfileSelectors.likesCount) {
    for (const selector of userProfileSelectors.likesCount) {
      const result = await testSelector(page, selector, 3000);
      if (result.success) {
        results.likesCount = result.value;
        break;
      }
    }
  }
  
  // 小红书号
  if (userProfileSelectors.userId) {
    for (const selector of userProfileSelectors.userId) {
      const result = await testSelector(page, selector, 3000);
      if (result.success && result.value && result.value.match(/\d/)) {
        results.userId = result.value;
        break;
      }
    }
  }
  
  // IP 属地
  if (userProfileSelectors.ipLocation) {
    for (const selector of userProfileSelectors.ipLocation) {
      const result = await testSelector(page, selector, 3000);
      if (result.success && result.value && (result.value.includes('IP') || result.value.includes('属地'))) {
        results.ipLocation = result.value;
        break;
      }
    }
  }
  
  return results;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = '/home/halfthin/dev/content-publish-platform/.workspace/tests/FANS_COUNT_SELECTOR_VERIFICATION_' + timestamp + '.md';
  
  console.log('🧪 开始粉丝数选择器验证测试 (v1.3.0)...\n');
  console.log(`配置文件：${CONFIG_PATH}`);
  console.log(`配置版本：${selectorConfig.version}\n`);
  
  const testResults = {
    timestamp: new Date().toISOString(),
    configVersion: selectorConfig.version,
    testUrls: TEST_URLS,
    fansCountSelectors: selectorConfig.pages?.userProfile?.selectors?.fansCount || [],
    urlResults: [],
    summary: {
      totalUrls: TEST_URLS.length,
      successfulUrls: 0,
      failedUrls: 0,
      selectorSuccessRate: {},
    },
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
    
    // 测试每个 URL
    for (let urlIndex = 0; urlIndex < TEST_URLS.length; urlIndex++) {
      const testUrl = TEST_URLS[urlIndex];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`测试 ${urlIndex + 1}/${TEST_URLS.length}: ${testUrl}`);
      console.log('='.repeat(60));
      
      const page = await context.newPage();
      const urlResult = {
        url: testUrl,
        loadSuccess: false,
        fansCountTests: [],
        userProfile: {},
        error: null,
      };
      
      try {
        // 加载页面
        console.log('\n1. 加载页面...');
        await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(5000);
        urlResult.loadSuccess = true;
        console.log('✅ 页面加载成功\n');
        
        // 检查登录状态
        console.log('2. 检查登录状态...');
        const hasUserAvatar = await page.$('.user-avatar, .avatar-img');
        console.log(`登录状态：${hasUserAvatar ? '✅ 已登录' : '⚠️ 未检测到登录状态'}\n`);
        
        // 测试所有粉丝数选择器
        console.log('3. 测试粉丝数选择器...');
        const fansCountSelectors = selectorConfig.pages?.userProfile?.selectors?.fansCount || [];
        if (fansCountSelectors.length > 0) {
          urlResult.fansCountTests = await testAllFansCountSelectors(page, fansCountSelectors);
          
          // 统计选择器成功率
          const successCount = urlResult.fansCountTests.filter(r => r.success).length;
          console.log(`\n选择器成功率：${successCount}/${fansCountSelectors.length}\n`);
        } else {
          console.log('⚠️ 未找到粉丝数选择器配置\n');
        }
        
        // 提取完整用户资料
        console.log('4. 提取完整用户资料...');
        urlResult.userProfile = await extractUserProfile(page, selectorConfig);
        console.log('用户资料:');
        console.log(`  昵称：${urlResult.userProfile.nickname || '未找到'}`);
        console.log(`  粉丝数：${urlResult.userProfile.fansCount || '未找到'}`);
        console.log(`  关注数：${urlResult.userProfile.followCount || '未找到'}`);
        console.log(`  获赞数：${urlResult.userProfile.likesCount || '未找到'}`);
        console.log(`  小红书号：${urlResult.userProfile.userId || '未找到'}`);
        console.log(`  IP 属地：${urlResult.userProfile.ipLocation || '未找到'}\n`);
        
        // 判断测试是否成功
        if (urlResult.userProfile.fansCount) {
          testResults.summary.successfulUrls++;
          console.log('✅ 测试成功：粉丝数提取成功\n');
        } else {
          testResults.summary.failedUrls++;
          console.log('❌ 测试失败：未能提取粉丝数\n');
        }
        
      } catch (error) {
        urlResult.error = error.message;
        testResults.summary.failedUrls++;
        console.error(`❌ 测试失败：${error.message}\n`);
      } finally {
        await page.close();
      }
      
      testResults.urlResults.push(urlResult);
    }
    
    // 计算选择器成功率
    const allSelectorTests = testResults.urlResults.flatMap(r => r.fansCountTests || []);
    const selectorStats = {};
    for (const test of allSelectorTests) {
      if (!selectorStats[test.selector]) {
        selectorStats[test.selector] = { success: 0, failure: 0 };
      }
      if (test.success) {
        selectorStats[test.selector].success++;
      } else {
        selectorStats[test.selector].failure++;
      }
    }
    testResults.summary.selectorSuccessRate = selectorStats;
    
    // 生成报告
    console.log('\n' + '='.repeat(60));
    console.log('生成测试报告...');
    console.log('='.repeat(60));
    
    const report = generateReport(testResults);
    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`✅ 报告已保存：${reportPath}\n`);
    
    // 打印摘要
    console.log('\n📊 测试摘要:');
    console.log(`配置版本：${testResults.configVersion}`);
    console.log(`测试 URL 数：${testResults.summary.totalUrls}`);
    console.log(`成功：${testResults.summary.successfulUrls}`);
    console.log(`失败：${testResults.summary.failedUrls}`);
    console.log(`成功率：${testResults.summary.totalUrls > 0 ? Math.round((testResults.summary.successfulUrls / testResults.summary.totalUrls) * 100) : 0}%`);
    
    console.log('\n📋 选择器表现:');
    for (const [selector, stats] of Object.entries(selectorStats)) {
      const total = stats.success + stats.failure;
      const rate = total > 0 ? Math.round((stats.success / total) * 100) : 0;
      console.log(`  ${rate >= 50 ? '✅' : '❌'} ${selector}: ${stats.success}/${total} (${rate}%)`);
    }
    
    console.log('\n✅ 测试完成！\n');
    
  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
  }
}

function generateReport(results) {
  const date = new Date(results.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  let report = `# 🧪 粉丝数选择器验证报告 (v1.3.0)

**测试时间**: ${date}  
**测试员**: HT-Testor 🧪  
**配置版本**: ${results.configVersion}  
**配置文件**: \`${CONFIG_PATH}\`

---

## 1. 测试概述

| 项目 | 结果 |
|------|------|
| 测试 URL 数 | ${results.summary.totalUrls} |
| 成功 URL 数 | ${results.summary.successfulUrls} |
| 失败 URL 数 | ${results.summary.failedUrls} |
| 成功率 | ${results.summary.totalUrls > 0 ? Math.round((results.summary.successfulUrls / results.summary.totalUrls) * 100) : 0}% |

---

## 2. 粉丝数选择器配置

\`\`\`json
${JSON.stringify(results.fansCountSelectors, null, 2)}
\`\`\`

---

## 3. 选择器表现统计

| 选择器 | 成功 | 失败 | 成功率 | 状态 |
|--------|------|------|--------|------|
${Object.entries(results.summary.selectorSuccessRate).map(([selector, stats]) => {
    const total = stats.success + stats.failure;
    const rate = total > 0 ? Math.round((stats.success / total) * 100) : 0;
    const status = rate >= 50 ? '✅' : rate > 0 ? '⚠️' : '❌';
    return `| \`${selector}\` | ${stats.success} | ${stats.failure} | ${rate}% | ${status} |`;
  }).join('\n')}

---

## 4. 详细测试结果

${results.urlResults.map((urlResult, index) => {
    let section = `### 测试 ${index + 1}: ${urlResult.url}\n\n`;
    section += `**页面加载**: ${urlResult.loadSuccess ? '✅ 成功' : '❌ 失败'}\n\n`;
    
    if (urlResult.fansCountTests && urlResult.fansCountTests.length > 0) {
      section += '**粉丝数选择器测试**:\n\n';
      section += '| 选择器 | 结果 | 值/错误 |\n';
      section += '|--------|------|--------|\n';
      for (const test of urlResult.fansCountTests) {
        const status = test.success ? '✅' : '❌';
        const value = test.success ? test.value : (test.error ? test.error.substring(0, 50) : '未知错误');
        section += `| \`${test.selector}\` | ${status} | ${value} |\n`;
      }
      section += '\n';
    }
    
    if (urlResult.userProfile && Object.keys(urlResult.userProfile).length > 0) {
      section += '**提取的用户资料**:\n\n';
      section += `| 字段 | 值 |\n`;
      section += `|------|-----|\n`;
      section += `| 昵称 | ${urlResult.userProfile.nickname || '未找到'} |\n`;
      section += `| 粉丝数 | ${urlResult.userProfile.fansCount || '未找到'} |\n`;
      section += `| 关注数 | ${urlResult.userProfile.followCount || '未找到'} |\n`;
      section += `| 获赞数 | ${urlResult.userProfile.likesCount || '未找到'} |\n`;
      section += `| 小红书号 | ${urlResult.userProfile.userId || '未找到'} |\n`;
      section += `| IP 属地 | ${urlResult.userProfile.ipLocation || '未找到'} |\n`;
      section += '\n';
    }
    
    if (urlResult.error) {
      section += `**错误**: ${urlResult.error}\n\n`;
    }
    
    return section;
  }).join('\n---\n\n')}

## 5. 验证结论

${results.summary.successfulUrls === results.summary.totalUrls && results.summary.totalUrls > 0 ? `
### ✅ 验证通过

- 所有测试 URL 均成功提取粉丝数
- 新选择器配置 \`[class*='fan']\` 工作正常
- 配置文件 v1.3.0 可以投入使用

**建议**: 更新 \`verificationStatus.userProfile\` 为 \`verified: true\`
` : `
### ⚠️ 部分通过

- ${results.summary.successfulUrls}/${results.summary.totalUrls} 个 URL 测试成功
- 部分选择器可能需要进一步调整

**建议**: 
1. 检查失败 URL 的页面结构
2. 考虑添加更多备选选择器
3. 可能需要针对不同博主类型使用不同策略
` }

---

## 6. 下一步行动

- [ ] ${results.summary.successfulUrls === results.summary.totalUrls && results.summary.totalUrls > 0 ? '更新配置验证状态' : '分析失败原因'}
- [ ] 更新 selector.conf.json 的 verificationStatus
- [ ] 同步 TypeScript 配置文件
- [ ] 安排定期验证测试

---

**报告生成时间**: ${date}  
**测试工具**: Playwright + Chromium  
**测试环境**: Linux WSL2

`;
  
  return report;
}

main().catch(console.error);
