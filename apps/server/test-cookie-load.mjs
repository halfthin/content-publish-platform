/**
 * 测试 Cookie 加载
 */

const cookiePath = '/home/halfthin/dev/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
const cookieContent = await Bun.file(cookiePath).text();

console.log('Cookie 文件内容长度:', cookieContent.length);

// 解析 TypeScript 文件，提取 Cookie 数组
const match = cookieContent.match(/export const XIAOHONGSHU_COOKIES = (\[.*?\]);/s);
if (!match) {
  console.error('❌ 无法解析 Cookie 文件');
  process.exit(1);
}

console.log('✅ 成功提取 Cookie 数组');

// 简化 JSON：移除注释和多余字段
const cookiesJson = match[1]
  .replace(/\/\/.*$/gm, '')  // 移除行注释
  .replace(/(\w+):/g, '"$1":')  // 键名加引号
  .replace(/'/g, '"');  // 单引号转双引号

try {
  const XIAOHONGSHU_COOKIES = JSON.parse(cookiesJson);
  console.log('✅ Cookie 解析成功，数量:', XIAOHONGSHU_COOKIES.length);
  console.log('\n第一个 Cookie:', JSON.stringify(XIAOHONGSHU_COOKIES[0], null, 2));
} catch (error) {
  console.error('❌ JSON 解析失败:', error.message);
  console.log('\n尝试解析的 JSON:\n', cookiesJson.slice(0, 500));
}
