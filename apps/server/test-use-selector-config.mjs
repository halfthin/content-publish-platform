/**
 * 使用 selector.conf.json 配置采集小红书数据
 * 
 * 使用方法:
 * bun test-use-selector-config.mjs
 */

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';

// 加载配置文件
const selectorConfig = JSON.parse(
  await readFile('/home/halfthin/dev/content-publish-platform/selector.conf.json', 'utf-8')
);

console.log('📋 加载选择器配置:', selectorConfig.version);
console.log('📊 验证状态:');
Object.entries(selectorConfig.verificationStatus).forEach(([page, status]) => {
  console.log(`   ${page}: ${status.successRate} ${status.verified ? '✅' : '❌'}`);
});

// 测试博主主页采集
async function testUserProfile() {
  console.log('\n👤 测试博主主页采集...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 加载 Cookie（从配置文件）
    const cookiePath = '/home/halfthin/dev/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
    const cookieContent = await readFile(cookiePath, 'utf-8');
    const match = cookieContent.match(/export const XIAOHONGSHU_COOKIES = (\[.*?\]);/s);
    if (match) {
      const cookiesJson = match[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
      const cookies = JSON.parse(cookiesJson);
      
      // 转换为 Playwright 格式
      const playwrightCookies = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate || -1,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
      }));
      
      await context.addCookies(playwrightCookies);
      console.log('✅ Cookie 加载成功');
    }
    
    // 访问博主主页
    const testUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
    console.log('🔗 访问:', testUrl);
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // 使用配置文件中的选择器采集数据
    const config = selectorConfig.pages.userProfile.selectors;
    const extractionMethod = selectorConfig.pages.userProfile.extractionMethod;
    
    console.log('\n📊 采集结果:\n');
    
    // 1. 昵称（DOM 提取）
    const nickname = await page.$eval(config.nickname[0], el => el.textContent?.trim()).catch(() => '未找到');
    console.log(`✅ 博主名称：${nickname}`);
    
    // 2. 小红书号（JSON 提取）
    const userId = await page.evaluate(() => {
      try {
        const state = window.__INITIAL_STATE__?.user?.userPageData?.basicInfo;
        return state?.redId || '未找到';
      } catch { return '未找到'; }
    });
    console.log(`✅ 小红书号：${userId}`);
    
    // 3. IP 属地（JSON 提取）
    const ipLocation = await page.evaluate(() => {
      try {
        const state = window.__INITIAL_STATE__?.user?.userPageData?.basicInfo;
        return state?.ipLocation || '未找到';
      } catch { return '未找到'; }
    });
    console.log(`✅ IP 属地：${ipLocation}`);
    
    // 4. 关注数（DOM 提取）
    const followCount = await page.$$eval('.user-interactions .count', els => 
      els[0]?.textContent?.trim() || '未找到'
    );
    console.log(`✅ 关注数：${followCount}`);
    
    // 5. 粉丝数（DOM 提取）
    const fansCount = await page.$$eval('.user-interactions .count', els => 
      els[1]?.textContent?.trim() || '未找到'
    );
    console.log(`✅ 粉丝数：${fansCount}`);
    
    // 6. 获赞与收藏（DOM 提取）
    const likesCount = await page.$$eval('.user-interactions .count', els => 
      els[2]?.textContent?.trim() || '未找到'
    );
    console.log(`✅ 获赞与收藏：${likesCount}`);
    
    // 7. 笔记列表
    const notes = await page.$$eval(config.noteCard, cards => 
      cards.slice(0, 3).map(card => {
        const title = card.querySelector('.note-title')?.textContent?.trim() || '无标题';
        const link = card.querySelector('a[href*="/explore/"]')?.getAttribute('href') || '';
        return { title, link };
      })
    );
    console.log(`\n✅ 笔记列表 (${notes.length}篇):`);
    notes.forEach((note, i) => {
      console.log(`   ${i + 1}. ${note.title}`);
    });
    
    console.log('\n✅ 博主主页采集完成！\n');
    
  } catch (error) {
    console.error('❌ 采集失败:', error.message);
  } finally {
    await browser.close();
  }
}

// 运行测试
testUserProfile().catch(console.error);
