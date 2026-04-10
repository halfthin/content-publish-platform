import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }

  return redisClient;
}

export async function disconnectRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(async () => {
      await redisClient?.disconnect(false);
    });
    redisClient = null;
  }
}
