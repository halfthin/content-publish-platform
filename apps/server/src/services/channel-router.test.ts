import { describe, it, expect, beforeEach } from 'bun:test';
import { ChannelRouter } from './channel-router';
import type { Publisher, PublishResult, AuthStatus, PublishJobPayload } from '../types/publisher';

function createMockPublisher(platform: string, name: string): Publisher {
  return {
    platform,
    name,
    async publish(_job: PublishJobPayload): Promise<PublishResult> {
      return { success: true, externalId: `${name}-result` };
    },
    async checkAuth(): Promise<AuthStatus> {
      return { loggedIn: true };
    },
    validateConfig(): boolean {
      return true;
    },
  };
}

describe('ChannelRouter', () => {
  let router: ChannelRouter;

  beforeEach(() => {
    router = new ChannelRouter();
  });

  it('registers and resolves a publisher', () => {
    const pub = createMockPublisher('xiaohongshu', 'xhs-1');
    router.register(pub);
    const resolved = router.resolve({
      id: '1', platform: 'xiaohongshu', accountName: 'xhs-1',
      accountId: 'a1', action: 'publish', payload: {}, createdAt: new Date(),
    });
    expect(resolved.name).toBe('xhs-1');
  });

  it('falls back to default publisher', () => {
    const def = createMockPublisher('xiaohongshu', 'default');
    router.register(def);
    const resolved = router.resolve({
      id: '2', platform: 'xiaohongshu', accountName: 'unknown',
      accountId: 'a2', action: 'publish', payload: {}, createdAt: new Date(),
    });
    expect(resolved.name).toBe('default');
  });

  it('throws when no publisher found', () => {
    expect(() => {
      router.resolve({
        id: '3', platform: 'wechat', accountName: 'default',
        accountId: 'a3', action: 'publish', payload: {}, createdAt: new Date(),
      });
    }).toThrow('No publisher found for wechat:default');
  });

  it('publishes via resolved publisher', async () => {
    const pub = createMockPublisher('xiaohongshu', 'xhs-1');
    router.register(pub);
    const result = await router.publish({
      id: '4', platform: 'xiaohongshu', accountName: 'xhs-1',
      accountId: 'a4', action: 'publish', payload: {}, createdAt: new Date(),
    });
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('xhs-1-result');
  });
});
