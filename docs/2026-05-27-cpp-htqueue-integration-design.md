# cpp 集成 ht-queue 设计文档

> 将 content-publish-platform（cpp）的队列管理迁移到独立的 ht-queue 服务。

## 背景

当前 cpp 项目直接使用 BullMQ 管理发布队列（publish-queue），混合了队列基础设施
与业务逻辑。ht-queue 是统一的队列管理服务，提供队列注册、任务入队、回调调度，
以及 Task 统一管理（进度/结果/SSE）。

## 架构概览

```
UI / 前端
  │
  │ POST /api/publish → 202 { taskId, streamUrl, statusUrl }
  │ GET  /api/publish/:id
  ▼
cpp 服务
  │
  ├── queue-client ──POST──► ht-queue /queues/cpp-xhs/jobs   入队
  │                              │
  │                              ├─ BullMQ ── callback ──► /_internal/queues/xhs
  │                              │
  │                              ├─ Task API ── POST /api/tasks/:id/progress
  │                              │               POST /api/tasks/:id/complete
  │                              │               POST /api/tasks/:id/fail
  │                              │
  │                              └─ SSE ──── GET /api/tasks/:id/stream
  │                                            ↑
  └── EventSource ──────────────────────────────┘ 前端直连 ht-queue SSE
```

**关键变化：** Task 记录、进度事件、SSE 流全部由 ht-queue 统一管理，
cpp 不再需要自建 Prisma Task 模型和 SSE 服务。

## 1. 队列注册

### 策略：按平台独立队列

每个平台注册一个独立队列，命名格式 `cpp-{platform}`。首批只注册 `cpp-xhs`，
后续扩展 `cpp-weibo`、`cpp-wxwork`、`cpp-wechat` 等。

每个队列对应独立的回调端点 `/_internal/queues/{platform}`。

### 注册时序

服务启动时，向 ht-queue 注册 `cpp` 项目及各平台队列：

```
bootstrap()
  → registerProjectToHtQueue()
    → POST {HT_QUEUE_BASE}/registry/projects
      body: {
        name: "cpp",
        queues: [
          {
            name: "cpp-xhs",
            callbackUrl: "{API_BASE_URL}/_internal/queues/xhs",
            options: {
              concurrency: 3,
              attempts: 3,
              timeout: 600_000,   // 10 分钟
              backoff: { type: "exponential", delay: 10_000 }
            }
          }
        ]
      }
```

后续加新平台时，更新注册的 queues 数组即可。

### 重试策略

参考 take-a-picture 的 queue-client.ts 模式：
- 如果入队时返回 403，先尝试重新注册，再重试入队
- 其他 HTTP 错误直接抛出

## 2. 入队客户端

新建 `services/queue-client.ts`，提供入队函数：

```typescript
async function enqueuePublish(
  platform: string,       // xiaohongshu | weibo | douyin | ...
  jobData: PublishJobData,
  callbackUrl?: string
): Promise<{ jobId: string; taskId: string }>
```

内部逻辑：

```
enqueuePublish(platform, jobData)
  → 生成 taskId（用于 SSE 追踪）
  → 映射 queueName: "cpp-" + platform 简称 (xiaohongshu → "xhs")
  → fetch POST {HT_QUEUE_BASE}/queues/{queueName}/jobs
     headers: { X-Project-Name: cpp }
     body: {
       name: "publish",
       data: { taskId, ...jobData },
       options: { jobId: taskId }
     }
  → 403 → 重新注册 → 重试入队
  → return { jobId, taskId }
```

平台简称映射（同现有 Gateway 平台名称映射）：

| 内部平台名 | 队列名 | 回调端点 |
|-----------|--------|---------|
| xiaohongshu | cpp-xhs | `/_internal/queues/xhs` |
| weibo | cpp-weibo | `/_internal/queues/weibo` |
| douyin | cpp-douyin | `/_internal/queues/douyin` |
| bilibili | cpp-bilibili | `/_internal/queues/bilibili` |
| wechat | cpp-wechat | `/_internal/queues/wechat` |

## 3. 回调端点

### 3.1 按平台独立回调

每个平台一个回调端点 `POST /_internal/queues/{platform}`，首批只实现 xhs：

| 端点 | 说明 |
|------|------|
| `POST /_internal/queues/xhs` | 小红书发布回调 |
| `POST /_internal/queues/weibo` | 后续扩展 |
| `POST /_internal/queues/douyin` | 后续扩展 |
| `POST /_internal/queues/bilibili` | 后续扩展 |
| `POST /_internal/queues/wechat` | 后续扩展 |

### 3.2 发布回调处理流程

接收 ht-queue 的 job 回调 payload：

```typescript
{
  jobId: string;
  name: string;       // "publish"
  data: PublishJobData & { taskId: string }
}
```

处理流程：

```
1. 从 data 提取 contentId、accountId、taskId 等
2. 开始发布，过程中通过 HTTP 向 ht-queue 报告进度:
   fetch POST {HT_QUEUE_BASE}/api/tasks/{taskId}/progress
   headers: { X-Project-Name: cpp }
   body: { stage, progress, message }
3. 根据 PUBLISH_MODE 选择发布方式:
   a) Gateway 模式 → 调用 GatewayService.publish()
   b) Local 模式   → 调用对应的 Publisher（xiaohongshu.ts）
4. 关键进度阶段:
   - "decrypting-cookies"   → progress: 5
   - "loading-browser"      → progress: 10
   - "checking-login"       → progress: 20
   - "preparing-media"      → progress: 30-60
   - "publishing"           → progress: 70-90
   - "saving-cookies"       → progress: 95
5. 完成时向 ht-queue 发送 process-report:
   fetch POST {HT_QUEUE_BASE}/api/tasks/{taskId}/complete
   headers: { X-Project-Name: cpp }
   body: { result: { platform, publishedUrl, duration, ... } }
6. 返回 { success: true } 给 ht-queue
```

