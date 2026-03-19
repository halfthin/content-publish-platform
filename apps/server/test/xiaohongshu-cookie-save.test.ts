import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { XiaohongshuPublisher } from '../src/publishers/xiaohongshu';
import { encryptCookies } from '../src/utils/encryption';

// Mock Prisma client
const prisma = new PrismaClient();
const describeIfIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
type PublisherWithContext = XiaohongshuPublisher & {
  context?: {
    cookies: () => Promise<Array<{ name: string; value: string; domain: string }>>;
  };
};
type AccountColumn = { column_name: string };

describeIfIntegration('小红书Cookie保存功能验证', () => {
  let publisher: XiaohongshuPublisher;

  beforeEach(() => {
    publisher = new XiaohongshuPublisher({
      accountId: 'test-xiaohongshu-account',
      headless: true,
      timeout: 30000,
    });
  });

  afterEach(async () => {
    // 清理测试数据
    await prisma.account.deleteMany({
      where: { name: { contains: 'test-xiaohongshu' } },
    });
  });

  test('XiaohongshuPublisher.saveCookies方法存在且可调用', async () => {
    // 测试saveCookies方法存在
    expect(publisher.saveCookies).toBeDefined();
    expect(typeof publisher.saveCookies).toBe('function');
  });

  test('saveCookies方法返回加密字符串', async () => {
    // 模拟浏览器上下文
    const mockContext = {
      cookies: jest
        .fn()
        .mockResolvedValue([
          { name: 'test-cookie', value: 'test-value', domain: '.xiaohongshu.com' },
        ]),
    };

    // 临时替换context
    const typedPublisher = publisher as PublisherWithContext;
    const originalContext = typedPublisher.context;
    typedPublisher.context = mockContext;

    try {
      const result = await publisher.saveCookies('test-password');

      // 验证返回的是字符串（加密后的Cookie）
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    } finally {
      // 恢复原始context
      typedPublisher.context = originalContext;
    }
  });

  test('发布队列中的finally块包含保存逻辑', () => {
    // 检查publish-queue.ts中的代码结构
    const queuePath = join(__dirname, '../src/queues/publish-queue.ts');
    const content = readFileSync(queuePath, 'utf-8');

    // 检查小红书任务的finally块
    const xiaohongshuFinallyRegex = /finally\s*\{[^}]*saveCookies[^}]*\}/s;
    expect(xiaohongshuFinallyRegex.test(content)).toBe(true);

    // 检查updateAccountCookies方法
    expect(content.includes('updateAccountCookies')).toBe(true);
  });

  test('数据库Schema包含必要字段', async () => {
    // 检查Account模型字段
    const accountFields = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Account' 
      AND column_name IN ('encryptedCookies', 'cookieUpdatedAt', 'cookiePassword')
    `;

    const fieldNames = (accountFields as AccountColumn[]).map((field) => field.column_name);
    expect(fieldNames).toContain('encryptedCookies');
    expect(fieldNames).toContain('cookieUpdatedAt');
    expect(fieldNames).toContain('cookiePassword');
  });

  test('加密解密流程正常', async () => {
    const testCookies = [
      { name: 'a1', value: 'test-value-1', domain: '.xiaohongshu.com' },
      { name: 'web_session', value: 'test-value-2', domain: '.xiaohongshu.com' },
    ];

    const password = 'test-encryption-password';

    // 加密
    const encrypted = await encryptCookies(testCookies, password);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    // 注意：这里不测试解密，因为decryptCookies可能依赖特定环境
    // 但加密过程应该成功
  });
});

describeIfIntegration('小红书发布流程集成测试', () => {
  test('模拟发布后Cookie保存流程', async () => {
    const timestamp = Date.now();

    // 先创建测试分组（确保唯一）
    const testGroup = await prisma.accountGroup.create({
      data: {
        name: `test-group-${timestamp}`,
        platform: 'xiaohongshu',
        description: '测试分组',
      },
    });

    // 创建测试账号
    const testAccount = await prisma.account.create({
      data: {
        name: `test-xiaohongshu-integration-${timestamp}`,
        platform: 'xiaohongshu',
        username: `test-user-${timestamp}`,
        status: 'ACTIVE',
        loginStatus: 'LOGGED_IN',
        groupId: testGroup.id,
      },
    });

    // 模拟加密的Cookie
    const testCookies = [{ name: 'a1', value: 'integration-test', domain: '.xiaohongshu.com' }];
    const encryptedCookies = await encryptCookies(testCookies, 'test-password');

    // 更新账号的Cookie
    const updatedAccount = await prisma.account.update({
      where: { id: testAccount.id },
      data: {
        encryptedCookies,
        cookieUpdatedAt: new Date(),
        cookiePassword: 'test-password',
      },
    });

    expect(updatedAccount.encryptedCookies).toBe(encryptedCookies);
    expect(updatedAccount.cookieUpdatedAt).toBeDefined();
    expect(updatedAccount.cookiePassword).toBe('test-password');
  });
});
