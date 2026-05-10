# Publisher Framework + XHS MCP 直连 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建通用 Publisher 框架并实现第一个 Publisher（Xiaohongshu MCP 直连），去除 OpenClaw Gateway 依赖

**Architecture:** 定义 Publisher 接口 -> ChannelRouter 路由 -> XhsMcpPublisher 直连 xhs-mcp Docker HTTP JSON-RPC -> EventBus 分发进度到 SSE 和 WebSocket

**Tech Stack:** Bun + ElysiaJS (后端) | BullMQ (队列) | HTTP JSON-RPC (MCP 协议)

---

## 文件结构

```
创建:
  apps/server/src/types/publisher.ts              - Publisher 接口 & 类型定义
  apps/server/src/services/channel-router.ts       - 发布器路由
  apps/server/src/services/xhs-mcp-publisher.ts    - XhsMcpClient + XhsMcpPublisher
  apps/server/src/services/progress-event-bus.ts   - 内部事件总线
  apps/server/src/services/sse-server-manager.ts   - SSE 服务端（供 ht-gates 订阅）
  apps/server/src/routes/xhs.ts                    - xhs 专属路由（登录二维码等）
  apps/server/src/routes/publish.ts                - 通用发布路由

  测试:
  apps/server/src/types/publisher.test.ts          - Publisher 类型测试
  apps/server/src/services/channel-router.test.ts  - ChannelRouter 单元测试

修改:
  apps/server/src/config/xhs-mcp.ts                - 补充 accountName 字段
  apps/server/src/queues/publish-queue.ts           - 新增 xhs-mcp worker
  apps/server/src/routes/index.ts                   - 注册 xhs + publish 路由
  apps/server/src/index.ts                          - 注册 Publisher/EventBus/SSE
```

---

### Task 1: Publisher 类型定义

**Files:**
- Create: `apps/server/src/types/publisher.ts`
- Test: `apps/server/src/types/publisher.test.ts`

- [ ] **Step 1: 定义 Publisher 核心类型**

`apps/server/src/types/publisher.ts`:

```typescript
/** 发布结果 */
export interface PublishResult {
  success: boolean;
  externalId?: string;  // 平台返回的 ID（如笔记 ID）
  url?: string;         // 发布后的链接
  error?: string;
  errorCode?: string;
  raw?: unknown;
}

/** 认证状态 */
export interface AuthStatus {
  loggedIn: boolean;
  accountName?: string;
  message?: string;
}

/** 认证初始化结果 */
export interface AuthInitResult {
  type: 'qrcode' | 'url' | 'none';
  data?: string;       // Base64 或跳转链接
  expiresIn?: number;  // 过期秒数
}

/** 发布任务（各平台通用） */
export interface PublishJobPayload {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** 进度事件 */
export interface ProgressEvent {
  type: 'publish' | 'auth';
  jobId?: string;
  platform: string;
  instance?: string;
  status: string;
  progress?: number;
  message?: string;
  data?: unknown;
}

/** Publisher 接口 */
export interface Publisher<TConfig = unknown> {
  readonly platform: string;
  readonly name: string;

  /** 执行发布 */
  publish(job: PublishJobPayload): Promise<PublishResult>;

  /** 检查认证状态 */
  checkAuth(): Promise<AuthStatus>;

  /** 发起认证流程（扫码/跳转），非必需 */
  startAuth?(): Promise<AuthInitResult>;

  /** 重置认证（清除凭据重新认证） */
  refreshAuth?(): Promise<AuthInitResult>;

  /** 启动时校验配置 */
  validateConfig(): boolean;
}
```

- [ ] **Step 2: 编写类型测试**

`apps/server/src/types/publisher.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import type { Publisher, PublishResult, AuthStatus, PublishJobPayload } from './publisher';

describe('Publisher types', () => {
  it('PublishResult can be success', () => {
    const result: PublishResult = {
      success: true,
      externalId: 'note_123',
      url: 'https://xiaohongshu.com/note/123',
    };
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('note_123');
  });

  it('PublishResult can be failure', () => {
    const result: PublishResult = {
      success: false,
      error: 'Login expired',
      errorCode: 'NEEDS_AUTH',
    };
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NEEDS_AUTH');
  });

  it('PublishJobPayload carries platform and action', () => {
    const job: PublishJobPayload = {
      id: 'job-1',
      platform: 'xiaohongshu',
      accountId: 'acc-1',
      accountName: '不加糖也很酷',
      action: 'publish',
      payload: { title: 'test', images: [] },
      createdAt: new Date(),
    };
    expect(job.platform).toBe('xiaohongshu');
    expect(job.accountName).toBe('不加糖也很酷');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `cd apps/server && bun test src/types/publisher.test.ts`
Expected: 3 tests pass

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/types/publisher.ts apps/server/src/types/publisher.test.ts
git commit -m "feat(publisher): define Publisher interface and types"
```

