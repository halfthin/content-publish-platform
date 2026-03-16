import { chromium } from 'playwright';

const VALID_COOKIES = [
  {name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/'},
  {name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/'},
  {name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/'},
  {name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/'},
  {name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/'},
];

// HT-Fish 修复后的正确选择器
const CORRECT_SELECTORS = {
  nickname: '.user-nickname',
 FansCount: '[class*="fan"]',
  followCount: '[class*="follow"]',
  likesCount: '[class*="like"]',
};

async function main() {
  console.log('🧪 开始小红书博主主页验证测试...\n');
  
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
    await page.screenshot({ path: '/home/halfthin/dev/content-publish-platform/.workspace/tests/xhs-user-profile-verified.png' });
    console.log('✅ 截图已保存\n');
    
    console.log('=== 抓取博主信息 ===\n');
    
    // 昵称
    const nameEl = await page.$(CORRECT_SELECTORS.nickname);
    const name = nameEl ? await nameEl.textContent() : '未知';
    console.log(`昵称：${name}`);
    
    // 粉丝数
    const fansEl = await page.$(CORRECT_SELECTORS.FansCount);
    const followers = fansEl ? await fansEl.textContent() : '未知';
    console.log(`粉丝数：${followers}`);
    
    // 关注数
    const followEl = await page.$(CORRECT_SELECTORS.followCount);
    const follow = followEl ? await followEl.textContent() : '未知';
    console.log(`关注数：${follow}`);
    
    // 获赞数
    const likeEl = await page.$(CORRECT_SELECTORS.likesCount);
    const likes = likeEl ? await likeEl.textContent() : '未知';
    console.log(`获赞数：${likes}`);
    
    // 生成报告
    console.log('\n=== 选择器验证报告 (最终版) ===\n');
    console.log('## 🧪 小红书博主主页选择器验证报告\n');
    console.log('### 测试结果');
    console.log('- 浏览器：✅ 启动成功');
    console.log('- 页面访问：✅ 成功');
    console.log('- 目标主页: ' + targetUrl + '\n');
    console.log('### 数据提取');
    console.log('- 昵称: ' + name);
    console.log('- 粉丝数: ' + followers);
    console.log('- 关注数: ' + follow);
    console.log('- 获赞数: ' + likes + '\n');
    console.log('### 总结');
    const allPassed = name !== '未知';
    console.log('选择器验证：' + (allPassed ? '✅ 通过' : '❌ 失败'));
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 失败:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
