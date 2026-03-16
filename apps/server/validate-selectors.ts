/**
 * 验证小红书搜索选择器是否有效
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { XIAOHONGSHU_COOKIES } from '../../.workspace/config/xiaohongshu.cookies.js';
import {
  findElement,
  findElementInCard,
  searchPageSelectors,
} from './src/config/xiaohongshu-search-selectors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
  selector: string;
  found: boolean;
  count: number;
  sample?: string;
}

interface CardData {
  title: string;
  author: string;
  time: string;
  likes: string;
  coverUrl?: string;
}

async function validateSelectors() {
  console.log('🧪 开始验证小红书搜索选择器...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1920,1080'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  // 设置 Cookie
  console.log('🍪 设置 Cookie...');
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
  await page.waitForTimeout(5000);

  const results: Record<string, TestResult[]> = {};
  const cardsData: CardData[] = [];

  // 测试各个选择器
  console.log('\n🔍 测试选择器...\n');

  // 1. 测试结果卡片选择器
  console.log('1️⃣ 测试笔记卡片选择器:');
  const cardResults: TestResult[] = [];
  for (const selector of searchPageSelectors.resultCard) {
    try {
      const elements = await page.$$(selector);
      const result: TestResult = {
        selector,
        found: elements.length > 0,
        count: elements.length,
      };
      cardResults.push(result);
      console.log(`   ${result.found ? '✅' : '❌'} "${selector}" - 找到 ${result.count} 个元素`);
    } catch (error) {
      cardResults.push({
        selector,
        found: false,
        count: 0,
      });
    }
  }
  results.resultCard = cardResults;

  // 2. 提取笔记卡片数据
  console.log('\n2️⃣ 提取笔记卡片数据:');
  const cards = await page.$$(searchPageSelectors.resultCard[0]);
  console.log(`   找到 ${cards.length} 个笔记卡片\n`);

  for (let i = 0; i < Math.min(cards.length, 5); i++) {
    const card = cards[i];
    const cardInfo: any = {};

    // 提取标题
    const titleEl = await findElementInCard(card, searchPageSelectors.noteTitle);
    cardInfo.title = titleEl ? await titleEl.textContent() : 'N/A';

    // 提取作者
    const authorEl = await findElementInCard(card, searchPageSelectors.bloggerName);
    cardInfo.author = authorEl ? await authorEl.textContent() : 'N/A';

    // 提取时间
    const timeEl = await findElementInCard(card, searchPageSelectors.noteTime);
    cardInfo.time = timeEl ? await timeEl.textContent() : 'N/A';

    // 提取点赞数
    const likeEl = await findElementInCard(card, searchPageSelectors.noteLike);
    cardInfo.likes = likeEl ? await likeEl.textContent() : 'N/A';

    // 提取封面图
    const coverEl = await findElementInCard(card, searchPageSelectors.noteCover);
    cardInfo.coverUrl = coverEl ? await coverEl.getAttribute('src') : 'N/A';

    cardsData.push(cardInfo as CardData);

    console.log(`   卡片 ${i + 1}:`);
    console.log(
      `      标题：${cardInfo.title?.slice(0, 30)}${cardInfo.title?.length > 30 ? '...' : ''}`
    );
    console.log(`      作者：${cardInfo.author}`);
    console.log(`      时间：${cardInfo.time}`);
    console.log(`      点赞：${cardInfo.likes}`);
    console.log('');
  }

  // 3. 测试其他关键选择器
  const otherSelectors = {
    searchInput: searchPageSelectors.searchInput,
    bloggerAvatar: searchPageSelectors.bloggerAvatar,
    noteAuthor: searchPageSelectors.noteAuthor,
  };

  for (const [category, selectors] of Object.entries(otherSelectors)) {
    console.log(
      `${category === 'searchInput' ? '3️⃣' : category === 'bloggerAvatar' ? '4️⃣' : '5️⃣'} 测试${category}选择器:`
    );
    const categoryResults: TestResult[] = [];

    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        const result: TestResult = {
          selector,
          found: elements.length > 0,
          count: elements.length,
        };
        categoryResults.push(result);
        console.log(`   ${result.found ? '✅' : '❌'} "${selector}" - 找到 ${result.count} 个元素`);
      } catch (error) {
        categoryResults.push({
          selector,
          found: false,
          count: 0,
        });
      }
    }
    results[category] = categoryResults;
    console.log('');
  }

  // 4. 检查登录状态
  console.log('🔐 检查登录状态:');
  const loginCheck = await page.evaluate(() => {
    return {
      hasWebSession: document.cookie.includes('web_session'),
      hasIdToken: document.cookie.includes('id_token'),
      hasUserAvatar: !!document.querySelector('.user.side-bar-component'),
      url: window.location.href,
      title: document.title,
    };
  });
  console.log(`   页面 URL: ${loginCheck.url}`);
  console.log(`   页面标题：${loginCheck.title}`);
  console.log(`   用户头像：${loginCheck.hasUserAvatar ? '✅' : '❌'}`);
  console.log('');

  // 保存测试报告
  const reportDir = path.join(__dirname, '..', '.workspace', 'tests');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `selector-validation-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    searchUrl,
    loginStatus: loginCheck,
    selectorResults: results,
    sampleCards: cardsData,
    summary: {
      totalCards: cards.length,
      cardsSampled: cardsData.length,
      successfulSelectors: Object.values(results)
        .flat()
        .filter((r) => r.found).length,
      totalSelectors: Object.values(results).flat().length,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📄 测试报告已保存到：${reportPath}\n`);

  // 总结
  console.log('📊 验证总结:');
  console.log(`   找到笔记卡片：${cards.length} 个`);
  console.log(
    `   成功的选择器：${report.summary.successfulSelectors}/${report.summary.totalSelectors}`
  );
  console.log(
    `   数据提取：${cardsData.filter((c) => c.title !== 'N/A' && c.author !== 'N/A').length}/${cardsData.length} 个卡片成功提取数据\n`
  );

  await browser.close();

  console.log('✅ 验证完成！\n');

  return report;
}

validateSelectors().catch(console.error);