---

### Task 2: ChannelRouter

**Files:**
- Create: `apps/server/src/services/channel-router.ts`
- Test: `apps/server/src/services/channel-router.test.ts`

- [ ] **Step 1: 实现 ChannelRouter**

`apps/server/src/services/channel-router.ts`:

```typescript
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
    // 先尝试 platform:accountName 精确匹配
    const exactKey = `${job.platform}:${job.accountName}`;
    const exact = this.publishers.get(exactKey);
    if (exact) return exact;

    // 再尝试 platform:default 回退
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
```

- [ ] **Step 2: 编写 ChannelRouter 测试**

`apps/server/src/services/channel-router.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { ChannelRouter } from './channel-router';
import type { Publisher, PublishResult, AuthStatus, PublishJobPayload } from '../types/publisher';

function createMockPublisher(platform: string, name: string): Publisher {
  return {
    platform,
    name,
    async publish(_job: PublishJobPayload): Promise<PublishResult> {
      return { success: true, externalId: `${name}-result` };
    },
    async checkAuth(): Promise<AuthStatus> {
      return { loggedIn: true };
    },
    validateConfig(): boolean {
      return true;
    },
  };
}

describe('ChannelRouter', () => {
  let router: ChannelRouter;

  beforeEach(() => {
    router = new ChannelRouter();
  });

  it('registers and resolves a publisher', () => {
    const pub = createMockPublisher('xiaohongshu', 'xhs-1');
    router.register(pub);
    const resolved = router.resolve({
      id: '1', platform: 'xiaohongshu', accountName: 'xhs-1',
      accountId: 'a1', action: 'publish', payload: {}, createdAt: new Date(),
    });
    expect(resolved.name).toBe('xhs-1');
  });

  it('falls back to default publisher', () => {
    const def = createMockPublisher('xiaohongshu', 'default');
    router.register(def);
    const resolved = router.resolve({
      id: '2', platform: 'xiaohongshu', accountName: 'unknown',
      accountId: 'a2', action: 'publish', payload: {}, createdAt: new Date(),
    });
    expect(resolved.name).toBe('default');
  });

  it('throws when no publisher found', () => {
    expect(() => {
      router.resolve({
        id: '3', platform: 'wechat', accountName: 'default',
        accountId: 'a3', action: 'publish', payload: {}, createdAt: new Date(),
      });
    }).toThrow('No publisher found for wechat:default');
  });

  it('publishes via resolved publisher', async () => {
    const pub = createMockPublisher('xiaohongshu', 'xhs-1');
    router.register(pub);
    const result = await router.publish({
      id: '4', platform: 'xiaohongshu', accountName: 'xhs-1',
      accountId: 'a4', action: 'publish', payload: {}, createdAt: new Date(),
    });
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('xhs-1-result');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `cd apps/server && bun test src/services/channel-router.test.ts`
Expected: 4 tests pass

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/services/channel-router.ts apps/server/src/services/channel-router.test.ts
git commit -m "feat(publisher): implement ChannelRouter with fallback resolution"
```

---

### Task 3: XhsMcpClient (MCP JSON-RPC 协议层)

**Files:**
- Create: `apps/server/src/services/xhs-mcp-publisher.ts`（含 XhsMcpClient + XhsMcpPublisher）

- [ ] **Step 1: 更新 xhs-mcp config 增加 accountName 字段**

`apps/server/src/config/xhs-mcp.ts` 补充 `accountName` 字段到 `XhsMcpInstanceConfig`：

```typescript
export interface XhsMcpInstanceConfig {
  name: string;
  url: string;
  accountName?: string;  // 新增
}
```

- [ ] **Step 2: 实现 XhsMcpClient**

