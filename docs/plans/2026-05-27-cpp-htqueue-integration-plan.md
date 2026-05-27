# cpp 集成 ht-queue 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 content-publish-platform 的队列管理从本地 BullMQ 迁移到 ht-queue，首批接入 cpp-xhs 队列

**Architecture:** cpp 启动时向 ht-queue 注册 `cpp-xhs` 队列。入队通过 HTTP API。ht-queue 回调 cpp 的 `/_internal/queues/xhs` 端点执行发布。执行过程中通过 HTTP 向 ht-queue 的 Task API 报告进度。Task/SSE 统一由 ht-queue 管理。

**Tech Stack:** Bun + ElysiaJS + logtape | ht-queue HTTP API

---

### Task 1: 配置按平台日志

**Files:**
- Modify: `apps/server/src/config/logger.ts`
- Create: `apps/server/src/config/logging.ts`（如果 logger.ts 重构）

`config/logger.ts` 已使用 @logtape/logtape，当前有 `createLogger(module)` 模式。在现有基础上增加按平台 publish 文件 sink。

- [ ] **Step 1: 在 config/logger.ts 中增加 per-platform publish 文件 sink**

在现有 `configure()` 调用中，在 sinks 和 loggers 里追加 publish 平台的配置：

```typescript
// 在 config/logger.ts 的 configure 调用内追加:

// 定义平台列表
const PUBLISH_PLATFORMS = ['xiaohongshu', 'weibo', 'douyin', 'bilibili', 'wechat'];

// 为每个平台创建文件 sink 和 logger
for (const platform of PUBLISH_PLATFORMS) {
  const PUBLISH_LOG_FILE = join(LOG_DIR, 'publish', `${platform}.log`);
  const sinkName = `publishFile:${platform}`;
  loggers.push({
    category: ['app', 'publish', platform],
    level: 'debug',
    sinks: ['console', sinkName],
  });
}
```

注意：在 configure 调用前先创建好 publish 目录：`mkdirSync(join(LOG_DIR, 'publish'), { recursive: true });`

- [ ] **Step 2: 验证**

```bash
cd apps/server && bun run dev
# 触发一次 xhs publish，检查 logs/publish/xiaohongshu.log 是否存在且有内容
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/config/logger.ts
git commit -m "feat: add per-platform publish log sinks"
```

### Task 2: 创建 ht-queue 客户端（queue-client.ts）

**Files:**
- Create: `apps/server/src/services/queue-client.ts`

入队客户端，封装向 ht-queue 注册项目和入队的功能。

- [ ] **Step 1: 创建 queue-client.ts**

```typescript
import { randomUUID } from 'node:crypto';
import { createLogger } from '../config/logger';

const log = createLogger('queue-client');

const HT_QUEUE_BASE = process.env.HT_QUEUE_BASE_URL || 'http://100.64.0.6:44200';
const PROJECT_NAME = 'cpp';

// 平台简称映射（同 Gateway 映射）
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
  const platforms = ['xiaohongshu']; // 首批仅注册 xhs
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
  taskId?: string,
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

  const result = await response.json() as { success: boolean; data?: { id: string } };
  log.info('Job enqueued', { taskId: tid, platform, queueName, jobId: result.data?.id });
  return { jobId: result.data?.id || tid, taskId: tid };
}

export async function reportProgress(
  taskId: string,
  stage: string,
  progress: number,
  message: string,
  event?: string,
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
  result: Record<string, unknown>,
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

export async function reportFail(
  taskId: string,
  code: string,
  message: string,
): Promise<void> {
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/queue-client.ts
git commit -m "feat: add ht-queue client (register, enqueue, progress reporting)"
```

### Task 3: 创建 xhs 回调 handler

**Files:**
- Create: `apps/server/src/routes/queues/xhs.callback.ts`

接收 ht-queue 回调，执行小红书发布逻辑，报告进度到 ht-queue Task API。

- [ ] **Step 1: 创建 xhs.callback.ts**

