import { describe, test, expect, beforeEach, afterEach, jest, mock } from 'bun:test';
import { CookieRefreshService, type CookieHealthMetrics, type RefreshResult } from '../src/services/cookie-refresh.service';
import { PrismaClient } from '@prisma/client';
import { encryptCookies } from '../src/utils/encryption';

// Mock Prisma client
const prisma = new PrismaClient();

describe('CookieRefreshService - 小红书专用', () => {
  let service: CookieRefreshService;
  let testAccountId: string;
  let testGroupId: string;

  beforeEach(async () => {
    service = new CookieRefreshService('*/5 * * * * *', 70, 3, 3); // 每5秒执行一次，用于测试
    
    // 创建测试分组
    const testGroup = await prisma.accountGroup.create({
      data: {
        name: `test-group-${Date.now()}`,
        platform: 'xiaohongshu',
        description: '测试分组',
      },
    });
    testGroupId = testGroup.id;

    // 创建测试账号
    const testAccount = await prisma.account.create({
      data: {
        name: `test-xiaohongshu-${Date.now()}`,
        platform: 'xiaohongshu',
        username: `test-user-${Date.now()}`,
        status: 'ACTIVE',
        loginStatus: 'LOGGED_IN',
        groupId: testGroupId,
        encryptedCookies: 'test-encrypted-cookies',
        cookiePassword: 'test-password',
        cookieUpdatedAt: new Date(),
      },
    });
    testAccountId = testAccount.id;
  });

  afterEach(async () => {
    // 清理测试数据
    await prisma.account.deleteMany({
      where: { groupId: testGroupId },
    });
    
    await prisma.accountGroup.delete({
      where: { id: testGroupId },
    });
  });

  test('CookieRefreshService实例化正常', () => {
    expect(service).toBeDefined();
    expect(service.start).toBeDefined();
    expect(service.stop).toBeDefined();
    expect(service.checkAllXiaohongshuAccounts).toBeDefined();
  });

  test('小红书Cookie健康度评估算法', async () => {
    // 创建测试账号数据
    const mockAccount = {
      id: testAccountId,
      name: 'test-account',
      cookieUpdatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5天前
      publishLogs: [
        { status: 'SUCCESS', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
        { status: 'SUCCESS', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { status: 'FAILED', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      ],
    };

    // 评估健康度
    const metrics = await (service as any).evaluateXiaohongshuCookieHealth(mockAccount);

    // 验证返回结构
    expect(metrics).toHaveProperty('ageScore');
    expect(metrics).toHaveProperty('usageScore');
    expect(metrics).toHaveProperty('successRateScore');
    expect(metrics).toHaveProperty('totalScore');
    expect(metrics).toHaveProperty('healthLevel');

    // 验证分数范围
    expect(metrics.ageScore).toBeGreaterThanOrEqual(0);
    expect(metrics.ageScore).toBeLessThanOrEqual(30);
    expect(metrics.usageScore).toBeGreaterThanOrEqual(0);
    expect(metrics.usageScore).toBeLessThanOrEqual(30);
    expect(metrics.successRateScore).toBeGreaterThanOrEqual(0);
    expect(metrics.successRateScore).toBeLessThanOrEqual(40);
    expect(metrics.totalScore).toBeGreaterThanOrEqual(0);
    expect(metrics.totalScore).toBeLessThanOrEqual(100);

    // 验证健康等级
    expect(['HEALTHY', 'WARNING', 'CRITICAL', 'EXPIRED']).toContain(metrics.healthLevel);
  });

  test('过期Cookie的健康度评估', async () => {
    // 创建过期Cookie的测试账号数据
    const mockAccount = {
      id: testAccountId,
      name: 'test-account',
      cookieUpdatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30天前，已过期
      publishLogs: [],
    };

    const metrics = await (service as any).evaluateXiaohongshuCookieHealth(mockAccount);

    // 过期Cookie应该得低分
    expect(metrics.ageScore).toBe(0);
    // 注意：根据算法，30天过期应该是EXPIRED，但算法中21天以上就是EXPIRED
    // 所以这里应该是EXPIRED
    expect(metrics.healthLevel).toBe('EXPIRED');
    expect(metrics.totalScore).toBeLessThan(30);
  });

  test('频繁使用的Cookie健康度评估', async () => {
    // 创建频繁使用的测试账号数据
    const mockAccount = {
      id: testAccountId,
      name: 'test-account',
      encryptedCookies: 'test-encrypted-cookies', // 添加这个字段
      cookieUpdatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1天前
      publishLogs: Array(10).fill(null).map((_, i) => ({
        status: 'SUCCESS',
        createdAt: new Date(Date.now() - i * 2 * 60 * 60 * 1000), // 每2小时一次
      })),
    };

    const metrics = await (service as any).evaluateXiaohongshuCookieHealth(mockAccount);

    // 频繁使用的Cookie应该得高分
    expect(metrics.ageScore).toBe(30); // 1天内，满分
    expect(metrics.usageScore).toBe(30); // 7天内10次发布，满分
    expect(metrics.successRateScore).toBe(40); // 100%成功率，满分
    expect(metrics.totalScore).toBe(100);
    expect(metrics.healthLevel).toBe('HEALTHY');
  });

  test('检查并刷新账号流程', async () => {
    // 获取测试账号
    const account = await prisma.account.findUnique({
      where: { id: testAccountId },
      include: {
        publishLogs: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
    });

    expect(account).not.toBeNull();

    // 执行检查
    const result = await (service as any).checkAndRefreshAccount(account);

    // 验证返回结果
    expect(result).toHaveProperty('accountId', testAccountId);
    expect(result).toHaveProperty('accountName', account!.name);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('healthScore');
    
    // 健康度分数应该在0-100之间
    if (result.healthScore !== undefined) {
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    }

    // 验证数据库已更新
    const updatedAccount = await prisma.account.findUnique({
      where: { id: testAccountId },
    });

    expect(updatedAccount?.cookieHealthScore).toBe(result.healthScore);
    expect(updatedAccount?.lastCookieCheckAt).not.toBeNull();
  });

  test('手动刷新方法', async () => {
    // 测试手动刷新方法
    const result = await service.manualRefresh(testAccountId);

    expect(result).toHaveProperty('accountId', testAccountId);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('healthScore');
  });

  test('服务启动和停止', async () => {
    // 测试服务启动
    await service.start();
    
    // 等待一小段时间确保定时任务已启动
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试服务停止
    await service.stop();
    
    // 验证服务状态
    expect(service).toBeDefined();
  });
});

describe('CookieRefreshService - 错误处理', () => {
  let service: CookieRefreshService;

  beforeEach(() => {
    service = new CookieRefreshService();
  });

  test('处理不存在的账号', async () => {
    const nonExistentAccountId = 'non-existent-id';
    
    // 应该抛出错误或返回失败结果
    await expect(service.manualRefresh(nonExistentAccountId))
      .rejects
      .toThrow();
  });

  test('处理没有Cookie的账号', async () => {
    // 创建没有Cookie的测试账号
    const testGroup = await prisma.accountGroup.create({
      data: {
        name: `test-group-error-${Date.now()}`,
        platform: 'xiaohongshu',
        description: '错误测试分组',
      },
    });

    const testAccount = await prisma.account.create({
      data: {
        name: `test-no-cookie-${Date.now()}`,
        platform: 'xiaohongshu',
        username: `test-no-cookie-user-${Date.now()}`,
        status: 'ACTIVE',
        loginStatus: 'LOGGED_IN',
        groupId: testGroup.id,
        // 不设置encryptedCookies
      },
    });

    const result = await (service as any).checkAndRefreshAccount({
      id: testAccount.id,
      name: testAccount.name,
      encryptedCookies: null,
      cookieUpdatedAt: null,
      publishLogs: [],
    });

    // 应该返回失败结果
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // 清理
    await prisma.account.delete({ where: { id: testAccount.id } });
    await prisma.accountGroup.delete({ where: { id: testGroup.id } });
  });
});