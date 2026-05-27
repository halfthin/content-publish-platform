# cpp 集成 ht-queue 设计文档

> 将 content-publish-platform（cpp）的队列管理迁移到独立的 ht-queue 服务，
> 采用与 take-a-picture（shoot）项目相同的集成模式。

## 背景

当前 cpp 项目直接使用 BullMQ 管理两个队列（publish-queue、media-action-queue），
混合了队列基础设施与业务逻辑。ht-queue 是独立的队列管理服务，通过 HTTP API
实现队列注册、任务入队和回调调度。

## 架构概览

```
POST /api/publish
       │
       ▼
  queue-client ──POST──► ht-queue ──callback──► /_internal/queues/publish
       │                   │                          │
       │              BullMQ + Redis             publish-task-store
       │                                              │
       │                                         Prisma + SSE
       │                                              │
       │                                   ┌──────────┴──────────┐
       │                                   │                     │
       │                              progress-emitter     logtape (按平台)
       │                                   │
       │                          SSE → /api/publish/:id/stream
```

## 1. 队列注册

### 注册时序

服务启动时，向 ht-queue 注册 `cpp` 项目及两个队列：

```
bootstrap()
  → registerProjectToHtQueue()
    → POST {HT_QUEUE_BASE}/registry/projects
      body: {
        name: "cpp",
        queues: [
          {
            name: "cpp-publish",
            callbackUrl: "{API_BASE_URL}/_internal/queues/publish",
            options: {
              concurrency: 3,
              attempts: 3,
              timeout: 600_000,   // 10 分钟
              backoff: { type: "exponential", delay: 10_000 }
            }
          },
          {
            name: "cpp-media-action",
            callbackUrl: "{API_BASE_URL}/_internal/queues/media-action",
            options: {
              concurrency: 1,
              attempts: 1,
              timeout: 120_000
            }
          }
        ]
      }
```

### 重试策略

参考 take-a-picture 的 queue-client.ts 模式：
- 如果入队时返回 403，先尝试重新注册，再重试入队
- 其他 HTTP 错误直接抛出

## 2. 入队客户端

新建 `services/queue-client.ts`，提供两个函数：

```typescript
// 发布任务入队
async function enqueuePublish(
  jobData: PublishJobData,
  callbackUrl?: string
): Promise<{ jobId: string; taskId: string }>

// 素材动作入队  
async function enqueueMediaAction(
  jobId: string,
  callbackUrl?: string
): Promise<{ jobId: string }>
```

内部逻辑：
1. 生成 `taskId`（用于 SSE 追踪）
2. `fetch POST {HT_QUEUE_BASE}/queues/{queueName}/jobs`
3. 携带 `X-Project-Name: cpp` header（ht-queue 认证要求）
4. 403 时自动重试注册 → 重试入队

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HT_QUEUE_BASE_URL` | http://100.64.0.6:44200 | ht-queue 服务地址 |
| `API_BASE_URL` | http://localhost:50000 | 本服务外网地址（拼接 callback URL） |

## 3. 回调端点

### 3.1 发布回调

`POST /_internal/queues/publish`

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
1. 提取 platform、contentId、accountId、taskId
2. 创建 PublishTask 记录（若不存在）
3. 根据 PUBLISH_MODE 选择发布方式：
   a) Gateway 模式 → 调用 GatewayService.publish()
   b) Local 模式   → 调用对应的 Publisher
4. 发布过程中的关键阶段 emitProgress():
   - "decrypting-cookies"   → 解密进度 5%
   - "loading-browser"      → 浏览器初始化 10%
   - "checking-login"       → 登录验证 20%
   - "preparing-media"      → 素材准备 30-60%
   - "publishing"           → 发布中 70-90%
   - "saving-cookies"       → 保存 Cookie 95%
5. 完成时 emitComplete() 带 process-report
6. 返回 { success: true }
```

process-report 结构（存入 PublishTask.result）：

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

如果发布失败，返回 `{ success: false, error: "..." }`，ht-queue 会根据重试策略重试。

### 3.2 素材动作回调

`POST /_internal/queues/media-action`