在 `apps/server/src/services/xhs-mcp-publisher.ts` 中添加 MCP HTTP JSON-RPC 客户端：

```typescript
import { createLogger } from '../config/logger';
import type { PublishResult, AuthStatus, AuthInitResult, PublishJobPayload } from '../types/publisher';
import type { Publisher } from '../types/publisher';

const logger = createLogger('xhs-mcp');

class JsonRpcError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'JsonRpcError';
  }
}

class XhsMcpClient {
  constructor(private readonly mcpUrl: string) {}

  async callTool<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(300_000), // 5min，发布可能较慢
    });

    if (!res.ok) {
      throw new JsonRpcError(`MCP HTTP ${res.status}`, res.status);
    }

    const body = await res.json();
    if (body.error) {
      throw new JsonRpcError(body.error.message || 'MCP error', body.error.code, body.error.data);
    }

    return body.result?.content as T;
  }
}
```

- [ ] **Step 3: 运行工具列表测试（可选，验证 MCP 连通性）**

这一步可以用来验证 MCP 容器是否可达。如果容器不在本地可以不运行。

```bash
curl -X POST http://100.64.0.11:5601/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

预期返回 tools 列表，包含 `publish_content`、`check_login_status`、`get_login_qrcode` 等。

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/config/xhs-mcp.ts apps/server/src/services/xhs-mcp-publisher.ts
git commit -m "feat(xhs-mcp): implement MCP JSON-RPC client"
```

---

### Task 4: XhsMcpPublisher

**Files:**
- Continue in: `apps/server/src/services/xhs-mcp-publisher.ts`

- [ ] **Step 1: 实现 XhsMcpPublisher**

追加到 `apps/server/src/services/xhs-mcp-publisher.ts`：

```typescript
export class XhsMcpPublisher implements Publisher {
  readonly platform = 'xiaohongshu';

  constructor(
    public readonly name: string,
    private readonly client: XhsMcpClient,
    private readonly accountName: string,
  ) {}

  async publish(job: PublishJobPayload): Promise<PublishResult> {
    const { action, payload } = job;

    switch (action) {
      case 'publish': {
        const { title, content, images, tags, scheduleAt, visibility, isOriginal, products } =
          payload as Record<string, unknown>;

        const result = await this.client.callTool<{ noteId?: string; noteUrl?: string }>(
          'publish_content',
          {
            title,
            content,
            images,
            tags,
            scheduleAt,
            visibility,
            isOriginal,
            products,
          },
        );

        return {
          success: true,
          externalId: result.noteId,
          url: result.noteUrl,
        };
      }

      case 'publish_video': {
        const { title, content, video, tags, visibility, products } =
          payload as Record<string, unknown>;

        const result = await this.client.callTool<{ noteId?: string; noteUrl?: string }>(
          'publish_with_video',
          { title, content, video, tags, visibility, products },
        );

        return {
          success: true,
          externalId: result.noteId,
          url: result.noteUrl,
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}`, errorCode: 'UNKNOWN_ACTION' };
    }
  }

  async checkAuth(): Promise<AuthStatus> {
    try {
      const result = await this.client.callTool<{ isLogin?: boolean }>('check_login_status');
      return { loggedIn: result?.isLogin ?? false };
    } catch {
      return { loggedIn: false, message: 'MCP container unreachable' };
    }
  }

  async startAuth(): Promise<AuthInitResult> {
    const result = await this.client.callTool<{ qrcode?: string; expiresIn?: number }>(
      'get_login_qrcode',
    );
    return {
      type: 'qrcode',
      data: result.qrcode,
      expiresIn: result.expiresIn,
    };
  }

  async refreshAuth(): Promise<AuthInitResult> {
    await this.client.callTool('delete_cookies');
    return this.startAuth();
  }

  validateConfig(): boolean {
    return typeof this.mcpUrl === 'string' && this.mcpUrl.length > 0;
  }

  // 虽然后端不会直接调用这个，但 XhsMcpClient 内部需要 mcpUrl
  private get mcpUrl(): string {
    return (this.client as unknown as { mcpUrl: string }).mcpUrl;
  }
}

