import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { prisma } from '../config/prisma';
import { setupAccountsRoutes } from './accounts';

const app = new Elysia().use(setupAccountsRoutes());

describe('Accounts API', () => {
  beforeAll(async () => {
    // 清理测试数据
    await prisma.account.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/accounts', () => {
    it('should return empty list when no accounts', async () => {
      const res = await app.handle(new Request('http://localhost/api/accounts'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should support pagination parameters', async () => {
      const res = await app.handle(new Request('http://localhost/api/accounts?page=2&limit=5'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.limit).toBe(5);
    });
  });

  describe('POST /api/accounts', () => {
    it('should create new account with valid data', async () => {
      const accountData = {
        name: '测试账号',
        platform: 'xiaohongshu',
        username: 'test_user',
        status: 'active' as const,
      };

      const res = await app.handle(
        new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(accountData),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('测试账号');
      expect(data.data.platform).toBe('xiaohongshu');
    });

    it('should return error for invalid platform', async () => {
      const invalidData = {
        name: '测试账号',
        platform: 'invalid_platform',
        username: 'test_user',
      };

      const res = await app.handle(
        new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidData),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('platform');
    });

    it('should require name field', async () => {
      const missingData = {
        platform: 'xiaohongshu',
        username: 'test_user',
      };

      const res = await app.handle(
        new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(missingData),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('name');
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('should return 404 for non-existent account', async () => {
      const res = await app.handle(new Request('http://localhost/api/accounts/non-existent-id'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });
  });

  describe('PUT /api/accounts/:id', () => {
    it('should return 404 for non-existent account', async () => {
      const updateData = {
        name: '更新后的名称',
      };

      const res = await app.handle(
        new Request('http://localhost/api/accounts/non-existent-id', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });
  });

  describe('POST /api/accounts/:id/cookies', () => {
    it('should return 404 for non-existent account', async () => {
      const cookieData = {
        cookies: '[{"name":"test","value":"cookie"}]',
        password: 'test-password',
      };

      const res = await app.handle(
        new Request('http://localhost/api/accounts/non-existent-id/cookies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cookieData),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });

    it('should validate cookie JSON format', async () => {
      // 先创建一个测试账号
      const createRes = await app.handle(
        new Request('http://localhost/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Cookie测试账号',
            platform: 'xiaohongshu',
            username: 'cookie_test',
          }),
        })
      );
      const createData = await createRes.json();
      const accountId = createData.data.id;

      // 测试无效的Cookie JSON
      const invalidCookieData = {
        cookies: 'invalid-json',
        password: 'test-password',
      };

      const res = await app.handle(
        new Request(`http://localhost/api/accounts/${accountId}/cookies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidCookieData),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid cookie format');
    });
  });

  describe('GET /api/accounts/:id/cookies/verify', () => {
    it('should return 404 for non-existent account', async () => {
      const res = await app.handle(
        new Request('http://localhost/api/accounts/non-existent-id/cookies/verify')
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });
  });

  describe('DELETE /api/accounts/:id', () => {
    it('should return 404 for non-existent account', async () => {
      const res = await app.handle(
        new Request('http://localhost/api/accounts/non-existent-id', {
          method: 'DELETE',
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });
  });
});