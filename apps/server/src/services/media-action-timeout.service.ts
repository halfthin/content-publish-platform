import { CronJob } from 'cron';
import { createLogger } from '../config/logger';
import { getTimedOutMediaActions } from './media-action-dispatcher';
import { createMediaActionsService, createRedisMediaActionStore } from './media-actions.service';

const logger = createLogger('media-action-timeout');

/**
 * Media Action 超时检查服务
 * - 每 2 分钟检查一次超时任务
 * - 超时任务标记为 FAILED
 */
class MediaActionTimeoutService {
  private cronJob: CronJob | null = null;
  private isRunning = false;

  /**
   * 启动超时检查服务
   */
  start(): void {
    if (this.cronJob) {
      return;
    }

    // 每 2 分钟检查一次
    this.cronJob = new CronJob('0 */2 * * *', async () => {
      await this.checkTimeouts();
    });

    this.cronJob.start();
    logger.info('MediaActionTimeoutService started (runs every 2 minutes)');
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('MediaActionTimeoutService stopped');
    }
  }

  /**
   * 检查并处理超时任务
   */
  private async checkTimeouts(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Previous timeout check still running, skipping');
      return;
    }

    this.isRunning = true;
    try {
      const timedOutIds = await getTimedOutMediaActions();
      if (timedOutIds.length === 0) {
        return;
      }

      logger.warn('Found timed out media actions', {
        count: timedOutIds.length,
        jobIds: timedOutIds,
      });

      const store = createRedisMediaActionStore();
      const mediaActionsService = createMediaActionsService(store);

      for (const jobId of timedOutIds) {
        try {
          const action = await store.get(jobId);
          if (!action) {
            logger.debug('Media action not found, skipping', { jobId });
            continue;
          }

          // 只处理还在进行中的状态
          if (!['DISPATCHING', 'DISPATCHED', 'RUNNING'].includes(action.status)) {
            logger.debug('Media action not in pending status, skipping', {
              jobId,
              status: action.status,
            });
            continue;
          }

          await mediaActionsService.handleCallback({
            jobId,
            taskId: action.externalTaskId,
            actionType: action.actionType,
            status: 'failed',
            error: 'Timeout: no callback received within configured time',
            timestamp: new Date().toISOString(),
            refs: { mediaActionId: jobId },
          });

          logger.warn('Marked media action as timed out', { jobId, actionType: action.actionType });
        } catch (error) {
          logger.error('Failed to process timeout for media action', { jobId, error });
        }
      }
    } catch (error) {
      logger.error('Error checking media action timeouts', { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 手动触发一次超时检查（用于调试或手动重试）
   */
  async triggerCheck(): Promise<string[]> {
    const timedOutIds = await getTimedOutMediaActions();
    await this.checkTimeouts();
    return timedOutIds;
  }
}

// 单例
let timeoutService: MediaActionTimeoutService | null = null;

export function getMediaActionTimeoutService(): MediaActionTimeoutService {
  if (!timeoutService) {
    timeoutService = new MediaActionTimeoutService();
  }
  return timeoutService;
}

export function startMediaActionTimeoutService(): void {
  getMediaActionTimeoutService().start();
}

export function stopMediaActionTimeoutService(): void {
  if (timeoutService) {
    timeoutService.stop();
    timeoutService = null;
  }
}
