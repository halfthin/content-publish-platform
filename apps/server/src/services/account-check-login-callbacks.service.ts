import { getRedisClient } from '../config/redis';
import type { OpenClawCallbackEnvelopeV1 } from '../types/openclaw-callback';

const ACCOUNT_CHECK_LOGIN_CALLBACK_KEY_PREFIX = 'account:check-login:last:';

export interface AccountCheckLoginCallbackSnapshot {
  accountId: string;
  taskId: string;
  eventId: string;
  status: OpenClawCallbackEnvelopeV1['status'];
  updatedAt: string;
  callbackPayload: {
    raw: Record<string, unknown>;
    normalized: OpenClawCallbackEnvelopeV1;
  };
}

export interface AccountCheckLoginCallbackStore {
  get(accountId: string): Promise<AccountCheckLoginCallbackSnapshot | null>;
  set(snapshot: AccountCheckLoginCallbackSnapshot): Promise<void>;
}

class RedisAccountCheckLoginCallbackStore implements AccountCheckLoginCallbackStore {
  async get(accountId: string): Promise<AccountCheckLoginCallbackSnapshot | null> {
    const raw = await getRedisClient().get(
      `${ACCOUNT_CHECK_LOGIN_CALLBACK_KEY_PREFIX}${accountId}`
    );
    return raw ? (JSON.parse(raw) as AccountCheckLoginCallbackSnapshot) : null;
  }

  async set(snapshot: AccountCheckLoginCallbackSnapshot): Promise<void> {
    await getRedisClient().set(
      `${ACCOUNT_CHECK_LOGIN_CALLBACK_KEY_PREFIX}${snapshot.accountId}`,
      JSON.stringify(snapshot)
    );
  }
}

export function createRedisAccountCheckLoginCallbackStore(): AccountCheckLoginCallbackStore {
  return new RedisAccountCheckLoginCallbackStore();
}

export function createInMemoryAccountCheckLoginCallbackStore(): AccountCheckLoginCallbackStore {
  const records = new Map<string, AccountCheckLoginCallbackSnapshot>();

  return {
    async get(accountId) {
      const record = records.get(accountId);
      return record ? { ...record } : null;
    },
    async set(snapshot) {
      records.set(snapshot.accountId, {
        ...snapshot,
      });
    },
  };
}
