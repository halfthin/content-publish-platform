/**
 * 在 content-publish-platform 中使用 selector.conf.json
 * 
 * 本示例演示如何集成配置文件进行数据采集
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';

// 加载配置文件
const selectorConfig = JSON.parse(
  await readFile('/home/halfthin/dev/content-publish-platform/selector.conf.json', 'utf-8')
);

console.log('📋 小红书选择器配置加载器');
console.log('版本:', selectorConfig.version);
console.log('生成时间:', selectorConfig.generatedAt);
console.log('更新时间:', selectorConfig.updatedAt);
console.log('\n📊 验证状态:');
Object.entries(selectorConfig.verificationStatus).forEach(([page, status]) => {
  console.log(`   ${page.padEnd(12)} ${status.successRate.padEnd(6)} ${status.verified ? '✅' : '❌'}`);
});

/**
 * 从页面提取数据（支持 DOM 和 JSON 提取）
 */
async function extractData(page, selectors, extractionMethod) {
  const result = {};
  
  for (const [field, selectorList] of Object.entries(selectors)) {
    try {
      // 检查是否是 JSON 提取
      const jsonMatch = selectorList[0]?.match(/^JSON:\s*(.+)/);
      if (jsonMatch) {
        // JSON 提取
        const jsonPath = jsonMatch[1];
        const value = await page.evaluate((path) => {
          try {
            const parts = path.split('.');
            let data = window.__INITIAL_STATE__;
            for (const part of parts) {
              data = data?.[part];
            }
            return data;
          } catch { return null; }
        }, jsonPath);
        result[field] = value;
      } else if (selectorList[0]?.startsWith('text:')) {
        // 文本提取
        const searchText = selectorList[0].replace('text:', '');
        const value = await page.evaluate((text) => {
          const elements = document.querySelectorAll('*');
          for (const el of elements) {
            if (el.textContent?.includes(text)) {
              return el.textContent.replace(text, '').trim();
            }
          }
          return null;
        }, searchText);
        result[field] = value;
      } else {
        // DOM 提取
        const value = await page.$eval(selectorList[0], el => el.textContent?.trim()).catch(() => null);
        result[field] = value;
      }
    } catch (error) {
      result[field] = null;
    }
  }
  
  return result;
}

/**
 * 采集博主主页
 */
async function collectUserProfile(url) {
  console.log(`\n👤 采集博主主页：${url}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 加载 Cookie
    const cookiePath = '/home/halfthin/dev/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
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
    }
    
    // 访问页面
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // 使用配置文件采集
    const config = selectorConfig.pages.userProfile;
    const data = await extractData(page, config.selectors, config.extractionMethod);
    
    // 采集笔记列表
    const notes = await page.$$eval(config.selectors.noteCard[0], cards => {
      return cards.slice(0, 3).map(card => {
        const titleEl = card.querySelector('.note-title');
        const linkEl = card.querySelector('a[href*="/explore/"]');
        return {
          title: titleEl?.textContent?.trim() || '无标题',
          link: linkEl?.getAttribute('href') || '',
        };
      });
    });
    
    console.log('\n📊 采集结果:\n');
    console.log(`博主名称：${data.nickname || '未找到'}`);
    console.log(`小红书号：${data.userId || '未找到'}`);
    console.log(`IP 属地：${data.ipLocation || '未找到'}`);
    console.log(`关注数：${data.followCount || '未找到'}`);
    console.log(`粉丝数：${data.fansCount || '未找到'}`);
    console.log(`获赞与收藏：${data.likesCount || '未找到'}`);
    console.log(`\n笔记列表 (${notes.length}篇):`);
    notes.forEach((note, i) => {
      console.log(`  ${i + 1}. ${note.title}`);
    });
    
    return { profile: data, notes };
  } catch (error) {
    console.error('❌ 采集失败:', error.message);
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * 采集博文详情
 */
async function collectNoteDetail(url) {
  console.log(`\n📝 采集博文详情：${url}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 加载 Cookie
    const cookiePath = '/home/halfthin/dev/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
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
    }
    
    // 访问页面
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // 使用配置文件采集
    const config = selectorConfig.pages.noteDetail;
    const data = await extractData(page, config.selectors);
    
    // 提取图片
    const images = await page.$$eval(config.selectors.images[0], imgs => 
      imgs.map(img => img.getAttribute('src')).filter(Boolean)
    );
    
    console.log('\n📊 采集结果:\n');
    console.log(`标题：${data.title || '未找到'}`);
    console.log(`点赞数：${data.likeCount || '未找到'}`);
    console.log(`收藏数：${data.collectCount || '未找到'}`);
    console.log(`评论数：${data.commentCount || '未找到'}`);
    console.log(`图片数：${images.length}`);
    
    return { ...data, images };
  } catch (error) {
    console.error('❌ 采集失败:', error.message);
    return null;
  } finally {
    await browser.close();
  }
}

// 主函数
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('在 content-publish-platform 中使用 selector.conf.json');
  console.log('='.repeat(60));
  
  // 测试博主主页采集
  const userProfileUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
  const userProfileData = await collectUserProfile(userProfileUrl);
  
  if (userProfileData) {
    // 保存结果
    const outputFile = '/home/halfthin/dev/content-publish-platform/.workspace/tests/selector-config-test-result.json';
    await writeFile(outputFile, JSON.stringify(userProfileData, null, 2));
    console.log(`\n💾 结果已保存到：${outputFile}`);
  }
  
  console.log('\n✅ 演示完成！\n');
}

main().catch(console.error);