```typescript
import { Elysia } from 'elysia';
import { createLogger } from '../../config/logger';
import { reportProgress, reportComplete, reportFail } from '../../services/queue-client';
import { getGatewayService } from '../../services/gateway.service';
import { prisma } from '../../config/prisma';
import { decryptCookies } from '../../utils/encryption';
import { moveToPublished } from '../../services/content.service';

// HT-queue callback payload
interface HtQueueCallbackPayload {
  jobId: string;
  name: string;
  data: {
    taskId: string;
    contentId: string;
    accountId: string;
    platform: string;
    publishLogId?: string;
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
    action?: string;
    accountName?: string;
  };
}

export function setupXhsCallbackRoutes() {
  return new Elysia({ prefix: '/_internal/queues' })
    .post('/xhs', async ({ body }) => {
      const { data } = body as HtQueueCallbackPayload;
      const { taskId, contentId, accountId, content } = data;
      const platform = 'xiaohongshu';
      const log = createLogger(['publish', 'xiaohongshu']);
      const startTime = Date.now();

      log.info('Processing xhs publish callback', { taskId, contentId, accountId });

      try {
        await reportProgress(taskId, 'decrypting-cookies', 5, '正在解密 Cookie');

        // 获取并解密 cookies
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: { encryptedCookies: true, cookiePassword: true },
        });

        let cookies: Array<{ name: string; value: string; domain: string; path?: string }> | undefined;
        if (account?.encryptedCookies) {
          const password = account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
          const decrypted = await decryptCookies(account.encryptedCookies, password);
          cookies = (Array.isArray(decrypted) ? decrypted : []).map((c: Record<string, unknown>) => ({
            name: String(c.name || ''),
            value: String(c.value || ''),
            domain: String(c.domain || ''),
            path: c.path ? String(c.path) : undefined,
          }));
        }

        const publishMode = process.env.PUBLISH_MODE || 'gateway';

        if (publishMode === 'gateway') {
          await reportProgress(taskId, 'calling-gateway', 30, '正在调用 Gateway 发布');

          const gatewayService = getGatewayService();
          const result = await gatewayService.publish({
            platform: 'xiaohongshu',
            contentId,
            accountId,
            publishLogId: data.publishLogId,
            contentPath: content.basePath || '',
            taskId,
            cookies,
          });

          if (!result.success) {
            await reportFail(taskId, 'GATEWAY_ERROR', result.error || 'Gateway publish failed');
            return { success: false, error: result.error };
          }

          // Gateway 接受任务，更新 PublishLog 为 RUNNING
          if (data.publishLogId) {
            await prisma.publishLog.update({
              where: { id: data.publishLogId },
              data: { status: 'RUNNING', externalTaskId: result.taskId },
            });
          }

          await reportProgress(taskId, 'gateway-accepted', 60, 'Gateway 已接受任务，等待回调');
          await reportComplete(taskId, {
            platform: 'xiaohongshu',
            taskId: result.taskId,
            duration: Date.now() - startTime,
            note: 'Gateway accepted, result will arrive via webhook callback',
          });

          return { success: true };
        }

        // Local mode
        await reportProgress(taskId, 'loading-browser', 10, '正在初始化浏览器');

        const { XiaohongshuPublisher } = await import('../../publishers/xiaohongshu');
        const publisher = new XiaohongshuPublisher({
          accountId,
          headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
          timeout: 120000,
        });

        await publisher.initialize();

        if (account?.encryptedCookies) {
          await reportProgress(taskId, 'loading-cookies', 15, '正在加载 Cookie');
          const password = account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
          const loaded = await publisher.loadCookies(account.encryptedCookies, password);
          if (!loaded) {
            throw new Error('Cookie 加载失败');
          }
        }

        await reportProgress(taskId, 'checking-login', 20, '正在验证登录状态');
        const isLoggedIn = await publisher.checkLoginStatus();
        if (!isLoggedIn) {
          throw new Error('账号未登录或 Cookie 已过期');
        }

        await reportProgress(taskId, 'preparing-media', 40, '正在准备素材');
        await reportProgress(taskId, 'publishing', 70, '正在发布到小红书');

        const publishResult = await publisher.publish(data as unknown as Record<string, unknown>);

        if (!publishResult.success) {
          throw new Error(publishResult.error || '发布失败');
        }

        await reportProgress(taskId, 'saving-cookies', 95, '正在保存 Cookie');

        // 保存更新后的 Cookie
        try {
          if (account?.encryptedCookies) {
            const password = account.cookiePassword || process.env.COOKIE_ENCRYPTION_KEY || 'default-password';
            const newCookies = await publisher.saveCookies(password);
            if (newCookies) {
              await prisma.account.update({
                where: { id: accountId },
                data: { encryptedCookies: newCookies, cookieUpdatedAt: new Date() },
              });
            }
          }
        } catch (e) {
          log.warn('Failed to save cookies after publish', { error: String(e) });
        }

        // 标记成功
        await prisma.publishLog.updateMany({
          where: { contentId, accountId },
          data: { status: 'SUCCESS', publishedUrl: publishResult.publishedUrl, completedAt: new Date() },
        });
        await moveToPublished(contentId, 'xiaohongshu');
        await prisma.content.update({
          where: { id: contentId },
          data: { status: 'PUBLISHED', publishCount: { increment: 1 } },
        });

        await reportComplete(taskId, {
          platform: 'xiaohongshu',
          publishedUrl: publishResult.publishedUrl,
          duration: Date.now() - startTime,
          cookieUpdated: true,
        });

        await publisher.close();
        return { success: true };

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.error('XHS publish failed', { taskId, error: errMsg });

        // 标记失败
        await prisma.publishLog.updateMany({
          where: { contentId, accountId },
          data: { status: 'FAILED', errorMessage: errMsg, completedAt: new Date() },
        }).catch(() => {});

        await reportFail(taskId, 'PUBLISH_FAILED', errMsg);
        return { success: false, error: errMsg };
      }
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/queues/xhs.callback.ts
git commit -m "feat: add xhs publish callback handler with ht-queue progress reporting"
```

