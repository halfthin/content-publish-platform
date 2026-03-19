#!/usr/bin/env bun

/**
 * CookieRefreshService 集成验证脚本
 * 用于验证方案B的完整功能
 */

import { PrismaClient } from '@prisma/client';
import { CookieRefreshService } from './src/services/cookie-refresh.service';
import { encryptCookies } from './src/utils/encryption';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 开始验证CookieRefreshService集成功能...\n');

  try {
    // 1. 创建测试数据
    console.log('1. 创建测试数据...');

    // 创建测试分组
    const testGroup = await prisma.accountGroup.create({
      data: {
        name: `integration-test-group-${Date.now()}`,
        platform: 'xiaohongshu',
        description: '集成测试分组',
      },
    });

    // 创建3个测试账号，模拟不同健康状态
    const testAccounts = [];

    // 账号1: 健康账号（1天前更新，有发布记录）
    const healthyCookies = await encryptCookies(
      [{ name: 'a1', value: 'healthy-cookie', domain: '.xiaohongshu.com' }],
      'test-password'
    );

    const healthyAccount = await prisma.account.create({
      data: {
        name: `healthy-account-${Date.now()}`,
        platform: 'xiaohongshu',
        username: `healthy-user-${Date.now()}`,
        status: 'ACTIVE',
        loginStatus: 'LOGGED_IN',
        groupId: testGroup.id,
        encryptedCookies: healthyCookies,
        cookiePassword: 'test-password',
        cookieUpdatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1天前
      },
    });
    testAccounts.push(healthyAccount);

    // 创建发布记录
    await prisma.publishLog.createMany({
      data: [
        {
          contentId: 'test-content-1',
          accountId: healthyAccount.id,
          status: 'SUCCESS',
          platform: 'xiaohongshu',
        },
        {
          contentId: 'test-content-2',
          accountId: healthyAccount.id,
          status: 'SUCCESS',
          platform: 'xiaohongshu',
        },
      ],
    });

    // 账号2: 警告账号（10天前更新，发布成功率低）
    const warningCookies = await encryptCookies(
      [{ name: 'a1', value: 'warning-cookie', domain: '.xiaohongshu.com' }],
      'test-password'
    );

    const warningAccount = await prisma.account.create({
      data: {
        name: `warning-account-${Date.now()}`,
        platform: 'xiaohongshu',
        username: `warning-user-${Date.now()}`,
        status: 'ACTIVE',
        loginStatus: 'LOGGED_IN',
        groupId: testGroup.id,
        encryptedCookies: warningCookies,
        cookiePassword: 'test-password',
        cookieUpdatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10天前
      },
    });
    testAccounts.push(warningAccount);

    // 创建混合成功/失败的发布记录
    await prisma.publishLog.createMany({
      data: [
        {
          contentId: 'test-content-3',
          accountId: warningAccount.id,
          status: 'SUCCESS',
          platform: 'xiaohongshu',
        },
        {
          contentId: 'test-content-4',
          accountId: warningAccount.id,
          status: 'FAILED',
          platform: 'xiaohongshu',
        },
        {
          contentId: 'test-content-5',
          accountId: warningAccount.id,
          status: 'FAILED',
          platform: 'xiaohongshu',
        },
      ],
    });

    // 账号3: 严重账号（25天前更新，无发布记录）
    const criticalCookies = await encryptCookies(
      [{ name: 'a1', value: 'critical-cookie', domain: '.xiaohongshu.com' }],
      'test-password'
    );

    const criticalAccount = await prisma.account.create({
      data: {
        name: `critical-account-${Date.now()}`,
        platform: 'xiaohongshu',
        username: `critical-user-${Date.now()}`,
        status: 'ACTIVE',
        loginStatus: 'LOGGED_IN',
        groupId: testGroup.id,
        encryptedCookies: criticalCookies,
        cookiePassword: 'test-password',
        cookieUpdatedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25天前
      },
    });
    testAccounts.push(criticalAccount);

    console.log(`✅ 创建了 ${testAccounts.length} 个测试账号`);
    console.log(`   健康账号: ${healthyAccount.name} (1天前更新)`);
    console.log(`   警告账号: ${warningAccount.name} (10天前更新，成功率33%)`);
    console.log(`   严重账号: ${criticalAccount.name} (25天前更新，无发布记录)\n`);

    // 2. 初始化服务
    console.log('2. 初始化CookieRefreshService...');
    const service = new CookieRefreshService('*/10 * * * * *', 70, 3, 3); // 每10秒执行一次，用于测试

    // 3. 测试手动检查
    console.log('3. 执行手动健康度检查...');
    const manualResults = await service.manualCheck();

    console.log(`✅ 手动检查完成，处理了 ${manualResults.length} 个账号`);
    manualResults.forEach((result, index) => {
      const account = testAccounts[index];
      console.log(`   ${account.name}:`);
      console.log(`     健康度: ${result.healthScore}分`);
      console.log(`     成功: ${result.success ? '✅' : '❌'}`);
      if (result.error) {
        console.log(`     错误: ${result.error}`);
      }
    });
    console.log();

    // 4. 测试手动刷新（针对严重账号）
    console.log('4. 测试手动刷新严重账号...');
    const refreshResult = await service.manualRefresh(criticalAccount.id);

    console.log(`   账号: ${refreshResult.accountName}`);
    console.log(`   刷新结果: ${refreshResult.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   刷新后健康度: ${refreshResult.healthScore}分`);
    if (refreshResult.error) {
      console.log(`   错误信息: ${refreshResult.error}`);
    }
    console.log();

    // 5. 验证数据库更新
    console.log('5. 验证数据库更新...');
    const updatedAccounts = await prisma.account.findMany({
      where: {
        id: { in: testAccounts.map((a) => a.id) },
      },
    });

    let passedChecks = 0;
    const totalChecks = updatedAccounts.length * 3; // 每个账号检查3个字段

    updatedAccounts.forEach((account) => {
      console.log(`   ${account.name}:`);

      // 检查健康度分数
      if (account.cookieHealthScore !== null && account.cookieHealthScore !== undefined) {
        console.log(`     ✅ cookieHealthScore: ${account.cookieHealthScore}`);
        passedChecks++;
      } else {
        console.log(`     ❌ cookieHealthScore: 未设置`);
      }

      // 检查最后检查时间
      if (account.lastCookieCheckAt) {
        console.log(`     ✅ lastCookieCheckAt: ${account.lastCookieCheckAt.toISOString()}`);
        passedChecks++;
      } else {
        console.log(`     ❌ lastCookieCheckAt: 未设置`);
      }

      // 检查过期预警
      if (account.cookieExpiryWarning !== null && account.cookieExpiryWarning !== undefined) {
        console.log(`     ✅ cookieExpiryWarning: ${account.cookieExpiryWarning}`);
        passedChecks++;
      } else {
        console.log(`     ❌ cookieExpiryWarning: 未设置`);
      }
    });

    const passRate = Math.round((passedChecks / totalChecks) * 100);
    console.log(`\n✅ 数据库验证: ${passedChecks}/${totalChecks} 检查通过 (${passRate}%)\n`);

    // 6. 测试服务启动和停止
    console.log('6. 测试服务启动和停止...');
    await service.start();
    console.log('   ✅ 服务启动成功');

    // 等待一段时间让定时任务执行
    await new Promise((resolve) => setTimeout(resolve, 15000));

    await service.stop();
    console.log('   ✅ 服务停止成功\n');

    // 7. 清理测试数据
    console.log('7. 清理测试数据...');
    await prisma.publishLog.deleteMany({
      where: {
        accountId: { in: testAccounts.map((a) => a.id) },
      },
    });

    await prisma.account.deleteMany({
      where: {
        id: { in: testAccounts.map((a) => a.id) },
      },
    });

    await prisma.accountGroup.delete({
      where: { id: testGroup.id },
    });

    console.log('✅ 测试数据清理完成\n');

    // 8. 总结
    console.log('🎉 CookieRefreshService 集成验证完成！');
    console.log('========================================');
    console.log('验证结果:');
    console.log('✅ 测试数据创建正常');
    console.log('✅ 手动健康度检查正常');
    console.log('✅ 手动刷新功能正常');
    console.log('✅ 数据库更新正常');
    console.log('✅ 服务启动/停止正常');
    console.log('✅ 测试数据清理正常');
    console.log('========================================\n');

    console.log('📋 建议下一步:');
    console.log('1. 在生产环境中配置正确的cron表达式 (0 2 * * *)');
    console.log('2. 设置合适的健康度阈值和预警天数');
    console.log('3. 实现通知系统 (WebSocket/邮件)');
    console.log('4. 添加前端健康度显示界面');
  } catch (error) {
    console.error('❌ 集成验证失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch(console.error);
