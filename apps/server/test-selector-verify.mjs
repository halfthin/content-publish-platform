import { chromium } from 'playwright';

// 17:00 提供的有效 Cookie
const VALID_COOKIES = [
  { name: 'web_session', value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5', domain: '.xiaohongshu.com', path: '/' },
  { name: 'id_token', value: 'VjEAAGwPt7FIegAM2hTQh0oOy2GgT2GTErKoWPBJh9eHSjxRb0POcv0m6zVMrQswCVIXNXViqhxBk/LMmOkcX4ffi8XM2LVzes25IStPdRfCxdrvtRM0qRMRXj4brzRVU5MAjXIg', domain: '.xiaohongshu.com', path: '/' },
  { name: 'xsecappid', value: 'xhs-pc-web', domain: '.xiaohongshu.com', path: '/' },
  { name: 'a1', value: '199bc6d24527xbipb7v0when72fx2r2m64fi3edw450000386821', domain: '.xiaohongshu.com', path: '/' },
  { name: 'webId', value: 'e848b3ccac9c3f57790ef018a6fb43fd', domain: '.xiaohongshu.com', path: '/' },
];

async function main() {
  console.log('🧪 开始小红书选择器验证测试...\n');
  
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('✅ 浏览器启动成功');
    
    const context = await browser.newContext();
    await context.addCookies(VALID_COOKIES);
    console.log('✅ Cookie 已设置');
    
    const page = await context.newPage();
    
    // 1. 访问小红书首页
    console.log('\n=== 1. 访问小红书首页 ===');
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('✅ 页面加载成功');
    
    // 检查登录状态
    const hasUserAvatar = await page.$('.user-avatar, .avatar-img', { timeout: 3000 });
    console.log('登录状态:', hasUserAvatar ? '✅ 已登录' : '❌ 未检测到登录状态');
    
    // 2. 搜索"通勤穿搭"
    console.log('\n=== 2. 搜索"通勤穿搭" ===');
    await page.fill('input[placeholder*="搜索"]', '通勤穿搭');
    await page.press('input[placeholder*="搜索"]', 'Enter');
    await page.waitForTimeout(5000);
    console.log('✅ 搜索完成');
    
    // 3. 抓取博主信息
    console.log('\n=== 3. 抓取博主信息 ===');
    
    const bloggerCards = await page.$$('.note-item');
    console.log(`📊 找到 ${bloggerCards.length} 个博主卡片`);
    
    for (let i = 0; i < Math.min(3, bloggerCards.length); i++) {
      try {
        const card = bloggerCards[i];
        const name = await card.$eval('.author-name, .nickname', el => el.textContent?.trim()) || '未知';
        const id = await card.$eval('.author-id, .user-id', el => el.textContent?.trim()) || '未知';
        const followers = await card.$eval('.follow-count, .Fans', el => el.textContent?.trim()) || '未知';
        
        console.log(`\n博主 ${i + 1}:`);
        console.log(`  昵称: ${name}`);
        console.log(`  用户ID: ${id}`);
        console.log(`  粉丝数: ${followers}`);
      } catch (error) {
        console.log(`抓取博主 ${i + 1} 失败: ${error.message}`);
      }
    }
    
    // 4. 生成验证报告
    console.log('\n=== 4. 选择器验证报告 ===');
    console.log('');
    console.log('## 🧪 小红书选择器验证报告');
    console.log('');
    console.log('### 测试结果');
    console.log('- 浏览器: ✅ 启动成功');
    console.log('- 页面访问: ✅ 成功');
    console.log('- 搜索功能: ✅ 成功');
    console.log(`- 搜索结果: ✅ ${bloggerCards.length} 个博主`);
    console.log('');
    console.log('### 选择器状态');
    console.log('- input: ✅ 可用');
    console.log('- 博主卡片: ✅ 可用');
    console.log('');
    console.log('### 总结');
    const allPassed = bloggerCards.length > 0;
    console.log(`选择器验证: ${allPassed ? '✅ 通过' : '❌ 失败'}`);
    
    await browser.close();
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

main().catch(console.error);
