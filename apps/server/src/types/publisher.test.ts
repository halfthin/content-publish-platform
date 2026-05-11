import { describe, it, expect } from 'bun:test';
import type { PublishResult, PublishJobPayload } from './publisher';

describe('Publisher types', () => {
  it('PublishResult can be success', () => {
    const result: PublishResult = {
      success: true,
      externalId: 'note_123',
      url: 'https://xiaohongshu.com/note/123',
    };
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('note_123');
  });

  it('PublishResult can be failure', () => {
    const result: PublishResult = {
      success: false,
      error: 'Login expired',
      errorCode: 'NEEDS_AUTH',
    };
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NEEDS_AUTH');
  });

  it('PublishJobPayload carries platform and action', () => {
    const job: PublishJobPayload = {
      id: 'job-1',
      platform: 'xiaohongshu',
      accountId: 'acc-1',
      accountName: '不加糖也很酷',
      action: 'publish',
      payload: { title: 'test', images: [] },
      createdAt: new Date(),
    };
    expect(job.platform).toBe('xiaohongshu');
    expect(job.accountName).toBe('不加糖也很酷');
  });
});