接收 ht-queue 的 job 回调：

```typescript
{
  jobId: string;
  name: string;         // "dispatch"
  data: { jobId: string }
}
```

处理流程：

```
1. 从 MediaActionStore 获取 job 详情
2. 调用 MediaActionDispatcher.dispatch()
3. 更新 store 中的状态
4. SSE 推送进度
5. 返回 { success: true }
```

## 4. Task Store + SSE

### 4.1 Prisma Schema

在 cpp 数据库新增 `PublishTask` 和 `PublishProgressEvent` 模型：

```prisma
model PublishTask {
  id           String   @id
  platform     String
  contentId    String?
  accountId    String?
  status       String   @default("running")  // running | done | error
  request      Json
  result       Json?
  errorCode    String?
  errorMessage String?
  errorData    Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  finishedAt   DateTime?

  progress PublishProgressEvent[]

  @@index([status, createdAt])
  @@index([platform, createdAt])
  @@map("publish_tasks")
}

model PublishProgressEvent {
  id        String   @id @default(cuid())
  taskId    String
  event     String   @default("progress")
  stage     String
  progress  Float
  message   String
  payload   Json?
  createdAt DateTime @default(now())

  task PublishTask @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, createdAt])
  @@map("publish_progress_events")
}
```

### 4.2 Publish Task Store

`services/publish-task-store.ts` — 封装 Prisma 操作，同 take-a-picture 的 task-store.ts 模式：

| 函数 | 说明 |
|------|------|
| `createTask(input)` | 创建 publish task 记录 |
| `getTask(taskId)` | 获取 task + progress |
| `addProgress(taskId, event, stage, progress, message, payload?)` | 追加进度 |
| `completeTask(taskId, result?)` | 标记完成，存 process-report |
| `failTask(taskId, code, message, data?)` | 标记失败 |
| `listTasks(limit)` | 最近任务列表 |

### 4.3 Progress Emitter

`services/publish-progress-emitter.ts` — EventEmitter 封装：

```typescript
// 发布进度事件
emitProgress(taskId, { stage, progress, message })
  → 写入 Prisma + bus.emit(`task:${taskId}`, { type: "progress", ... })

// 完成事件
emitComplete(taskId, result)
  → completeTask() + bus.emit(`task:${taskId}`, { type: "complete", ... })

// 失败事件
emitError(taskId, code, message)
  → failTask() + bus.emit(`task:${taskId}`, { type: "error", ... })

// 前端订阅
onTaskEvent(taskId, callback) → unsubscribe()
```

### 4.4 SSE 端点

`POST /api/publish` 改返回 202 + streaming 响应格式：

```json
{
  "taskId": "xxx",
  "streamUrl": "/api/publish/{taskId}/stream",
  "statusUrl": "/api/publish/{taskId}"
}
```

新增路由 `/api/publish/task/`（或单独文件 `routes/publish-task.ts`）：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/publish/:id` | GET | 任务详情 + progress + result |
| `/api/publish/:id/stream` | GET | SSE 实时进度流 |
| `/api/publish/task/list` | GET | 最近任务列表 |

SSE 流格式同 take-a-picture：

```
event: progress
data: {"taskId":"...","stage":"publishing","progress":70,"message":"正在发布到小红书..."}

event: complete  
data: {"taskId":"...","result":{"platform":"xiaohongshu","publishedUrl":"...","duration":45000}}

event: error
data: {"taskId":"...","code":"COOKIE_EXPIRED","message":"Cookie 已过期"}
```

## 5. 按平台日志

使用 @logtape/logtape + @logtape/file 实现多文件日志。

### 日志目录结构

```
{LOG_DIR}/
├── cpp.log                       # 系统级日志
├── publish/
│   ├── xiaohongshu.log
│   ├── weibo.log
│   ├── douyin.log
│   ├── bilibili.log
│   └── wechat.log
└── media-action.log              # 素材动作日志
```

### Logtape 配置

初始化时注册所有平台的文件 sink（平台列表固定，无需动态注册）：

| Logger category | Sinks |
|----------------|-------|
| `["cpp"]` | console + cpp.log |
| `["cpp", "publish", "{platform}"]` | console + publish/{platform}.log |
| `["cpp", "media-action"]` | console + media-action.log |
| `["logtape"]` | console (level: warning) |

平台列表由 `PUBLISH_PLATFORMS` 环境变量或固定配置获取。参考 ht-queue logging.ts 的模式。

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

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LOG_DIR` | ./logs | 日志根目录 |
| `LOG_LEVEL` | debug | 控制台日志级别 |

