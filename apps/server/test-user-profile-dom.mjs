import { chromium } from 'playwright';

const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

async function main() {
  console.log('🧪 开始小红书博主主页 DOM 调试...\n');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    
    const page = await context.newPage();
    
    const targetUrl = 'https://www.xiaohongshu.com/user/profile/69626b900000000014015708';
    console.log(`访问: ${targetUrl}\n`);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    // 保存截图
    await page.screenshot({ path: '/home/halfthin/dev/content-publish-platform/.workspace/tests/xhs-user-profile-debug.png' });
    console.log('✅ 截图已保存\n');
    
    // 提取关键元素
    const result = await page.evaluate(() => {
      const allDivs = Array.from(document.querySelectorAll('div.user-nickname, div.fans-count, div.follow-count, div.likes-count'));
      return {
        title: document.title,
        url: window.location.href,
        elements: allDivs.slice(0, 10).map(d => ({
          className: d.className,
          html: d.outerHTML.substring(0, 100),
        })),
      };
    });
    
    console.log('📄 页面信息:');
    console.log(`标题: ${result.title}`);
    console.log(`URL: ${result.url}`);
    console.log('\n🔍 关键元素 (前10个):');
    result.elements.forEach((el, i) => {
      console.log(`  ${i + 1}. class="${el.className.substring(0, 40)}"`);
    });
    
    await browser.close();
    console.log('\n✅ 调试完成！');
    
  } catch (error) {
    console.error('❌ 失败:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
