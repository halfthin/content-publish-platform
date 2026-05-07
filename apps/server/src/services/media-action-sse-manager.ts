import { createLogger } from '../config/logger';
import { getMediaActionGatewayConfig } from '../config/media-actions';
import type {
  GatewaySSEProgressEvent,
  MediaActionDoneBroadcast,
  MediaActionFailedBroadcast,
  MediaActionProgressBroadcast,
  SSEOuterEventType,
} from '../types/media-action-sse';
import { broadcastMediaAction } from '../websocket/server';

const logger = createLogger('media-action-sse-manager');
const MAX_FALLBACK_RETRIES = 3;

interface SSESubscription {
  controller: AbortController;
  jobId: string; // CPP internal jobId
  externalTaskId: string;
  routeId: string;
  taskId: string;
  startedAt: number;
}

function subscriptionKey(routeId: string, taskId: string): string {
  return `${routeId}:${taskId}`;
}

/**
 * Manages SSE subscriptions to OpenClaw Gateway for media action progress events.
 * Subscribes to Gateway SSE stream, parses events, and broadcasts to WebSocket clients.
 * Supports the unified SSE protocol (webhooks-default-sse-protocol.md).
 */
class MediaActionSSEManager {
  private activeStreams = new Map<string, SSESubscription>();
  private pendingOuterEvent = new Map<string, SSEOuterEventType>();
  private fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  /**
   * Subscribe to a Gateway SSE stream for a media action job.
   * Uses routeId + taskId as the subscription key.
   */
  async subscribe(
    jobId: string,
    eventsPath: string,
    externalTaskId: string,
    routeId: string,
    taskId: string
  ): Promise<void> {
    const key = subscriptionKey(routeId, taskId);

    if (this.activeStreams.has(key)) {
      logger.debug('Already subscribed to SSE', { routeId, taskId });
      return;
    }

    const config = getMediaActionGatewayConfig();
    const url = `${config.url}${eventsPath}`;
    const controller = new AbortController();

    this.activeStreams.set(key, {
      controller,
      jobId,
      externalTaskId,
      routeId,
      taskId,
      startedAt: Date.now(),
    });

    logger.info('Starting SSE subscription', { jobId, routeId, taskId, url });

    this.subscribeInternal(key, url, controller.signal).catch((err) => {
      logger.error('SSE subscription failed', { routeId, taskId, error: String(err) });
      this.activeStreams.delete(key);
    });
  }

