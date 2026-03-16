import { chromium } from 'playwright';

// 提供的 Cookie
const TEST_COOKIES = [
  { name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/' },
  { name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/' },
  { name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/' },
  { name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/' },
  { name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/' },
];

async function main() {
  console.log('🧪 开始 Browserless + Cookie 验证测试...\n');
  
  // Browserless 的正确连接格式
  const browserlessUrl = 'ws://localhost:6666/?token=default&ensureLatest=1';
  
  try {
    console.log(`连接: ${browserlessUrl}`);
    const browser = await chromium.connect(browserlessUrl);
    console.log('✅ Browserless 连接成功');
    
    const context = await browser.newContext();
    await context.addCookies(TEST_COOKIES);
    const page = await context.newPage();
    
    // 访问小红书
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✅ 页面加载成功');
    
    // 检查登录状态
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态');
    
    // 搜索
    try {
      await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
      await page.press('input[placeholder*="搜索"]', 'Enter');
      await page.waitForTimeout(5000);
      console.log('✅ 搜索完成');
    } catch (error) {
      console.log('⚠️  搜索失败');
    }
    
    // 抓取博主
    await page.waitForSelector('.note-item', { timeout: 10000 }).catch(() => {});
    
    const博主元素 = await page.$$('.note-item');
    console.log(`找到 ${博主元素.length} 个博主`);
    
    const bloggers = [];
    for (let i = 0; i < Math.min(3, 博主元素.length); i++) {
      try {
        const card = 博主元素[i];
        const昵称 = await card.$eval('.author-name', el => el.textContent?.trim()) || '未知';
        const用户ID = await card.$eval('.author-id', el => el.textContent?.trim()) || '未知';
        bloggers.push({ 昵称, 用户ID });
        console.log(`博主 ${i + 1}: ${昵称}`);
      } catch (error) {
        console.log(`抓取失败`);
      }
    }
    
    // 生成报告
    console.log('\n## 🧪 测试报告');
    console.log('');
    console.log('### Browserless 连接');
    console.log('- [x] 连接成功');
    console.log('');
    console.log('### Cookie 登录验证');
    console.log('- [x] Cookie 已提供');
    console.log('- [x] 登录状态:', hasUserAvatar ? '✅ 已登录' : '⚠️ 未检测到登录状态');
    console.log('');
    console.log('### 搜索结果（通勤穿搭）');
    for (let i = 0; i < bloggers.length; i++) {
      const博主 = bloggers[i];
      console.log('');
      console.log('#### 博主 ' + (i + 1));
      console.log('- 昵称:', 博主.昵称);
      console.log('- 小红书号:', 博主.用户ID);
    }
    console.log('');
    console.log('### 结论');
    console.log('- [x] Browserless: ✅ 可用');
    console.log('- [x] Cookie: ✅ 已提供');
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

main().catch(console.error);
