import { createLogger } from '../config/logger';
import type { Publisher, PublishJobPayload, PublishResult } from '../types/publisher';

const logger = createLogger('channel-router');

export class ChannelRouter {
  private publishers = new Map<string, Publisher>();

  /** 注册 Publisher，key = platform:name */
  register(publisher: Publisher): void {
    const key = `${publisher.platform}:${publisher.name}`;
    this.publishers.set(key, publisher);
    logger.info('Publisher registered', { platform: publisher.platform, name: publisher.name });
  }

  /** 根据 job 找到对应的 Publisher */
  resolve(job: PublishJobPayload): Publisher {
    const exactKey = `${job.platform}:${job.accountName}`;
    const exact = this.publishers.get(exactKey);
    if (exact) return exact;

    const defaultKey = `${job.platform}:default`;
    const fallback = this.publishers.get(defaultKey);
    if (fallback) return fallback;

    throw new Error(`No publisher found for ${job.platform}:${job.accountName}`);
  }

  /** 获取某平台的所有 Publisher */
  getByPlatform(platform: string): Publisher[] {
    return Array.from(this.publishers.values()).filter((p) => p.platform === platform);
  }

  /** 获取所有已注册的平台列表 */
  getPlatforms(): string[] {
    return [...new Set(this.publishers.values().map((p) => p.platform))];
  }

  /** 获取指定 key 的 Publisher */
  get(key: string): Publisher | undefined {
    return this.publishers.get(key);
  }

  /** 发布：resolve + publish */
  async publish(job: PublishJobPayload): Promise<PublishResult> {
    const publisher = this.resolve(job);
    logger.info('Dispatching publish job', {
      jobId: job.id,
      platform: job.platform,
      publisher: publisher.name,
      action: job.action,
    });
    return publisher.publish(job);
  }
}

let _router: ChannelRouter | null = null;

export function getChannelRouter(): ChannelRouter {
  if (!_router) {
    _router = new ChannelRouter();
  }
  return _router;
}
