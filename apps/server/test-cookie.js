import { XiaohongshuPublisher } from './src/publishers/xiaohongshu';
import { decryptCookies, encryptCookies } from './src/utils/encryption';

// 测试 Cookie
const TEST_COOKIE = {
  name: 'web_session',
  value: '040069b557e75f10f74b91dd9f3b4b6a3ce9e5',
  domain: '.xiaohongshu.com',
  path: '/',
};

const ENCRYPTION_KEY = 'test-32-char-secret-key-for-testing!!!';

console.log('🧪 开始 Cookie 加密/解密测试...\n');

// 测试 1: 加密 Cookie
console.log('1️⃣  测试 Cookie 加密...');
try {
  const encrypted = await encryptCookies([TEST_COOKIE], ENCRYPTION_KEY);
  console.log('✅ Cookie 加密成功');
  console.log('   加密后长度:', encrypted.length);
  console.log('   加密后内容:', encrypted.substring(0, 50) + '...');
} catch (error) {
  console.error('❌ Cookie 加密失败:', String(error));
  process.exit(1);
}

console.log('');

// 测试 2: 解密 Cookie
console.log('2️⃣  测试 Cookie 解密...');
try {
  const encrypted = await encryptCookies([TEST_COOKIE], ENCRYPTION_KEY);
  const decrypted = await decryptCookies(encrypted, ENCRYPTION_KEY);

  console.log('✅ Cookie 解密成功');
  console.log('   解密后 Cookie 数量:', decrypted.length);

  if (decrypted.length > 0) {
    const cookie = decrypted[0];
    console.log('   Cookie 名称:', cookie.name);
    console.log('   Cookie 值:', cookie.value.substring(0, 20) + '...');
    console.log('   Cookie 域名:', cookie.domain);

    // 验证一致性
    if (
      cookie.name === TEST_COOKIE.name &&
      cookie.value === TEST_COOKIE.value &&
      cookie.domain === TEST_COOKIE.domain
    ) {
      console.log('✅ Cookie 数据一致性验证通过');
    } else {
      console.log('❌ Cookie 数据不一致');
      process.exit(1);
    }
  }
} catch (error) {
  console.error('❌ Cookie 解密失败:', String(error));
  process.exit(1);
}

console.log('');
console.log('🎉 所有 Cookie 测试通过！');