### Task 4: 更新 publish 路由返回格式

**Files:**
- Modify: `apps/server/src/routes/publish.ts`

将 `POST /api/publish` 改为返回 202 + `{ taskId, streamUrl, statusUrl }` 格式。

- [ ] **Step 1: 修改 publish.ts**

```typescript
import { Elysia } from 'elysia';
import { enqueuePublish } from '../services/queue-client';

export function setupPublishRoutes() {
  return new Elysia({ prefix: '/api/publish' })
    .post('/', async ({ body, set }) => {
      const { platform, accountId, accountName, action, payload } = body as Record<string, unknown>;

      if (!platform || !accountId || !action) {
        set.status = 400;
        return { success: false, error: 'platform, accountId, action required' };
      }

      const htQueueBase = process.env.HT_QUEUE_BASE_URL || 'http://100.64.0.6:44200';
      const { taskId } = await enqueuePublish(
        platform as string,
        {
          contentId: accountId as string,
          accountId: accountId as string,
          accountName: typeof accountName === 'string' ? accountName : undefined,
          action: action as string,
          platform: platform as string,
          content: payload as Record<string, unknown>,
        },
      );

      set.status = 202;
      return {
        success: true,
        data: {
          taskId,
          streamUrl: `/api/queue-proxy/tasks/${taskId}/stream`,
          statusUrl: `/api/queue-proxy/tasks/${taskId}`,
        },
      };
    });
}
```

- [ ] **Step 2: 移除旧的 publish route 依赖**

原文件导入了 `getProgressEventBus` 和 `getSseServerManager`，不再需要。把整个文件的旧内容替换为新内容。

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/publish.ts
git commit -m "feat: update publish route to return taskId/streamUrl/statusUrl"
```

### Task 5: 更新 routes/index.ts

**Files:**
- Modify: `apps/server/src/routes/index.ts`

注册新的回调路由，移除 media-action 路由引用。

- [ ] **Step 1: 修改 routes/index.ts**

删除 media-action 相关 import 和 `use` 调用，添加回调路由 import 和 `use`：

```typescript
// 删除:
import { setupMediaActionRoutes } from './media-actions';
// ... 
// .use(setupMediaActionRoutes())

