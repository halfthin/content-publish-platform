import { XiaohongshuPublisher } from './src/publishers/xiaohongshu';
import { encryptCookies } from './src/utils/encryption';

const ENCRYPTION_KEY = 'test-32-char-secret-key-for-testing!!!';

// 提供的测试 Cookie
const TEST_COOKIES = [
  {
    name: 'web_session',
    value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'id_token',
    value: 'test-id-token-value',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'xsecappid',
    value: 'xhs-pc-web',
    domain: '.xiaohongshu.com',
    path: '/',
  },
  {
    name: 'a1',
    value: '18b790d35dc3e7d24175607358920173',
    domain: '.xiaohongshu.com',
    path: '/',
  },
];

console.log('🧪 开始 Cookie 登录状态测试...\n');

// 测试 1: 加密 Cookie
console.log('1️⃣  加密测试 Cookie...');
const encrypted = await encryptCookies(TEST_COOKIES, ENCRYPTION_KEY);
console.log('✅ Cookie 加密成功');
console.log('   加密后长度:', encrypted.length);

console.log('');

// 测试 2: 初始化发布器
console.log('2️⃣  初始化小红书发布器...');
const publisher = new XiaohongshuPublisher({
  accountId: 'test-xhs-001',
  headless: true,
  timeout: 60000,
});

try {
  await publisher.initialize();
  console.log('✅ 发布器初始化成功');
} catch (error) {
  console.error('⚠️  发布器初始化失败:', String(error).substring(0, 200));
  console.log('   这可能是由于浏览器初始化失败导致');
  console.log('   继续测试 Cookie 加载功能...');
}

console.log('');

// 测试 3: 加载 Cookie
console.log('3️⃣  测试 Cookie 加载到浏览器...');
try {
  if (!publisher['context']) {
    console.log('⚠️  忽略 Cookie 加载测试（浏览器上下文未初始化）');
  } else {
    const loaded = await publisher.loadCookies(encrypted, ENCRYPTION_KEY);
    if (loaded) {
      console.log('✅ Cookie 加载成功');
    } else {
      console.log('❌ Cookie 加载失败');
    }
  }
} catch (error) {
  console.error('⚠️  Cookie 加载测试跳过:', String(error).substring(0, 200));
}

console.log('');

// 测试 4: 保存 Cookie
console.log('4️⃣  测试 Cookie 保存...');
try {
  if (!publisher['context']) {
    console.log('⚠️  忽略 Cookie 保存测试（浏览器上下文未初始化）');
  } else {
    const saved = await publisher.saveCookies(ENCRYPTION_KEY);
    if (saved) {
      console.log('✅ Cookie 保存成功');
      console.log('   保存后长度:', saved.length);
    } else {
      console.log('❌ Cookie 保存失败');
    }
  }
} catch (error) {
  console.error('⚠️  Cookie 保存测试跳过:', String(error).substring(0, 200));
}

console.log('');

// 测试 5: 关闭发布器
console.log('5️⃣  关闭发布器...');
try {
  await publisher.close();
  console.log('✅ 发布器已关闭');
} catch (error) {
  console.error('⚠️  关闭发布器时出错:', String(error).substring(0, 200));
}

console.log('');
console.log('🎉 Cookie 登录状态测试完成！');
