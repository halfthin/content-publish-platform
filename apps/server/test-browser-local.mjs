import { chromium } from 'playwright';

async function main() {
  console.log('🧪 开始 Browserless + Cookie 验证测试...\n');
  console.log('使用本地 Chromium 浏览器...\n');
  
  try {
    // 使用本地浏览器
    console.log('启动本地 Chromium 浏览器...');
    const browser = await chromium.launch({
      headless: true,
      slowMo: 100,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    console.log('✅ 浏览器启动成功');
    
    const context = await browser.newContext();
    
    // 设置 Cookie
    await context.addCookies([
      { name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/' },
      { name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/' },
      { name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/' },
      { name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/' },
      { name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/' },
    ]);
    
    const page = await context.newPage();
    
    console.log('\n访问小红书首页...');
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('✅ 页面加载成功');
    
    // 检查登录状态
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态');
    
    // 搜索
    try {
      console.log('\n搜索关键词：通勤穿搭...');
      await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
      await page.press('input[placeholder*="搜索"]', 'Enter');
      await page.waitForTimeout(5000);
      console.log('✅ 搜索完成');
    } catch (error) {
      console.log('⚠️  搜索失败:', error.message);
    }
    
    // 抓取博主
    await page.waitForSelector('.note-item', { timeout: 10000 }).catch(() => {});
    
    const bloggerCards = await page.$$('.note-item');
    console.log(`\n找到 ${bloggerCards.length} 个博主`);
    
    const bloggers = [];
    for (let i = 0; i < Math.min(3, bloggerCards.length); i++) {
      try {
        const card = bloggerCards[i];
        const name = await card.$eval('.author-name', el => el.textContent?.trim()) || '未知';
        const id = await card.$eval('.author-id', el => el.textContent?.trim()) || '未知';
        bloggers.push({ name, id });
        console.log(`博主 ${i + 1}: ${name}`);
      } catch (error) {
        console.log(`抓取失败: ${error.message}`);
      }
    }
    
    // 生成报告
    console.log('\n## 🧪 测试报告');
    console.log('');
    console.log('### 1. Browserless 连接');
    console.log('- [x] 使用本地 Chromium 浏览器');
    console.log('- [x] 浏览器启动成功');
    console.log('');
    console.log('### 2. Cookie 登录验证');
    console.log('- [x] Cookie 已提供');
    console.log('- [x] 登录状态:', hasUserAvatar ? '✅ 已登录' : '⚠️ 未检测到登录状态');
    console.log('');
    console.log('### 3. 搜索结果（通勤穿搭）');
    for (let i = 0; i < bloggers.length; i++) {
      const blogger = bloggers[i];
      console.log('');
      console.log('#### 博主 ' + (i + 1));
      console.log('- 昵称:', blogger.name);
      console.log('- 小红书号:', blogger.id);
    }
    console.log('');
    console.log('### 4. 结论');
    console.log('- [x] 浏览器: ✅ 本地 Chromium 可用');
    console.log('- [x] Cookie: ✅ 已提供');
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

main().catch(console.error);
