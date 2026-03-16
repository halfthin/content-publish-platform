import { chromium } from 'playwright';

async function main() {
  console.log('🧪 开始小红书页面 DOM 调试 v2...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 先访问首页
    console.log('访问小红书首页...');
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // 检查是否登录
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未登录');
    
    // 搜索"通勤穿搭"
    console.log('\n搜索"通勤穿搭"...');
    try {
      await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
      await page.press('input[placeholder*="搜索"]', 'Enter');
      await page.waitForTimeout(5000);
    } catch (e) {
      console.log('搜索失败:', e.message);
    }
    
    // 获取页面HTML摘要
    const html = await page.content();
    const htmlSize = html.length;
    
    // 提取关键元素
    const elements = await page.evaluate(() => {
      const result = {
        title: document.title,
        bodyText: document.body.innerText.substring(0, 500),
        allDivs: Array.from(document.querySelectorAll('div')).slice(0, 20).map(d => ({
          className: d.className || 'no-class',
          tagName: d.tagName,
        })),
        allSpans: Array.from(document.querySelectorAll('span')).slice(0, 20).map(s => ({
          className: s.className || 'no-class',
          text: s.textContent?.trim().substring(0, 30) || '',
        })),
      };
      return result;
    });
    
    console.log('\n📄 页面信息');
    console.log(`标题：${elements.title}`);
    console.log(`Body Text（前500字符）：${elements.bodyText.substring(0, 200)}...`);
    
    console.log('\n🔍 div 元素（前20个）:');
    elements.allDivs.slice(0, 5).forEach((d, i) => {
      console.log(`  ${i + 1}. <div class="${d.className.substring(0, 50)}">`);
    });
    
    console.log('\n🔢 span 元素（前20个）:');
    elements.allSpans.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. <span class="${s.className.substring(0, 30)}">${s.text.substring(0, 30)}...`);
    });
    
    console.log(`\n📝 HTML 总大小：${htmlSize} 字符`);
    
    // 保存截图
    await page.screenshot({ path: '/home/halfthin/dev/content-publish-platform/.workspace/tests/xhs-page-debug.png' });
    console.log('✅ 截图已保存');
    
    await browser.close();
    console.log('\n✅ 调试完成！');
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(console.error);