// 新增:
import { setupXhsCallbackRoutes } from './queues/xhs.callback';
// ...
// .use(setupXhsCallbackRoutes())
```

最终 routes/index.ts 的 `setupRoutes()` 应移除 `setupMediaActionRoutes` 并在适当位置添加 `setupXhsCallbackRoutes`。

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/index.ts
git commit -m "refactor: update route registry - add xhs callback, remove media-action routes"
```

### Task 6: 更新 bootstrap 和 shutdown

**Files:**
- Modify: `apps/server/src/index.ts`

将 `startAllWorkers()` 替换为 `registerProjectToHtQueue()`，移除 media-action worker 相关启动和清理。

- [ ] **Step 1: 修改 bootstrap()**

```typescript
// 删除这些 import:
import { closeMediaActionQueueExecutor, startMediaActionWorker } from './queues/media-action-queue';
import { getPublishQueue, startAllWorkers } from './queues/publish-queue';
import { getSseManager } from './services/media-action-sse-manager';
import {
  startMediaActionTimeoutService,
  stopMediaActionTimeoutService,
} from './services/media-action-timeout.service';

// 新增 import:
import { registerProject } from './services/queue-client';

// bootstrap() 中:
// 删除:
// startAllWorkers();
// startMediaActionWorker();
// startMediaActionTimeoutService();

// 替换为:
try {
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:50000';
  await registerProject(apiBaseUrl);
  log.info({ module: 'ht-queue' }, 'Registered cpp-xhs queue to ht-queue');
} catch (error) {
  log.warn({ module: 'ht-queue', error }, 'Failed to register ht-queue (non-fatal)');
}
```

- [ ] **Step 2: 修改 shutdown()**

```typescript
// 删除:
// await getPublishQueue().close();
// await closeMediaActionQueueExecutor();
// stopMediaActionTimeoutService();
// getSseManager().shutdown();
```

- [ ] **Step 3: 删除 disconnectRedisClient 检查**

