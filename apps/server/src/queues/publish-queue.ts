import { createLogger } from '../config/logger';
import { enqueuePublish } from '../services/queue-client';

const HT_QUEUE_BASE = process.env.HT_QUEUE_BASE_URL || 'http://100.64.0.6:44200';

import type { PublishJobPayload } from '../types/publisher';

const logger = createLogger('publish-queue');

export interface PublishJobData {
  contentId: string;
  accountId: string;
  publishPlanId?: string;
  publishLogId?: string;
  platform: 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat';
  accountName?: string;
  action?: string;
  content: {
    title: string;
    description?: string;
    images?: string[];
    video?: string;
    tags?: string[];
    basePath?: string;
    scheduleAt?: string;
    visibility?: string;
    isOriginal?: boolean;
    products?: unknown;
  };
  scheduledAt?: number;
  retryCount?: number;
  taskId?: string;
}

export function toXhsMcpPublishPayload(params: {
  jobId?: string;
  accountId: string;
  accountName: string;
  action?: string;
  content: PublishJobData['content'];
}): PublishJobPayload {
  const { jobId, accountId, accountName, action, content } = params;

  return {
    id: jobId || '',
    platform: 'xiaohongshu',
    accountId,
    accountName,
    action: action || (content.video ? 'publish_video' : 'publish'),
    payload: {
      title: content.title,
      content: content.description,
      images: content.images,
      video: content.video,
      tags: content.tags,
      scheduleAt: content.scheduleAt,
      visibility: content.visibility,
      isOriginal: content.isOriginal,
      products: content.products,
    },
    createdAt: new Date(),
  };
}

export interface PublishJobResult {
  success: boolean;
  publishedUrl?: string;
  error?: string;
  errorCode?: string;
}

export interface AddPublishJobOptions {
  delay?: number;
  jobId?: string;
}

// Type alias preserved for backward compatibility with publishers
export type PublishJob = { data: PublishJobData; id: string };

class PublishQueue {
  private static instance: PublishQueue;

  static getInstance(): PublishQueue {
    if (!PublishQueue.instance) {
      PublishQueue.instance = new PublishQueue();
    }
    return PublishQueue.instance;
  }

  async addJob(jobData: PublishJobData, options?: AddPublishJobOptions): Promise<{ id?: string }> {
    const result = await enqueuePublish(
      jobData.platform,
      jobData as unknown as Record<string, unknown>,
      options?.jobId
    );
    logger.info('Job added via ht-queue', { taskId: result.taskId, platform: jobData.platform });
    return { id: result.jobId };
  }

  async getJobState(jobId: string): Promise<string | undefined> {
    try {
      const response = await fetch(`${HT_QUEUE_BASE}/api/tasks/${jobId}`, {
        headers: { 'X-Project-Name': 'cpp' },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return undefined;
      const result = (await response.json()) as { success: boolean; data?: { status?: string } };
      return result.data?.status;
    } catch {
      return undefined;
    }
  }

  async getStats() {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  async pause(): Promise<void> {
    // ht-queue manages pause state
  }

  async resume(): Promise<void> {
    // ht-queue manages resume state
  }

  async close(): Promise<void> {
    // No-op: ht-queue manages connections
  }
}

export function getPublishQueue(): PublishQueue {
  return PublishQueue.getInstance();
}

export async function addPublishJob(jobData: PublishJobData, options?: AddPublishJobOptions) {
  return getPublishQueue().addJob(jobData, options);
}
