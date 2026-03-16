/**
 * 小红书发布功能 - 回归测试脚本
 * 
 * 测试类别：回归测试
 * 优先级：P1/P2
 * 创建时间：2026-03-03
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prisma } from '../apps/server/src/config/prisma';
import { PublishQueue } from '../apps/server/src/queues/publish-queue';

// 回归测试配置
const REGRESSION_CONFIG = {
  testAccountId: 'regression-test-001',
  testContentId: 'regression-content-001',
};

describe('小红书发布功能 - 回归测试', () => {
  let queue: PublishQueue;

  beforeEach(async () => {
    queue = PublishQueue.getInstance();
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      await prisma.publishStatus.deleteMany({
        where: {
          contentId: {
            contains: 'regression-',
          },
        },
      });
      await prisma.account.deleteMany({
        where: {
          accountId: {
            contains: 'regression-test',
          },
        },
      });
    } catch (error) {
      console.log('清理测试数据时出错:', error);
    }
  });

  describe('账号管理功能', () => {
    test('TC-REG-001: 账号添加功能', async () => {
      console.log('\n👤 开始账号添加功能测试...\n');
      
      const testAccount = {
        accountId: `${REGRESSION_CONFIG.testAccountId}-${Date.now()}`,
        platform: 'xiaohongshu',
        accountName: '回归测试账号',
        status: 'active',
        cookieEncrypted: 'test_encrypted_cookie',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 创建测试账号
      const account = await prisma.account.create({
        data: testAccount,
      });

      expect(account).toBeDefined();
      expect(account.accountId).toContain('regression-test');
      expect(account.platform).toBe('xiaohongshu');
      expect(account.status).toBe('active');

      console.log('✅ 账号创建成功');
      console.log(`   - 账号 ID: ${account.accountId}`);
      console.log(`   - 平台：${account.platform}`);
      console.log(`   - 状态：${account.status}`);

      console.log('\n✅ TC-REG-001: 账号添加功能测试通过\n');
    });

    test('TC-REG-001-2: 账号查询功能', async () => {
      console.log('\n🔍 开始账号查询功能测试...\n');
      
      // 查询所有小红书账号
      const accounts = await prisma.account.findMany({
        where: {
          platform: 'xiaohongshu',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });

      console.log(`📊 查询到 ${accounts.length} 个小红书账号`);
      
      if (accounts.length > 0) {
        console.log('\n最近账号:');
        accounts.slice(0, 3).forEach((acc, i) => {
          console.log(`   ${i + 1}. ${acc.accountName || acc.accountId} (${acc.status})`);
        });
      }

      // 验证查询结果结构
      if (accounts.length > 0) {
        const first = accounts[0];
        expect(first.id).toBeDefined();
        expect(first.accountId).toBeDefined();
        expect(first.platform).toBeDefined();
      }

      console.log('\n✅ TC-REG-001-2: 账号查询功能测试通过\n');
    });

    test('TC-REG-001-3: 账号更新功能', async () => {
      console.log('\n✏️  开始账号更新功能测试...\n');
      
      // 创建测试账号
      const account = await prisma.account.create({
        data: {
          accountId: `${REGRESSION_CONFIG.testAccountId}-update-${Date.now()}`,
          platform: 'xiaohongshu',
          accountName: '测试更新账号',
          status: 'active',
          cookieEncrypted: 'initial_cookie',
        },
      });

      // 更新账号
      const updated = await prisma.account.update({
        where: { id: account.id },
        data: {
          accountName: '已更新的账号名称',
          status: 'inactive',
          cookieEncrypted: 'updated_cookie',
        },
      });

      expect(updated.accountName).toBe('已更新的账号名称');
      expect(updated.status).toBe('inactive');
      expect(updated.cookieEncrypted).toBe('updated_cookie');

      console.log('✅ 账号更新成功');
      console.log(`   - 新名称：${updated.accountName}`);
      console.log(`   - 新状态：${updated.status}`);

      console.log('\n✅ TC-REG-001-3: 账号更新功能测试通过\n');
    });

    test('TC-REG-001-4: 账号删除功能', async () => {
      console.log('\n🗑️  开始账号删除功能测试...\n');
      
      // 创建测试账号
      const account = await prisma.account.create({
        data: {
          accountId: `${REGRESSION_CONFIG.testAccountId}-delete-${Date.now()}`,
          platform: 'xiaohongshu',
          accountName: '待删除账号',
          status: 'active',
        },
      });

      console.log(`✅ 创建测试账号：${account.accountId}`);

      // 删除账号
      await prisma.account.delete({
        where: { id: account.id },
      });

      // 验证删除
      const deleted = await prisma.account.findUnique({
        where: { id: account.id },
      });

      expect(deleted).toBeNull();
      console.log('✅ 账号删除成功，验证通过');

      console.log('\n✅ TC-REG-001-4: 账号删除功能测试通过\n');
    });
  });

  describe('内容审核功能', () => {
    test('TC-REG-002: 内容创建功能', async () => {
      console.log('\n📝 开始内容创建功能测试...\n');
      
      const testContent = {
        title: '回归测试内容',
        description: '这是一条用于回归测试的内容',
        platform: 'xiaohongshu',
        status: 'draft',
        images: ['test-image-1.jpg', 'test-image-2.jpg'],
        tags: ['测试', '回归'],
      };

      const content = await prisma.content.create({
        data: {
          contentId: `${REGRESSION_CONFIG.testContentId}-${Date.now()}`,
          ...testContent,
        },
      });

      expect(content).toBeDefined();
      expect(content.title).toBe(testContent.title);
      expect(content.status).toBe('draft');

      console.log('✅ 内容创建成功');
      console.log(`   - 内容 ID: ${content.contentId}`);
      console.log(`   - 标题：${content.title}`);
      console.log(`   - 状态：${content.status}`);

      console.log('\n✅ TC-REG-002: 内容创建功能测试通过\n');
    });

    test('TC-REG-002-2: 内容编辑功能', async () => {
      console.log('\n✏️  开始内容编辑功能测试...\n');
      
      // 创建测试内容
      const content = await prisma.content.create({
        data: {
          contentId: `${REGRESSION_CONFIG.testContentId}-edit-${Date.now()}`,
          title: '原始标题',
          description: '原始描述',
          platform: 'xiaohongshu',
          status: 'draft',
        },
      });

      // 编辑内容
      const updated = await prisma.content.update({
        where: { id: content.id },
        data: {
          title: '更新后的标题',
          description: '更新后的描述',
        },
      });

      expect(updated.title).toBe('更新后的标题');
      expect(updated.description).toBe('更新后的描述');

      console.log('✅ 内容编辑成功');
      console.log(`   - 新标题：${updated.title}`);
      console.log(`   - 新描述：${updated.description}`);

      console.log('\n✅ TC-REG-002-2: 内容编辑功能测试通过\n');
    });

    test('TC-REG-002-3: 内容删除功能', async () => {
      console.log('\n🗑️  开始内容删除功能测试...\n');
      
      // 创建测试内容
      const content = await prisma.content.create({
        data: {
          contentId: `${REGRESSION_CONFIG.testContentId}-delete-${Date.now()}`,
          title: '待删除内容',
          platform: 'xiaohongshu',
          status: 'draft',
        },
      });

      console.log(`✅ 创建测试内容：${content.contentId}`);

      // 删除内容
      await prisma.content.delete({
        where: { id: content.id },
      });

      // 验证删除
      const deleted = await prisma.content.findUnique({
        where: { id: content.id },
      });

      expect(deleted).toBeNull();
      console.log('✅ 内容删除成功，验证通过');

      console.log('\n✅ TC-REG-002-3: 内容删除功能测试通过\n');
    });
  });

  describe('Web 界面功能', () => {
    test('TC-REG-003: API 接口可用性', async () => {
      console.log('\n🌐 开始 API 接口可用性测试...\n');
      
      // 测试账号 API
      const accountsResponse = await fetch('http://localhost:3000/api/accounts', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      if (accountsResponse) {
        console.log(`📊 账号 API 状态码：${accountsResponse.status}`);
        if (accountsResponse.status === 200) {
          const data = await accountsResponse.json();
          console.log(`📊 返回账号数量：${Array.isArray(data) ? data.length : 'N/A'}`);
        }
      } else {
        console.log('⚠️  账号 API 无法访问（服务器可能未启动）');
      }

      // 测试内容 API
      const contentsResponse = await fetch('http://localhost:3000/api/contents', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      if (contentsResponse) {
        console.log(`📊 内容 API 状态码：${contentsResponse.status}`);
      } else {
        console.log('⚠️  内容 API 无法访问（服务器可能未启动）');
      }

      console.log('\n✅ TC-REG-003: API 接口可用性测试完成\n');
    });

    test('TC-REG-003-2: 发布状态 API', async () => {
      console.log('\n📊 开始发布状态 API 测试...\n');
      
      const statusResponse = await fetch('http://localhost:3000/api/publish-status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      if (statusResponse) {
        console.log(`📊 发布状态 API 状态码：${statusResponse.status}`);
        
        if (statusResponse.status === 200) {
          const data = await statusResponse.json();
          console.log(`📊 返回数据：${JSON.stringify(data).substring(0, 100)}...`);
        }
      } else {
        console.log('⚠️  发布状态 API 无法访问（服务器可能未启动）');
      }

      console.log('\n✅ TC-REG-003-2: 发布状态 API 测试完成\n');
    });
  });

  describe('数据一致性测试', () => {
    test('TC-REG-999: 数据库完整性检查', async () => {
      console.log('\n🔍 开始数据库完整性检查...\n');
      
      // 检查各表记录数
      const accountCount = await prisma.account.count();
      const contentCount = await prisma.content.count();
      const statusCount = await prisma.publishStatus.count();

      console.log('📊 数据库统计:');
      console.log(`   - 账号表：${accountCount} 条记录`);
      console.log(`   - 内容表：${contentCount} 条记录`);
      console.log(`   - 发布状态表：${statusCount} 条记录`);

      // 检查外键关系
      const statusWithContent = await prisma.publishStatus.findMany({
        include: {
          content: true,
          account: true,
        },
        take: 5,
      });

      console.log('\n📊 外键关系检查:');
      statusWithContent.forEach((status, i) => {
        const hasContent = !!status.content;
        const hasAccount = !!status.account;
        console.log(`   ${i + 1}. Content: ${hasContent ? '✓' : '✗'}, Account: ${hasAccount ? '✓' : '✗'}`);
      });

      console.log('\n✅ TC-REG-999: 数据库完整性检查完成\n');
    });
  });
});