`disconnectRedisClient()` 仍然保留，因为 redis.ts 仍被其他服务使用。不需要删除。

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "refactor: replace BullMQ workers with ht-queue registration"
```

### Task 7: 删除 publish-queue.ts

**Files:**
- Delete: `apps/server/src/queues/publish-queue.ts`
- Modify: `apps/server/src/routes/publish.ts`（已修改，不再引用 publish-queue）
- Modify: `apps/server/src/index.ts`（已修改，不再引用 publish-queue）

- [ ] **Step 1: 确认 publish-queue.ts 不再被引用**

```bash
grep -rn "publish-queue" apps/server/src/ --include="*.ts" | grep -v ".test.ts" | grep -v "node_modules"
```

确保没有任何文件再 import publish-queue.ts。

- [ ] **Step 2: 删除文件**

```bash
rm apps/server/src/queues/publish-queue.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/queues/publish-queue.ts
git commit -m "refactor: remove local publish-queue (migrated to ht-queue)"
```

### Task 8: 删除 media-action 子系统

**Files:**
- Delete: `apps/server/src/queues/media-action-queue.ts`
- Delete: `apps/server/src/services/media-action-dispatcher.ts`
- Delete: `apps/server/src/services/media-action-dispatcher.test.ts`
- Delete: `apps/server/src/services/media-action-sse-manager.ts`
- Delete: `apps/server/src/services/media-action-timeout.service.ts`
- Delete: `apps/server/src/services/media-actions.service.ts`
- Delete: `apps/server/src/services/media-actions.service.test.ts`
- Delete: `apps/server/src/config/media-actions.ts`
- Delete: `apps/server/src/routes/media-actions.ts`
- Delete: `apps/server/src/routes/media-actions.test.ts`
- Delete: `apps/server/src/types/media-action-sse.ts`
- Delete: `apps/server/src/routes/webhook.media-actions.test.ts`
- Modify: `apps/server/src/routes/webhook.ts`（检查 media-action webhook handler）

- [ ] **Step 1: 确认 media-action 文件未被 publish flow 引用**

```bash
# 确认 openclaw-callback-* 文件是否还被 publish flow 使用（保留它们）
grep -rn "openclaw-callback" apps/server/src/routes/webhook.ts
# webhook.ts 同时处理 publish-result 和 media-action 回调，只删除 media-action 部分
```

- [ ] **Step 2: 删除 media-action 相关路由文件**

```bash
rm apps/server/src/queues/media-action-queue.ts
rm apps/server/src/services/media-action-dispatcher.ts
rm apps/server/src/services/media-action-dispatcher.test.ts
rm apps/server/src/services/media-action-sse-manager.ts
rm apps/server/src/services/media-action-timeout.service.ts
rm apps/server/src/services/media-actions.service.ts
rm apps/server/src/services/media-actions.service.test.ts
rm apps/server/src/config/media-actions.ts
rm apps/server/src/routes/media-actions.ts
rm apps/server/src/routes/media-actions.test.ts
rm apps/server/src/types/media-action-sse.ts
rm apps/server/src/routes/webhook.media-actions.test.ts
```

- [ ] **Step 3: 清理 webhook.ts 中的 media-action 回调处理**

如果 `apps/server/src/routes/webhook.ts` 中有单独处理 media-action 回调的部分，一并移除。保留 publish-result 和 check-login-result 的处理。

- [ ] **Step 4: 清理 api-doc.ts 中的 MediaActions 相关定义**

在 `apps/server/src/routes/api-doc.ts` 中移除 MediaActions tag、MediaActionDefinition schema、MediaActionSummary schema、CreateMediaActionRequest schema 及所有 `/api/media/actions/*` 路径定义。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove media-action subsystem (migrated to ht-queue)"
```

### Task 9: 配置前端 Vite 代理

**Files:**
- Modify: `apps/web/vite.config.ts`

将 `/api/queue-proxy/tasks/` 代理到 ht-queue，使前端通过同源访问 SSE。

- [ ] **Step 1: 修改 vite.config.ts**

```typescript
// 在 proxy 配置中添加:
'/api/queue-proxy': {
  target: 'http://100.64.0.6:44200',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/queue-proxy/, '/api'),
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "feat: proxy /api/queue-proxy/tasks to ht-queue for SSE"
```

### Task 10: 清理依赖

**Files:**
- Modify: `apps/server/package.json`

- [ ] **Step 1: 检查 ioredis 和 bullmq 是否还被其他文件引用**

```bash
grep -rn "from 'bullmq'\|from \"bullmq\"\|require('bullmq')\|require(\"bullmq\")" apps/server/src/ --include="*.ts"
grep -rn "from 'ioredis'\|from \"ioredis\"\|require('ioredis')\|require(\"ioredis\")" apps/server/src/ --include="*.ts"
```

- [ ] **Step 2: 如果 ioredis 只在 config/redis.ts 被引用（保留该文件），则从 package.json 移除 bullmq**

```bash
# 移除 bullmq 依赖（保留 ioredis，因为 config/redis.ts 仍在使用）
bun remove bullmq
```

- [ ] **Step 3: 确认 logtape 依赖**

```bash
# @logtape/logtape 已在 package.json 中（确认）
grep -n "logtape" apps/server/package.json
```

- [ ] **Step 4: 确认 ht-queue 相关环境变量在 .env.example 中**

```bash
# 检查 HT_QUEUE_BASE_URL 是否在 .env.example 中
grep "HT_QUEUE" apps/server/.env.example || echo "need to add"
```

- [ ] **Step 5: 如果缺失则追加 .env.example**

```bash
echo "" >> apps/server/.env.example
echo "# ht-queue (队列服务)" >> apps/server/.env.example
echo "HT_QUEUE_BASE_URL=http://100.64.0.6:44200" >> apps/server/.env.example
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/.env.example apps/server/bun.lock
git commit -m "chore: remove bullmq dependency, add ht-queue env config"
```
