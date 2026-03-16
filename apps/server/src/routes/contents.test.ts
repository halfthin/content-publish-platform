import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { prisma } from '../config/prisma';
import { setupContentsRoutes } from './contents';

const app = new Elysia().use(setupContentsRoutes());

describe('Contents API', () => {
  beforeAll(async () => {
    // 清理测试数据
    await prisma.content.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/contents', () => {
    it('should return empty list when no contents', async () => {
      const res = await app.handle(new Request('http://localhost/api/contents'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
      expect(data.pagination.total).toBe(0);
    });

    it('should support pagination', async () => {
      const res = await app.handle(new Request('http://localhost/api/contents?page=1&limit=10'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
    });
  });

  describe('GET /api/contents/:id', () => {
    it('should return 404 for non-existent content', async () => {
      const res = await app.handle(new Request('http://localhost/api/contents/non-existent-id'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Content not found');
    });
  });

  describe('POST /api/contents/:id/approve', () => {
    it('should return error for non-existent content', async () => {
      const res = await app.handle(
        new Request('http://localhost/api/contents/non-existent-id/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewedBy: 'test' }),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to approve content');
    });
  });

  describe('POST /api/contents/:id/reject', () => {
    it('should return error for non-existent content', async () => {
      const res = await app.handle(
        new Request('http://localhost/api/contents/non-existent-id/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewedBy: 'test' }),
        })
      );
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to reject content');
    });
  });

  describe('POST /api/contents/scan-inbox', () => {
    it('should scan inbox successfully', async () => {
      const res = await app.handle(
        new Request('http://localhost/api/contents/scan-inbox', {
          method: 'POST',
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