  private async subscribeInternal(key: string, url: string, signal: AbortSignal): Promise<void> {
    const config = getMediaActionGatewayConfig();
    const [routeId, taskId] = key.split(':');
    let fallbackRetries = 0;

    while (!signal.aborted) {
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            Accept: 'text/event-stream',
            ...(config.toGatewayToken ? { Authorization: `Bearer ${config.toGatewayToken}` } : {}),
          },
          signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`SSE HTTP ${response.status}: ${text}`);
        }

        if (!response.body) {
          throw new Error('SSE response has no body');
        }

        await this.readStream(key, response.body, signal);
        // Stream ended normally
        break;
      } catch (err) {
        if (signal.aborted) {
          break;
        }

        // Try fallback to task details API
        if (fallbackRetries < MAX_FALLBACK_RETRIES) {
          fallbackRetries++;
          logger.warn('SSE stream interrupted, fetching task details as fallback', {
            routeId,
            taskId,
            attempt: fallbackRetries,
          });
          await this.fetchTaskDetailsAndBroadcast(key);
        }

        const delay = 2000 * fallbackRetries;
        logger.warn('Retrying SSE subscription', {
          routeId,
          taskId,
          delayMs: delay,
          error: String(err),
        });
        await sleep(delay);
      }
    }
  }

  private async readStream(
    key: string,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          this.parseLine(key, line);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseLine(key: string, line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) {
      // Skip comments and empty lines (keep-alive)
      return;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) return;

    const field = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (field === 'event') {
      // Cache the outer SSE event type, consume on next data line
      this.pendingOuterEvent.set(key, value as SSEOuterEventType);
      return;
    }

    if (field !== 'data') return;

    const outerEvent = this.pendingOuterEvent.get(key);
    this.pendingOuterEvent.delete(key);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(value);
    } catch {
      logger.warn('Failed to parse SSE data line', { line: trimmed.slice(0, 200) });
      return;
    }

    this.handleData(key, parsed as GatewaySSEProgressEvent, outerEvent);
  }

  private handleData(
    key: string,
    data: GatewaySSEProgressEvent,
    outerEvent?: SSEOuterEventType
  ): void {
    const subscription = this.activeStreams.get(key);
    if (!subscription) return;

    // Meta event: connection established, just log and update context
    if (outerEvent === 'meta') {
      logger.info('SSE meta received', {
        routeId: subscription.routeId,
        taskId: subscription.taskId,
        jobId: data.jobId,
      });
      return;
    }

    const innerEvent = data.event;
    if (!innerEvent) return;

    logger.debug('SSE event received', {
      routeId: subscription.routeId,
      taskId: subscription.taskId,
      outerEvent,
      innerEvent,
      phase: data.phase,
      progress: data.progress,
    });

    const isTerminal = innerEvent === 'done' || innerEvent === 'failed';

    if (isTerminal) {
      if (innerEvent === 'done') {
        this.broadcastDone(subscription, data, outerEvent);
      } else {
        this.broadcastFailed(subscription, data, outerEvent);
      }
      this.unsubscribe(subscription.routeId, subscription.taskId);
      return;
    }

    if (['waiting', 'progress', 'phase_change'].includes(innerEvent)) {
      this.broadcastProgress(subscription, data, outerEvent);
    }
  }

  private broadcastProgress(
    sub: SSESubscription,
    data: GatewaySSEProgressEvent,
    outerEvent?: SSEOuterEventType
  ): void {
    const msg: MediaActionProgressBroadcast = {
      type: 'media_action_progress',
      data: {
        jobId: sub.jobId,
        routeId: sub.routeId,
        taskId: sub.taskId,
        externalTaskId: sub.externalTaskId,
        outerEvent: outerEvent || 'progress',
        event: data.event as 'waiting' | 'progress' | 'phase_change',
        phase: data.phase,
        phaseLabel: data.phaseLabel,
        progress: data.progress,
        message: data.message,
        step: data.step,
      },
    };
    broadcastMediaAction(msg);
    console.log('[SSE Manager] broadcastProgress', JSON.stringify(msg));
  }

  private broadcastDone(
    sub: SSESubscription,
    data: GatewaySSEProgressEvent,
    outerEvent?: SSEOuterEventType
  ): void {
    const msg: MediaActionDoneBroadcast = {
      type: 'media_action_done',
      data: {
        jobId: sub.jobId,
        routeId: sub.routeId,
        taskId: sub.taskId,
        externalTaskId: sub.externalTaskId,
        event: 'done',
        status: 'success',
        outerEvent:
          outerEvent === 'task' || outerEvent === 'progress'
            ? (outerEvent as 'task' | 'progress')
            : 'task',
        message: data.message,
        outputFiles: data.outputFiles,
        result: data.result,
      },
    };
    broadcastMediaAction(msg);
    console.log('[SSE Manager] broadcastDone', JSON.stringify(msg));
    logger.info('Broadcast media_action_done', {
      routeId: sub.routeId,
      taskId: sub.taskId,
      message: data.message,
    });
  }

  private broadcastFailed(
    sub: SSESubscription,
    data: GatewaySSEProgressEvent,
    outerEvent?: SSEOuterEventType
  ): void {
    const msg: MediaActionFailedBroadcast = {
      type: 'media_action_failed',
      data: {
        jobId: sub.jobId,
        routeId: sub.routeId,
        taskId: sub.taskId,
        externalTaskId: sub.externalTaskId,
        event: 'failed',
        status: 'failed',
        outerEvent: outerEvent || 'error',
        message: data.message,
        error: data.error,
        outputFiles: data.outputFiles,
      },
    };
    broadcastMediaAction(msg);
    logger.info('Broadcast media_action_failed', {
      routeId: sub.routeId,
      taskId: sub.taskId,
      error: data.error,
    });
  }

  private async fetchTaskDetailsAndBroadcast(key: string): Promise<void> {
    const subscription = this.activeStreams.get(key);
    if (!subscription) return;

    const config = getMediaActionGatewayConfig();
    const url = `${config.url}/api/tasks/${subscription.routeId}/${subscription.taskId}`;

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          ...(config.toGatewayToken ? { Authorization: `Bearer ${config.toGatewayToken}` } : {}),
        },
      });

      if (!response.ok) return;

      const data = (await response.json()) as Record<string, unknown>;
      const status = data.status as string;

      if (status === 'completed' || status === 'success') {
        this.broadcastDone(subscription, data as GatewaySSEProgressEvent, 'task');
        this.unsubscribe(subscription.routeId, subscription.taskId);
      } else if (
        status === 'failed' ||
        status === 'callback_failed' ||
        status === 'dispatch_failed'
      ) {
        this.broadcastFailed(subscription, data as GatewaySSEProgressEvent, 'task');
        this.unsubscribe(subscription.routeId, subscription.taskId);
      } else {
        this.broadcastProgress(subscription, data as GatewaySSEProgressEvent, 'task');
      }
    } catch {
      logger.warn('Task details fetch failed', {
        routeId: subscription.routeId,
        taskId: subscription.taskId,
      });
    }
  }

  /**
   * Unsubscribe and close SSE stream for a job
   */
  unsubscribe(routeId: string, taskId: string): void {
    const key = subscriptionKey(routeId, taskId);
    const sub = this.activeStreams.get(key);
    if (sub) {
      sub.controller.abort();
      this.activeStreams.delete(key);
      logger.info('SSE subscription cancelled', { routeId, taskId });
    }
  }

  /**
   * Check if a job has an active SSE subscription
   */
  isSubscribed(jobId: string): boolean {
    for (const sub of this.activeStreams.values()) {
      if (sub.jobId === jobId) return true;
    }
    return false;
  }

  /**
   * Shutdown all active subscriptions
   */
  shutdown(): void {
    for (const [key, sub] of this.activeStreams) {
      sub.controller.abort();
      logger.debug('SSE subscription closed on shutdown', { key });
    }
    this.activeStreams.clear();
    logger.info('SSE manager shut down');
  }
}

let sseManager: MediaActionSSEManager | null = null;

export function getMediaActionSSEManager(fetchImpl?: typeof fetch): MediaActionSSEManager {
  if (!sseManager) {
    sseManager = new MediaActionSSEManager(fetchImpl);
  }
  return sseManager;
}

export function getSseManager(): MediaActionSSEManager | null {
  return sseManager;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