## 6. Bootstrap 与 Graceful Shutdown

### bootstrap() 变化

```
当前                              → 迁移后
──────────────────────────────────────────────────
startFileWatcher()               startFileWatcher()
initializeBrowser()              initializeBrowser()
注册 XHS MCP Publisher           注册 XHS MCP Publisher
startAllWorkers()                registerProjectToHtQueue()  ← 新增
startMediaActionWorker()         [删除]
startMediaActionTimeoutService() startMediaActionTimeoutService()
```

`registerProjectToHtQueue()` 在启动时注册队列，如果 ht-queue 不可用则记录警告（不阻止启动）。

### shutdown() 变化

移除队列相关清理，其他保留：

```
getPublishQueue().close()             → [删除]
closeMediaActionQueueExecutor()       → [删除]
```

### 依赖变化

- `package.json` 移除 `bullmq`、`ioredis`（项目不再直接管理队列）
- `@logtape/logtape`、`@logtape/file` — 日志模块，已有或新增

## 7. 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/server/src/services/queue-client.ts` | ht-queue 注册 + 入队客户端 |
| `apps/server/src/services/publish-task-store.ts` | PublishTask Prisma 操作封装 |
| `apps/server/src/services/publish-progress-emitter.ts` | 进度事件总线 |
| `apps/server/src/routes/queues/publish.callback.ts` | 发布回调 handler |
| `apps/server/src/routes/queues/media-action.callback.ts` | 素材动作回调 handler |
| `apps/server/src/routes/publish-task.ts` | SSE + task 查询端点 |
| `apps/server/src/config/logging.ts` | logtape 多文件日志配置 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/index.ts` | bootstrap/shutdown 适配 |
| `apps/server/src/routes/publish.ts` | 改为返回 202 + taskId/streamUrl |
| `apps/server/src/routes/index.ts` | 注册新路由 |
| `apps/server/prisma/schema.prisma` | 新增 PublishTask/PublishProgressEvent 模型 |
| `apps/server/package.json` | 移除 bullmq/ioredis，确保 logtape 依赖 |

### 删除内容

| 文件/内容 | 说明 |
|-----------|------|
| `queues/publish-queue.ts` | 整个文件删除。`PublishQueue` 类、`PublishJobData` 类型定义迁移到 `queue-client.ts` |
| `queues/media-action-queue.ts` | 整个文件删除。`BullMQMediaActionExecutor` 删除，`MediaActionExecutor` 接口定义迁移 |
| `config/redis.ts` | 检查是否还有引用（如 prisma、media-action-service 等），无则删除 |

## 8. 错误处理

| 场景 | 处理方式 |
|------|---------|
| ht-queue 注册失败 | 记录警告，不阻止启动。回调端点仍就绪 |
| ht-queue 入队失败 | 抛出异常，调用方（路由 handler）返回 5xx |
| 回调时 ht-queue 断开 | 回调请求直接由 ht-queue 驱动，断开会触发 worker 重试 |
| 发布过程中出错 | emitError() → 通知前端 SSE → failTask() → ht-queue 重试 |

## 9. 与 take-a-picture 的关键差异

| 方面 | take-a-picture (shoot) | cpp |
|------|----------------------|-----|
| 队列数 | 1 (shoot) | 2 (publish, media-action) |
| 回调端点 | 统一 `/_internal/process-job` | 每队列独立 |
| Task Store | ShootTask (独立 schema) | PublishTask (cms schema) |
| 日志 | 单文件 | 按平台多文件 |
| 发布模式 | 仅 Gateway | Gateway + Local 双模式 |