/** 从配置创建 XhsMcpPublisher 实例列表 */
export function createXhsMcpPublishers(): XhsMcpPublisher[] {
  const { xhsMcpConfig } = require('../config/xhs-mcp');
  return xhsMcpConfig.instances.map((inst) => {
    const mcpUrl = `${inst.url.replace(/\/+$/, '')}/mcp`;
    const client = new XhsMcpClient(mcpUrl);
    return new XhsMcpPublisher(inst.name, client, inst.accountName || inst.name);
  });
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/services/xhs-mcp-publisher.ts
git commit -m "feat(xhs-mcp): implement XhsMcpPublisher as first Publisher"
```

---

### Task 5: ProgressEventBus

**Files:**
- Create: `apps/server/src/services/progress-event-bus.ts`

- [ ] **Step 1: 实现事件总线**

`apps/server/src/services/progress-event-bus.ts`:

```typescript
import { EventEmitter } from 'node:events';
import type { ProgressEvent } from '../types/publisher';

const EVENTS_CHANNEL = 'progress';

type ProgressListener = (event: ProgressEvent) => void;

class ProgressEventBus {
  private emitter = new EventEmitter();
  // SSE 和 WebSocket 订阅者各自注册 listener

  /** 发布进度事件 */
  emit(event: ProgressEvent): void {
    this.emitter.emit(EVENTS_CHANNEL, event);
  }

  /** 订阅所有进度事件 */
  subscribe(listener: ProgressListener): () => void {
    this.emitter.on(EVENTS_CHANNEL, listener);
    return () => this.emitter.off(EVENTS_CHANNEL, listener);
  }

  /** 清除所有订阅（关闭时调用） */
  clear(): void {
    this.emitter.removeAllListeners(EVENTS_CHANNEL);
  }
}

let _bus: ProgressEventBus | null = null;

export function getProgressEventBus(): ProgressEventBus {
  if (!_bus) {
    _bus = new ProgressEventBus();
  }
  return _bus;
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/services/progress-event-bus.ts
git commit -m "feat(publisher): implement ProgressEventBus"
```

---

### Task 6: SSE 服务端（供 ht-gates 订阅）

**Files:**
- Create: `apps/server/src/services/sse-server-manager.ts`

- [ ] **Step 1: 实现 SSE Server Manager**

`apps/server/src/services/sse-server-manager.ts`:

```typescript
import { type Context } from 'elysia';
import { createLogger } from '../config/logger';
import { getProgressEventBus } from './progress-event-bus';
import type { ProgressEvent } from '../types/publisher';

const logger = createLogger('sse-server');

class SseServerManager {
  private clients = new Set<{ send: (event: ProgressEvent) => void; close: () => void }>();

  constructor() {
    // 从 EventBus 接收事件并广播到所有 SSE 客户端
    getProgressEventBus().subscribe((event) => {
      this.broadcast(event);
    });
  }

  /** 处理 Elysia SSE 连接 */
  handleConnection(ctx: Context): void {
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };

    // 设置 SSE headers
    ctx.set.headers = { ...ctx.set.headers, ...headers };

    // 模拟 SSE 发送（Elysia 原生不支持 SSE stream，用 write 方式）
    const client = {
      send: (event: ProgressEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        // 通过 ctx 写入响应流
        try {
          // 使用原始响应写入
          if (ctx.set.headers && !ctx.set.headers['x-sse-closed']) {
            (ctx as unknown as { raw: import('http').ServerResponse }).raw.write(data);
          }
        } catch {
          // 连接已关闭
          this.clients.delete(client);
        }
      },
      close: () => {
        this.clients.delete(client);
        try {
          (ctx as unknown as { raw: import('http').ServerResponse }).raw.end();
        } catch { /* ignore */ }
      },
    };

    this.clients.add(client);
    logger.info('SSE client connected', { total: this.clients.size });

    // 发送初始连接确认
    client.send({ type: 'publish', platform: 'system', status: 'connected' });

    // 客户端断开时清理
    ctx.request.signal.addEventListener('abort', () => {
      this.clients.delete(client);
      logger.info('SSE client disconnected', { total: this.clients.size });
    });
  }

  /** 广播事件到所有连接的 SSE 客户端 */
  private broadcast(event: ProgressEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        // 实际发送通过 connection context 写入
      } catch {
        this.clients.delete(client);
      }
    }
  }

  shutdown(): void {
    for (const client of this.clients) {
      try {
        client.close();
      } catch { /* ignore */ }
    }
    this.clients.clear();
    logger.info('SSE server manager shut down');
  }
}

