import { randomUUID } from 'node:crypto';
import { createLogger } from '../config/logger';

const log = createLogger('queue-client');

const HT_QUEUE_BASE = process.env.HT_QUEUE_BASE_URL || 'http://100.64.0.6:44200';
const PROJECT_NAME = 'cpp';

const PLATFORM_QUEUE_MAP: Record<string, string> = {
  xiaohongshu: 'xhs',
  weibo: 'weibo',
  douyin: 'douyin',
  bilibili: 'bilibili',
  wechat: 'wechat',
};

function getQueueName(platform: string): string {
  const short = PLATFORM_QUEUE_MAP[platform];
  if (!short) throw new Error(`Unknown platform: ${platform}`);
  return `cpp-${short}`;
}

export async function registerProject(callbackBaseUrl: string): Promise<void> {
  const platforms = ['xiaohongshu'];
  const queues = platforms.map((p) => ({
    name: getQueueName(p),
    callbackUrl: `${callbackBaseUrl.replace(/\/+$/, '')}/_internal/queues/${PLATFORM_QUEUE_MAP[p]}`,
    options: {
      concurrency: 3,
      attempts: 3,
      timeout: 600_000,
      backoff: { type: 'exponential' as const, delay: 10_000 },
    },
  }));

  const response = await fetch(`${HT_QUEUE_BASE}/registry/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Project-Name': PROJECT_NAME },
    body: JSON.stringify({ name: PROJECT_NAME, queues }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    log.warn('ht-queue register failed (non-fatal)', { status: response.status, body });
  } else {
    log.info('Registered project to ht-queue', { platforms });
  }
}

export interface EnqueueResult {
  jobId: string;
  taskId: string;
}

export async function enqueuePublish(
  platform: string,
  jobData: Record<string, unknown>,
  taskId?: string
): Promise<EnqueueResult> {
  const tid = taskId || randomUUID();
  const queueName = getQueueName(platform);

  const tryEnqueue = async (): Promise<Response> =>
    fetch(`${HT_QUEUE_BASE}/queues/${queueName}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Name': PROJECT_NAME },
      body: JSON.stringify({
        name: 'publish',
        data: { taskId: tid, ...jobData },
        options: { jobId: tid },
      }),
    });

  let response = await tryEnqueue();
  if (response.status === 403) {
    log.warn('ht-queue enqueue 403, re-registering...');
    const callbackBaseUrl = process.env.API_BASE_URL || 'http://localhost:50000';
    await registerProject(callbackBaseUrl);
    response = await tryEnqueue();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ht-queue enqueue failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as { success: boolean; data?: { id: string } };
  log.info('Job enqueued', { taskId: tid, platform, queueName, jobId: result.data?.id });
  return { jobId: result.data?.id || tid, taskId: tid };
}

export async function reportProgress(
  taskId: string,
  stage: string,
  progress: number,
  message: string,
  event?: string
): Promise<void> {
  try {
    await fetch(`${HT_QUEUE_BASE}/api/tasks/${taskId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Name': PROJECT_NAME },
      body: JSON.stringify({ event: event || 'progress', stage, progress, message }),
    });
  } catch (err) {
    log.warn('Failed to report progress to ht-queue', { taskId, error: String(err) });
  }
}

export async function reportComplete(
  taskId: string,
  result: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${HT_QUEUE_BASE}/api/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Name': PROJECT_NAME },
      body: JSON.stringify({ result }),
    });
  } catch (err) {
    log.warn('Failed to report complete to ht-queue', { taskId, error: String(err) });
  }
}

export async function reportFail(taskId: string, code: string, message: string): Promise<void> {
  try {
    await fetch(`${HT_QUEUE_BASE}/api/tasks/${taskId}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Name': PROJECT_NAME },
      body: JSON.stringify({ code, message }),
    });
  } catch (err) {
    log.warn('Failed to report fail to ht-queue', { taskId, error: String(err) });
  }
}
