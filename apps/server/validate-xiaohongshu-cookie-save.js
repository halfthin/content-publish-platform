#!/usr/bin/env bun

/**
 * 小红书Cookie保存功能验证脚本
 * 为HT-Fish准备的快速验证工具
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🔍 开始验证小红书Cookie保存功能...\n');

// 1. 检查小红书发布器文件
console.log('1. 检查小红书发布器文件...');
try {
  const xiaohongshuPath = join(__dirname, 'src/publishers/xiaohongshu.ts');
  const content = readFileSync(xiaohongshuPath, 'utf-8');

  // 检查saveCookies方法
  if (content.includes('saveCookies')) {
    console.log('   ✅ saveCookies方法存在');

    // 检查方法签名
    const saveCookiesRegex = /async\s+saveCookies\s*\([^)]*password[^)]*\)/;
    if (saveCookiesRegex.test(content)) {
      console.log('   ✅ saveCookies方法签名正确');
    } else {
      console.log('   ⚠️ saveCookies方法签名可能需要检查');
    }
  } else {
    console.log('   ❌ saveCookies方法不存在');
  }

  // 检查encryptCookies导入
  if (content.includes('encryptCookies')) {
    console.log('   ✅ encryptCookies导入存在');
  }
} catch (error) {
  console.log('   ❌ 文件读取失败:', error.message);
}

console.log('\n2. 检查发布队列文件...');
try {
  const queuePath = join(__dirname, 'src/queues/publish-queue.ts');
  const content = readFileSync(queuePath, 'utf-8');

  // 检查保存逻辑
  if (content.includes('publisher.saveCookies')) {
    console.log('   ✅ publisher.saveCookies调用存在');
  } else {
    console.log('   ❌ publisher.saveCookies调用不存在');
  }

  // 检查小红书任务的finally块
  if (content.includes('processXiaohongshuJob')) {
    console.log('   ✅ processXiaohongshuJob方法存在');

    // 检查finally块中的保存逻辑
    const xhsFinallyRegex = /finally\s*\{[^}]*saveCookies[^}]*\}/s;
    if (xhsFinallyRegex.test(content)) {
      console.log('   ✅ 小红书任务finally块包含保存逻辑');
    } else {
      console.log('   ⚠️ 小红书任务finally块可能需要检查');
    }
  }
} catch (error) {
  console.log('   ❌ 文件读取失败:', error.message);
}

console.log('\n3. 检查数据库Schema...');
try {
  const schemaPath = join(__dirname, 'prisma/schema.prisma');
  const content = readFileSync(schemaPath, 'utf-8');

  // 检查encryptedCookies字段
  if (content.includes('encryptedCookies')) {
    console.log('   ✅ encryptedCookies字段存在');
  } else {
    console.log('   ❌ encryptedCookies字段不存在');
  }

  // 检查cookieUpdatedAt字段
  if (content.includes('cookieUpdatedAt')) {
    console.log('   ✅ cookieUpdatedAt字段存在');
  } else {
    console.log('   ❌ cookieUpdatedAt字段不存在');
  }
} catch (error) {
  console.log('   ❌ 文件读取失败:', error.message);
}

console.log('\n4. 运行TypeScript检查...');
try {
  const { execSync } = await import('child_process');
  const result = execSync(
    'bun run check src/publishers/xiaohongshu.ts src/queues/publish-queue.ts 2>&1',
    {
      cwd: __dirname,
      encoding: 'utf-8',
    }
  );

  if (result.includes('error') || result.includes('Error')) {
    console.log('   ⚠️ TypeScript检查发现错误:');
    console.log(
      result
        .split('\n')
        .filter((line) => line.includes('error') || line.includes('Error'))
        .slice(0, 5)
        .join('\n      ')
    );
  } else {
    console.log('   ✅ TypeScript检查通过');
  }
} catch (error) {
  console.log('   ❌ TypeScript检查失败:', error.message);
}

console.log('\n5. 模块导入测试...');
try {
  // 测试模块导入
  const xiaohongshuModule = await import('./src/publishers/xiaohongshu.ts');
  console.log('   ✅ 小红书发布器模块导入成功');

  const queueModule = await import('./src/queues/publish-queue.ts');
  console.log('   ✅ 发布队列模块导入成功');

  // 检查类是否存在
  if (xiaohongshuModule.XiaohongshuPublisher) {
    console.log('   ✅ XiaohongshuPublisher类存在');
  }

  if (queueModule.PublishQueue) {
    console.log('   ✅ PublishQueue类存在');
  }
} catch (error) {
  console.log('   ❌ 模块导入失败:', error.message);
}

console.log('\n📊 验证总结:');
console.log('========================================');
console.log('小红书Cookie保存功能基础验证完成。');
console.log('HT-Fish需要进一步执行:');
console.log('1. 运行完整测试: bun test');
console.log('2. 创建小红书专用测试用例');
console.log('3. 验证实际发布流程');
console.log('4. 检查数据库更新逻辑');
console.log('\n详细指南见: .workspace/tasks/XIAOHONGSHU_COOKIE_VALIDATION_TASK.md');
console.log('========================================\n');