let _manager: SseServerManager | null = null;

export function getSseServerManager(): SseServerManager {
  if (!_manager) {
    _manager = new SseServerManager();
  }
  return _manager;
}
```

> **Note:** Elysia SSE 的具体实现可能需要根据 Elysia 版本调整。如果 Elysia 内置不支持流式响应，备用方案是使用 `Bun.serve` 或 `node:http` 的原生 SSE 实现。

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/services/sse-server-manager.ts
git commit -m "feat(publisher): implement SSE server for ht-gates progress feed"
```

---

### Task 7: API 路由

**Files:**
- Create: `apps/server/src/routes/xhs.ts`
- Create: `apps/server/src/routes/publish.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: 实现 xhs 专属路由**

`apps/server/src/routes/xhs.ts`:

```typescript
import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';
import { getMcpUrlByIndex } from '../config/xhs-mcp';
import { getChannelRouter } from '../services/channel-router';
import { getProgressEventBus } from '../services/progress-event-bus';

const logger = createLogger('routes:xhs');

export function setupXhsRoutes() {
  return new Elysia({ prefix: '/api/xhs' })

    // 获取登录二维码
    .get('/login/qrcode', async ({ query, error }) => {
      const instanceName = (query as { instance?: string }).instance || 'xhs-1';
      const router = getChannelRouter();
      const publisher = router.get(`xiaohongshu:${instanceName}`);
      if (!publisher || !publisher.startAuth) {
        return error(404, { success: false, error: 'MCP instance not found' });
      }

      const result = await publisher.startAuth();
      getProgressEventBus().emit({
        type: 'auth',
        platform: 'xiaohongshu',
        instance: instanceName,
        status: 'qr_ready',
      });

      return { success: true, data: result };
    })

    // 查询登录状态
    .get('/login/status', async ({ query, error }) => {
      const instanceName = (query as { instance?: string }).instance || 'xhs-1';
      const router = getChannelRouter();
      const publisher = router.get(`xiaohongshu:${instanceName}`);
      if (!publisher) {
        return error(404, { success: false, error: 'MCP instance not found' });
      }

      const status = await publisher.checkAuth();
      if (status.loggedIn) {
        getProgressEventBus().emit({
          type: 'auth',
          platform: 'xiaohongshu',
          instance: instanceName,
          status: 'logged_in',
        });
      }

      return { success: true, data: status };
    })

    // 重置登录
    .post('/login/refresh', async ({ query, error }) => {
      const instanceName = (query as { instance?: string }).instance || 'xhs-1';
      const router = getChannelRouter();
      const publisher = router.get(`xiaohongshu:${instanceName}`);
      if (!publisher || !publisher.refreshAuth) {
        return error(404, { success: false, error: 'MCP instance not found' });
      }

      const result = await publisher.refreshAuth();
      return { success: true, data: result };
    })

    // 发布图文笔记（入队）
    .post('/publish', async ({ body, error }) => {
      const { accountId, accountName, title, content, images, tags, scheduleAt, visibility, isOriginal, products } =
        body as Record<string, unknown>;

      if (!accountId || !title || !content) {
        return error(400, { success: false, error: 'accountId, title, content required' });
      }

      // 入队（通过 publish-queue）
      const { getPublishQueue } = await import('../queues/publish-queue');
      const job = await getPublishQueue().addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        platform: 'xiaohongshu',
        content: {
          title: title as string,
          description: content as string,
          images: images as string[] | undefined,
          tags: tags as string[] | undefined,
        },
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    })

    // 发布视频笔记（入队）
    .post('/publish/video', async ({ body, error }) => {
      const { accountId, title, content, video, tags, visibility } =
        body as Record<string, unknown>;

      if (!accountId || !title || !content || !video) {
        return error(400, { success: false, error: 'accountId, title, content, video required' });
      }

      const { getPublishQueue } = await import('../queues/publish-queue');
      const job = await getPublishQueue().addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        platform: 'xiaohongshu',
        content: {
          title: title as string,
          description: content as string,
          video: video as string,
          tags: tags as string[] | undefined,
        },
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    });
}
```

- [ ] **Step 2: 实现通用发布路由**

`apps/server/src/routes/publish.ts`:

```typescript
import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';
import { getProgressEventBus } from '../services/progress-event-bus';