如果发布失败：

```
fetch POST {HT_QUEUE_BASE}/api/tasks/{taskId}/fail
headers: { X-Project-Name: cpp }
body: { code: "...", message: "..." }
```

回调 handler 中异常也要兜底调 fail（try/catch 最外层）。

### 3.3 process-report 结构

```typescript
{
  platform: string;
  publishedUrl?: string;
  publishedId?: string;
  publishLogId?: string;
  duration: number;          // 耗时 ms
  cookieUpdated: boolean;    // Cookie 是否自动更新
  error?: string;
  errorCode?: string;
}
```

## 4. 前端集成（SSE）

前端通过 ht-queue 的 SSE 端点获取发布进度：

```javascript
// cpp 入队后拿到 taskId
const { taskId, streamUrl, statusUrl } = await response.json();

// streamUrl 指向 ht-queue
// /api/tasks/{taskId}/stream  →  代理到 {HT_QUEUE_BASE}/api/tasks/{taskId}/stream

const eventSource = new EventSource(`/api/queue-proxy/tasks/${taskId}/stream`);

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  updateProgressUI(data.stage, data.progress, data.message);
});

eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data);
  showResult(data.result);
});

eventSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data);
  showError(data.code, data.message);
});
```

Vite 代理配置加一条路由，把 `/api/queue-proxy/tasks/` 转发到 ht-queue。

## 5. 按平台日志

使用 @logtape/logtape + @logtape/file 实现多文件日志。

### 日志目录结构

```
{LOG_DIR}/
├── cpp.log                       # 系统级日志
└── publish/
    ├── xiaohongshu.log
    ├── weibo.log                 # 后续扩展
    ├── douyin.log
    ├── bilibili.log
    └── wechat.log
```

### Logtape 配置

| Logger category | Sinks |
|----------------|-------|
| `["cpp"]` | console + cpp.log |
| `["cpp", "publish", "{platform}"]` | console + publish/{platform}.log |
| `["logtape"]` | console (level: warning) |

### 使用方式

```typescript
// 在回调 handler 中按 platform 获取 logger
const log = getLogger(["cpp", "publish", platform]);
log.info("Starting publish", { contentId, accountId });

// 各阶段使用对应 logger
log.info("Cookies loaded successfully");
log.warn("Login check detected stale session, will retry...");
log.error("Publish failed", { error, attempt });
```

## 6. Bootstrap 与 Graceful Shutdown

### bootstrap() 变化

```
当前                              → 迁移后
─────────────────────────────────────────────────────────
startFileWatcher()               startFileWatcher()
initializeBrowser()              initializeBrowser()
注册 XHS MCP Publisher           注册 XHS MCP Publisher
startAllWorkers()                registerProjectToHtQueue()  ← 新增
startMediaActionWorker()         [删除]
startMediaActionTimeoutService() [删除]
```

`registerProjectToHtQueue()` 启动时注册 `cpp-xhs` 队列。如果 ht-queue 不可用则
记录警告（不阻止启动）。

### shutdown() 变化

移除队列及 media-action 相关清理：

```
getPublishQueue().close()             → [删除]
closeMediaActionQueueExecutor()       → [删除]
stopMediaActionTimeoutService()       → [删除]
getSseManager().shutdown()            → [删除]
```

### 依赖变化

- `package.json` 移除 `bullmq`、`ioredis`（项目不再直接管理队列）
- `@logtape/logtape`、`@logtape/file` — 新增（取代 pino 等旧日志）

## 7. 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/server/src/services/queue-client.ts` | ht-queue 注册 + 入队客户端 |
| `apps/server/src/routes/queues/xhs.callback.ts` | 小红书发布回调 handler（含进度 HTTP 上报） |
| `apps/server/src/config/logging.ts` | logtape 多文件日志配置 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/index.ts` | bootstrap/shutdown 适配 |
| `apps/server/src/routes/publish.ts` | 改为返回 202 + taskId/streamUrl/statusUrl |
| `apps/server/src/routes/index.ts` | 注册回调路由 |
| `apps/server/package.json` | 移除 bullmq/ioredis，确保 logtape 依赖 |
| `apps/web/vite.config.ts` | 代理 `/api/queue-proxy/tasks/` → ht-queue |

### 删除内容

| 文件/内容 | 说明 |
|-----------|------|
| `queues/publish-queue.ts` | 整个文件删除。`PublishJobData` 等类型定义迁移到 `queue-client.ts` |
| `queues/media-action-queue.ts` | 整个文件删除 |
| 所有 `services/media-action-*.ts` | media-action-dispatcher、sse-manager、timeout-service 等全部删除 |
| 所有 `services/openclaw-callback-*.ts` | 检查是否 media-action 相关，是则删除 |
| `routes/media-actions.ts` | 素材动作路由删除 |
| `routes/media.ts` | 检查是否 media-action 相关，是则删除 |
| `config/media-actions.ts` | 删除 |
| `config/media.ts` | 检查是否相关 |
| `config/redis.ts` | 检查是否还有引用（prisma 有自己的连接），无则删除 |

## 8. 错误处理

| 场景 | 处理方式 |
|------|---------|
| ht-queue 注册失败 | 记录警告，不阻止启动。回调端点仍就绪 |
| ht-queue 入队失败 | 抛出异常，调用方（路由 handler）返回 5xx |
| 回调时 ht-queue 断开 | 回调请求由 ht-queue worker 驱动，断开会触发重试 |
| 发布过程中出错 | try/catch 兜底 → fetch fail ht-queue → 返回 { success: false } |
| 进度上报失败 | 记录警告，不中断发布流程 |
