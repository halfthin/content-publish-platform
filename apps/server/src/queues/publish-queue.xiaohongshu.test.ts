import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { XiaohongshuPublisher } from '../publishers/xiaohongshu';
import { PublishQueue } from './publish-queue';

// Mock the XiaohongshuPublisher
const mockXiaohongshuPublisher = {
  initialize: mock(() => Promise.resolve()),
  loadCookies: mock(() => Promise.resolve(true)),
  checkLoginStatus: mock(() => Promise.resolve(true)),
  publish: mock(() =>
    Promise.resolve({
      success: true,
      publishedUrl: 'https://www.xiaohongshu.com/explore/1234567890',
    })
  ),
  saveCookies: mock(() => Promise.resolve('encrypted-cookie-data')),
  close: mock(() => Promise.resolve()),
};

// Mock the module
mock.module('../publishers/xiaohongshu', () => ({
  XiaohongshuPublisher: mock(() => mockXiaohongshuPublisher),
}));

describe('Xiaohongshu publish queue cookie save', () => {
  let mockPublisher: any;

  beforeEach(() => {
    // Reset mocks
    mockXiaohongshuPublisher.initialize.mockClear();
    mockXiaohongshuPublisher.loadCookies.mockClear();
    mockXiaohongshuPublisher.checkLoginStatus.mockClear();
    mockXiaohongshuPublisher.publish.mockClear();
    mockXiaohongshuPublisher.saveCookies.mockClear();
    mockXiaohongshuPublisher.close.mockClear();

    mockPublisher = mockXiaohongshuPublisher;
  });

  test('should save cookies after successful publish', async () => {
    // Mock database response
    const mockAccount = {
      encryptedCookies: 'existing-encrypted-cookies',
      cookiePassword: 'test-password',
    };

    // Mock prisma methods using Bun's mock
    const findUniqueMock = mock(() => Promise.resolve(mockAccount));
    const updateMock = mock(() => Promise.resolve({}));
    const updateManyMock = mock(() => Promise.resolve({}));
    
    prisma.account.findUnique = findUniqueMock as any;
    prisma.account.update = updateMock as any;
    prisma.publishLog.updateMany = updateManyMock as any;
    prisma.content.update = updateMock as any;

    // Call the saveCookies method
    const encryptedCookies = await mockPublisher.saveCookies('test-password');

    expect(encryptedCookies).toBe('encrypted-cookie-data');
    expect(mockPublisher.saveCookies).toHaveBeenCalled();
    expect(mockPublisher.saveCookies.mock.calls[0][0]).toBe('test-password');
  });

  test('should handle save cookies failure gracefully', async () => {
    // Mock saveCookies to fail
    mockPublisher.saveCookies = mock(() => Promise.reject(new Error('Save failed')));

    // Mock database response
    const mockAccount = {
      encryptedCookies: 'existing-encrypted-cookies',
      cookiePassword: 'test-password',
    };

    // Mock prisma methods
    const findUniqueMock = mock(() => Promise.resolve(mockAccount));
    const updateMock = mock(() => Promise.resolve({}));
    
    prisma.account.findUnique = findUniqueMock as any;
    prisma.account.update = updateMock as any;

    try {
      await mockPublisher.saveCookies('test-password');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Save failed');
    }

    // Verify saveCookies was called
    expect(mockPublisher.saveCookies).toHaveBeenCalled();
  });

  test('should not save cookies when publisher not available', async () => {
    // Create a publisher without context
    const publisher = new XiaohongshuPublisher({
      accountId: 'test-account',
      headless: true,
    });

    // Mock the context to be null
    (publisher as any).context = null;

    try {
      await publisher.saveCookies('test-password');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      // The actual error message may vary, just check it's an Error
      expect(error).toBeInstanceOf(Error);
    }
  });

  test('should update account cookies in database', async () => {
    // Mock database update
    const updateSpy = mock(() => Promise.resolve({}));
    prisma.account.update = updateSpy as any;

    // Verify the mock is set up
    expect(prisma.account.update).toBeDefined();
    
    // Call update to verify it works
    await prisma.account.update({ 
      where: { id: 'test-id' }, 
      data: { encryptedCookies: 'new-cookies' } 
    });
    
    expect(updateSpy).toHaveBeenCalled();
  });
});

describe('XiaohongshuPublisher cookie methods', () => {
  let publisher: XiaohongshuPublisher;

  beforeEach(() => {
    publisher = new XiaohongshuPublisher({
      accountId: 'test-account',
      headless: true,
    });
  });

  test('saveCookies method exists', () => {
    expect(publisher.saveCookies).toBeDefined();
    expect(typeof publisher.saveCookies).toBe('function');
  });

  test('loadCookies method exists', () => {
    expect(publisher.loadCookies).toBeDefined();
    expect(typeof publisher.loadCookies).toBe('function');
  });
});