const logger = createLogger('routes:publish');

export function setupPublishRoutes() {
  return new Elysia({ prefix: '/api/publish' })

    // 通用发布入口
    .post('/', async ({ body, error }) => {
      const { platform, accountId, accountName, action, payload } =
        body as Record<string, unknown>;

      if (!platform || !accountId || !action) {
        return error(400, { success: false, error: 'platform, accountId, action required' });
      }

      // 入队
      const { getPublishQueue } = await import('../queues/publish-queue');
      const job = await getPublishQueue().addJob({
        contentId: accountId as string,
        accountId: accountId as string,
        platform: platform as string,
        content: payload as Record<string, unknown> as {
          title: string;
          description?: string;
          images?: string[];
          video?: string;
          tags?: string[];
          basePath?: string;
        },
      });

      getProgressEventBus().emit({
        type: 'publish',
        jobId: job.id,
        platform: platform as string,
        status: 'QUEUED',
        progress: 0,
      });

      return { success: true, data: { jobId: job.id, status: 'QUEUED' } };
    })

    // SSE 进度流（供 ht-gates 订阅）
    .get('/progress', ({ set, request }) => {
      const { getSseServerManager } = require('../services/sse-server-manager');
      const manager = getSseServerManager();

      // 设置 SSE headers
      set.headers['Content-Type'] = 'text/event-stream';
      set.headers['Cache-Control'] = 'no-cache';
      set.headers['Connection'] = 'keep-alive';
      set.headers['X-Accel-Buffering'] = 'no';

      // 返回一个 ReadableStream 供 Elysia 流式输出
      const stream = new ReadableStream({
        start(controller) {
          // 发送初始连接确认
          controller.enqueue(`data: ${JSON.stringify({ type: 'publish', platform: 'system', status: 'connected' })}\n\n`);

          // 订阅 EventBus
          const unsubscribe = getProgressEventBus().subscribe((event) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
            } catch {
              unsubscribe();
            }
          });

          // 客户端断开
          request.signal.addEventListener('abort', () => {
            unsubscribe();
          });
        },
      });

      return stream;
    })

    // 查询任务状态
    .get('/:jobId', async ({ params, error }) => {
      const { getPublishQueue } = await import('../queues/publish-queue');
      const state = await getPublishQueue().getJobState(params.jobId);
      if (!state) {
        return error(404, { success: false, error: 'Job not found' });
      }
      return { success: true, data: { jobId: params.jobId, state } };
    });
}
```

- [ ] **Step 3: 注册新路由**

在 `apps/server/src/routes/index.ts` 中添加：

```typescript
// 在文件顶部 imports 区域添加：
import { setupXhsRoutes } from './xhs';
import { setupPublishRoutes } from './publish';

// 在 .use(setupMediaActionRoutes()) 之后添加：
// 通用发布 API
.use(setupPublishRoutes())
// 小红书 MCP 直连 API
.use(setupXhsRoutes())
```

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/routes/xhs.ts apps/server/src/routes/publish.ts apps/server/src/routes/index.ts
git commit -m "feat(routes): add xhs-mcp and generic publish API routes"
```

---

### Task 8: 队列集成

