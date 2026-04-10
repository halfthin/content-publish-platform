import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createLogger } from '../config/logger';
import { createHttpMediaActionDispatcher } from '../services/media-action-dispatcher';
import type {
  MediaActionDispatcher,
  MediaActionExecutor,
  MediaActionStore,
} from '../services/media-actions.service';
import { createRedisMediaActionStore } from '../services/media-actions.service';

const logger = createLogger('media-action-queue');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';
const QUEUE_NAME = 'media-action-jobs';

interface MediaActionJobData {
  jobId: string;
}

class BullMQMediaActionExecutor implements MediaActionExecutor {
  private connection: Redis;
  private queue: Queue<MediaActionJobData>;
  private worker: Worker<MediaActionJobData> | null = null;

  constructor(
    private store: MediaActionStore,
    private dispatcher: MediaActionDispatcher
  ) {
    this.connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<MediaActionJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }

  async enqueue(jobId: string): Promise<void> {
    await this.queue.add('dispatch', { jobId }, { jobId });
  }

  startWorker(): void {
    if (this.worker) {
      return;
    }

    this.worker = new Worker<MediaActionJobData>(
      QUEUE_NAME,
      async (job) => {
        const current = await this.store.get(job.data.jobId);
        if (!current) {
          throw new Error(`Media action not found: ${job.data.jobId}`);
        }

        const dispatching = {
          ...current,
          status: 'DISPATCHING' as const,
          updatedAt: new Date().toISOString(),
        };
        await this.store.put(dispatching);

        const result = await this.dispatcher.dispatch(dispatching);
        if (!result.accepted) {
          await this.store.put({
            ...dispatching,
            status: 'FAILED',
            error: result.error || 'Dispatch failed',
            updatedAt: new Date().toISOString(),
          });
          return;
        }

        const dispatched = {
          ...dispatching,
          status: 'DISPATCHED' as const,
          externalTaskId: result.externalTaskId,
          updatedAt: new Date().toISOString(),
        };
        await this.store.put(dispatched);
        if (result.externalTaskId) {
          await this.store.mapExternalTaskId(result.externalTaskId, dispatched.id);
        }
      },
      {
        connection: this.connection,
        concurrency: 1,
      }
    );

    this.worker.on('completed', (job) => {
      logger.info('Media action job dispatched', { jobId: job.id });
    });

    this.worker.on('failed', (job, error) => {
      logger.error('Media action job failed', { jobId: job?.id, error: String(error) });
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
    await this.queue.close();
    await this.connection.quit().catch(() => {
      this.connection.disconnect(false);
    });
  }
}

let mediaActionExecutor: BullMQMediaActionExecutor | null = null;

export function getMediaActionQueueExecutor(options?: {
  store?: MediaActionStore;
  dispatcher?: MediaActionDispatcher;
}): MediaActionExecutor {
  if (!mediaActionExecutor) {
    mediaActionExecutor = new BullMQMediaActionExecutor(
      options?.store || createRedisMediaActionStore(),
      options?.dispatcher || createHttpMediaActionDispatcher()
    );
  }

  return mediaActionExecutor;
}

export function startMediaActionWorker(options?: {
  store?: MediaActionStore;
  dispatcher?: MediaActionDispatcher;
}): void {
  const executor = getMediaActionQueueExecutor(options);
  if (executor instanceof BullMQMediaActionExecutor) {
    executor.startWorker();
  }
}

export async function closeMediaActionQueueExecutor(): Promise<void> {
  if (mediaActionExecutor) {
    await mediaActionExecutor.close();
    mediaActionExecutor = null;
  }
}
