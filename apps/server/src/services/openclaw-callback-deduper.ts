import { getRedisClient } from '../config/redis';

const CALLBACK_EVENT_KEY_PREFIX = 'openclaw:callback:event:';
const DEFAULT_EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface OpenClawCallbackEventDeduper {
  claim(eventId: string): Promise<boolean>;
  release(eventId: string): Promise<void>;
}

class RedisOpenClawCallbackEventDeduper implements OpenClawCallbackEventDeduper {
  constructor(private readonly ttlSeconds: number = DEFAULT_EVENT_TTL_SECONDS) {}

  async claim(eventId: string): Promise<boolean> {
    const result = await getRedisClient().set(
      `${CALLBACK_EVENT_KEY_PREFIX}${eventId}`,
      new Date().toISOString(),
      'EX',
      this.ttlSeconds,
      'NX'
    );

    return result === 'OK';
  }

  async release(eventId: string): Promise<void> {
    await getRedisClient().del(`${CALLBACK_EVENT_KEY_PREFIX}${eventId}`);
  }
}

export function createRedisOpenClawCallbackEventDeduper(
  ttlSeconds: number = DEFAULT_EVENT_TTL_SECONDS
): OpenClawCallbackEventDeduper {
  return new RedisOpenClawCallbackEventDeduper(ttlSeconds);
}

export function createInMemoryOpenClawCallbackEventDeduper(): OpenClawCallbackEventDeduper {
  const claimedEventIds = new Set<string>();

  return {
    async claim(eventId) {
      if (claimedEventIds.has(eventId)) {
        return false;
      }

      claimedEventIds.add(eventId);
      return true;
    },
    async release(eventId) {
      claimedEventIds.delete(eventId);
    },
  };
}