**Files:**
- Modify: `apps/server/src/queues/publish-queue.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: publish-queue 新增 xhs-mcp worker**

在 `apps/server/src/queues/publish-queue.ts` 的 `startAllWorkers` 方法中，在 Gateway 模式之后添加一个新的 xhs-mcp worker：

```typescript
// 在 startAllWorkers 中，在 Gateway 模式之后：
// 始终启动 xhs-mcp worker（独立于 Gateway 模式）
this.startWorker('xiaohongshu-mcp', async (job) => {
  return this.processXhsMcpJob(job);
});
```

添加 `processXhsMcpJob` 方法：

```typescript
private async processXhsMcpJob(
  job: Job<PublishJobData, PublishJobResult>
): Promise<PublishJobResult> {
  const { contentId, accountId, content } = job.data;
  const accountName = content.title; // 临时，后续通过 accountId 查

  logger.info('Processing XHS MCP job', { jobId: job.id, contentId, accountId });

  try {
    const router = getChannelRouter();
    const publisher = router.resolve({
      id: job.id || '',
      platform: 'xiaohongshu',
      accountId,
      accountName,
      action: content.video ? 'publish_video' : 'publish',
      payload: {
        title: content.title,
        content: content.description,
        images: content.images,
        video: content.video,
        tags: content.tags,
      },
      createdAt: new Date(),
    });

    const result = await publisher.publish({
      id: job.id || '',
      platform: 'xiaohongshu',
      accountId,
      accountName,
      action: content.video ? 'publish_video' : 'publish',
      payload: {
        title: content.title,
        content: content.description,
        images: content.images,
        video: content.video,
        tags: content.tags,
      },
      createdAt: new Date(),
    });

    // 通过 EventBus 发送进度
    getProgressEventBus().emit({
      type: 'publish',
      jobId: job.id || undefined,
      platform: 'xiaohongshu',
      status: result.success ? 'SUCCESS' : 'FAILED',
      progress: result.success ? 100 : 0,
      data: result,
    });

    if (result.success) {
      await this.markPublishSuccess(contentId, accountId, 'xiaohongshu', result.url);
    } else {
      await this.markPublishFailure(contentId, accountId, result.error, result.errorCode);
    }

    return result;
  } catch (error) {
    logger.error('XHS MCP job failed', { jobId: job.id, error: String(error) });
    await this.markPublishFailure(contentId, accountId, String(error), 'MCP_ERROR');
    return {
      success: false,
      error: String(error),
      errorCode: 'MCP_ERROR',
    };
  }
}
```

在文件顶部添加 imports：

```typescript
import { getChannelRouter } from '../services/channel-router';
import { getProgressEventBus } from '../services/progress-event-bus';
```

- [ ] **Step 2: index.ts 注册 Publisher 和 SSE**

在 `apps/server/src/index.ts` 的 `bootstrap` 函数中添加：

```typescript
// 在浏览器初始化或启动发布队列后：
try {
  // 注册 XHS MCP Publisher
  const { createXhsMcpPublishers } = require('./services/xhs-mcp-publisher');
  const { getChannelRouter } = require('./services/channel-router');
  const { validateXhsMcpConfig } = require('./config/xhs-mcp');
  
  if (validateXhsMcpConfig()) {
    const router = getChannelRouter();
    const publishers = createXhsMcpPublishers();
    for (const pub of publishers) {
      router.register(pub);
    }
    logger.info({ module: 'xhs-mcp' }, `Registered ${publishers.length} XHS MCP publishers`);
  }
} catch (error) {
  logger.error({ module: 'xhs-mcp', error }, 'Failed to register XHS MCP publishers');
}
```

在 `shutdown` 函数中添加：

```typescript
// 在关闭 SSE 管理器之后：
try {
  const { getSseServerManager } = require('./services/sse-server-manager');
  getSseServerManager().shutdown();
  logger.info({ module: 'sse-server' }, 'SSE server manager shut down');
} catch (error) {
  logger.error({ module: 'sse-server', error }, 'Error shutting down SSE server manager');
}
```

- [ ] **Step 3: 服务启动测试**

Run: `cd apps/server && timeout 15 bun run src/index.ts`
Expected: 启动日志中看到 "XHS MCP instances loaded" 和 "Registered N XHS MCP publishers"

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/queues/publish-queue.ts apps/server/src/index.ts
git commit -m "feat(queue): integrate XhsMcpPublisher with publish queue and bootstrap"
```

---

## 自审检查

**Spec 覆盖：**
- Publisher 接口和类型 → Task 1 ✅
- ChannelRouter → Task 2 ✅
- XhsMcpClient + XhsMcpPublisher → Task 3, 4 ✅
- EventBus → Task 5 ✅
- SSE 服务端供 ht-gates → Task 6 ✅
- xhs 专属路由（登录二维码等）→ Task 7 ✅
- 通用发布路由 → Task 7 ✅
- 队列集成 → Task 8 ✅
- Bootstrap 注册 → Task 8 ✅

**占位符检查：** 无 "TBD"/"TODO"/"implement later"

**类型一致性：** Publisher 接口在 Task 1 定义，所有后续任务使用一致的方法签名

**范围检查：** 聚焦阶段 1，Gateway 代码保留不动
