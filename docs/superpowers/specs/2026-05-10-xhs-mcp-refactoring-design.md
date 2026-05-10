# Xiaohongshu MCP 直连重构设计

## 概述

当前项目通过 OpenClaw Gateway 间接调用 xiaohongshu-mcp 容器，链路冗余。重构后去除 OpenClaw 依赖，直连 xhs-mcp Docker 容器（Streamable HTTP 传输），并新增 SSE 进度端点供 ht-gates 消费。

同时搭建通用发布器框架（Publisher Framework），让后续企业微信、微信公众号等平台的接入可以复用队列、路由、事件总线等基础设施。

## 通用发布器框架

### 核心理念

不同平台的发布逻辑各异，但都有一个通用流程：**入队 → 发布 → 结果 → 反馈**。

```
PublishJob (通用定义)
    │
    ▼
PublishQueue (BullMQ, 通用)
    │
    ▼
ChannelRouter (根据 platform + account 路由)
    │
    ├── XhsMcpPublisher    ← 第一个实现（当前重构）
    │       ├── publish()  → HTTP JSON-RPC → xhs-mcp
    │       ├── checkAuth() → check_login_status
    │       └── config: XHS_MCP_INSTANCES
    │
    ├── WecomSdkPublisher  ← 后续
    │       ├── publish()  → 企业微信 SDK/API
    │       ├── checkAuth() → token 校验
    │       └── config: WECOM_*
    │
    ├── WechatApiPublisher ← 后续
    │       ├── publish()  → 公众号 HTTP API
    │       ├── checkAuth() → access_token 校验
    │       └── config: WECHAT_*
    │
    └── ...

EventBus (通用)
    ├── SSE /api/sse/progress → ht-gates → ht-ui
    └── WebSocket /ws → apps/web
```

### Publisher 接口

所有平台发布器实现同一个轻量接口：

```typescript
interface PublishResult {
  success: boolean;
  externalId?: string;    // 平台返回的发布 ID（如笔记 ID）
  url?: string;           // 发布后的访问链接
  error?: string;
  raw?: unknown;          // 平台原始响应（供调试/扩展）
}

interface AuthStatus {
  loggedIn: boolean;
  accountName?: string;
}

interface AuthInitResult {
  type: 'qrcode' | 'url' | 'none';
  data?: string;          // Base64 二维码或跳转链接
  expiresIn?: number;
}

interface Publisher<TConfig = unknown> {
  readonly platform: string;     // 'xiaohongshu' | 'wecom' | 'wechat' ...
  readonly name: string;         // 发布器实例名

  /** 执行发布 */
  publish(job: PublishJob): Promise<PublishResult>;

  /** 检查当前登录/认证状态 */
  checkAuth(): Promise<AuthStatus>;

  /** 发起认证（如获取二维码），非必需 */
  startAuth?(): Promise<AuthInitResult>;

  /** 启动时校验配置完整性 */
  validateConfig(): boolean;
}
```

### ChannelRouter

将 PublishJob 路由到正确的 Publisher：

```typescript
class ChannelRouter {
  private publishers = new Map<string, Publisher>();

  register(publisher: Publisher): void {
    this.publishers.set(publisher.name, publisher);
  }

  resolve(job: PublishJob): Publisher {
    // platform → accountName → publisher 实例
    return this.publishers.get(`${job.platform}:${job.accountName}`);
  }
}
```

### PublishJob 通用定义

```typescript
interface PublishJob {
  id: string;
  platform: string;         // 'xiaohongshu' | 'wecom' | 'wechat' ...
  accountId: string;
  accountName: string;
  action: string;           // 'publish' | 'publish_video' 等
  payload: Record<string, unknown>;  // 各平台具体参数
  createdAt: Date;
}
```

### 基础架构

```
                     ┌──────────────────┐
POST /api/publish ──→│  PublishQueue     │── BullMQ ──→ Worker
                     │  (通用, 复用现有)   │                │
                     └──────────────────┘                │
                                                          ▼
                                                   ChannelRouter
                                                          │
                                          ┌───────────────┴───────────────┐
                                          │                               │
                                    XhsMcpPublisher              WecomSdkPublisher
                                    (当前重构实现)                 (后续)
                                          │                               │
                                          ↓
                                     EventBus
                                    │        │
                                    ↓        ↓
                               SSE(/progress)  WebSocket(/ws)
```

### 设计原则

- **隔离性**：添加新平台只需新建一个 Publisher 文件，不需要改队列逻辑、路由、事件总线
- **渐进式**：XhsMcpPublisher 是第一个实现，也是本重构的范围。后续平台只需写 Publisher 实现
- **一致性**：所有平台共用一套队列、超时、重试、进度推送机制
- **无过度抽象**：Publisher 接口的方法就是各平台实际需要的能力，没有推测性的抽象

---

## 架构（当前重构范围：小红书 MCP 直连）

### 重构前

```
Queue → GatewayService → OpenClaw Gateway(:18789) → ht-om agent → mcporter → xhs-mcp Docker(:18060/mcp)
```

### 重构后

```
                     ┌──────────────────┐
POST /api/xhs/publish → PublishQueue(BullMQ)
                     └────────┬─────────┘
                              │ worker
                              ▼
                     ChannelRouter
                              │
                              ▼
                     XhsMcpPublisher ← 第一个 Publisher 实现
                              │
                              ├── HTTP POST JSON-RPC → xhs-mcp Docker(:18060/mcp)
                              │                              │
                              │                         Playwright 自动化
                              │
                              ▼
                         EventBus
                        │        │
                  SSE(/progress)  WebSocket(/ws) → apps/web
                        │
                        ▼
                   ht-gates → ht-ui
```

## 配置文件

### 环境变量

`apps/server/.env.example` 和根 `.env.example` 新增：

```env
# Xiaohongshu MCP 直连配置
# JSON 数组，每个元素对应一个 xhs-mcp Docker 容器实例
# name: 实例标识名, url: MCP 服务地址, accountName: 绑定的小红书账号名
# XHS_MCP_INSTANCES=[{"name":"xhs-1","url":"http://100.64.0.11:5601","accountName":"不加糖也很酷"}]
```

### `config/xhs-mcp.ts`

- 解析 `XHS_MCP_INSTANCES` 环境变量（JSON 数组）
- 提供 `getMcpUrlByName(name)` 和 `getMcpUrlByIndex(index)` 获取完整 MCP 端点 URL（自动拼接 `/mcp` 路径）
- 启动时 `validateXhsMcpConfig()` 校验配置
- 实例过滤：空 name/url 自动跳过并 warn

## API 路由

### xhs-mcp 路由

`routes/xhs.ts`，注册到 `/api/xhs` 前缀：

#### POST /api/xhs/publish

发布图文笔记。

- Body: `{ accountId, title, content, images[], tags?, scheduleAt?, visibility?, isOriginal?, products? }`
- 流程：入队 PublishQueue → ChannelRouter → XhsMcpPublisher.publish()
- 响应: `{ taskId, status: "QUEUED" }`

#### POST /api/xhs/publish/video

发布视频笔记。

- Body: `{ accountId, title, content, video, tags?, visibility?, products? }`
- 注意：video 必须是容器可访问的本地路径，不支持 HTTP URL

#### GET /api/xhs/login/qrcode

获取登录二维码。

- Query: `?instance=xhs-1`
- 流程：调 MCP `get_login_qrcode` → XhsMcpPublisher.startAuth()
- 响应: `{ qrcode: "data:image/png;base64,...", expiresIn: 120 }`

#### GET /api/xhs/login/status

查询登录状态。

- Query: `?instance=xhs-1`
- 流程：调 MCP `check_login_status` → XhsMcpPublisher.checkAuth()
- 响应: `{ loggedIn: boolean }`

#### POST /api/xhs/login/refresh

重置登录（清除 cookies 后重新获取二维码）。

- Query: `?instance=xhs-1`
- 流程：调 MCP `delete_cookies` → `get_login_qrcode`
- 响应: `{ qrcode: "data:image/png;base64,...", expiresIn: 120 }`

### 通用发布路由

`routes/publish.ts`，注册到 `/api/publish` 前缀：

#### POST /api/publish

通用发布入口，适配所有已注册的 Publisher。

- Body: `{ platform, accountId, action, payload }`
- 流程：构造 PublishJob → 入队 PublishQueue
- 响应: `{ jobId, status: "QUEUED" }`

后续 ht-gates 统一调这个端点。

#### GET /api/publish/:jobId

查询发布任务状态。

- 响应: `{ jobId, platform, status, progress, result?, createdAt, updatedAt }`

## SSE 进度端点

### GET /api/sse/progress

ht-gates 订阅发布/操作进度的事件流。所有 Publisher 的状态变更都通过此端点推送。

```
data: {"type":"publish","jobId":"...","platform":"xiaohongshu","status":"QUEUED","progress":0}
data: {"type":"publish","jobId":"...","platform":"xiaohongshu","status":"RUNNING","progress":30}
data: {"type":"publish","jobId":"...","platform":"xiaohongshu","status":"SUCCESS","progress":100,"url":"..."}
data: {"type":"auth","platform":"xiaohongshu","instance":"xhs-1","status":"qr_ready"}
data: {"type":"auth","platform":"xiaohongshu","instance":"xhs-1","status":"logged_in"}
```

- 协议：标准 text/event-stream
- ht-gates 连接后被动接收事件，无需轮询
- 可选 query `?token=xxx` 预留后续认证

## XhsMcpPublisher 实现（第一个 Publisher）

### MCP JSON-RPC Client

通过 HTTP POST 与 xhs-mcp 容器通信：

```typescript
class XhsMcpClient {
  constructor(private instanceUrl: string) {}

  async callTool<T>(method: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.instanceUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: method, arguments: args },
        id: crypto.randomUUID(),
      }),
    });
    return parseJsonRpcResponse<T>(res);
  }
}
```

### 支持的 MCP 工具

| Publisher 方法 | MCP 工具 | 用途 |
|---------------|----------|------|
| `publish({ title, content, images, ... })` | `publish_content` | 发布图文 |
| `publish({ title, content, video, ... })` | `publish_with_video` | 发布视频 |
| `startAuth()` | `get_login_qrcode` | 获取登录二维码 |
| `checkAuth()` | `check_login_status` | 查询登录态 |
| `refreshLogin()` | `delete_cookies` → `get_login_qrcode` | 重新登录 |
| `searchFeeds(keyword, filters)` | `search_feeds` | 搜索笔记 |
| `getFeedDetail(feedId, xsecToken)` | `get_feed_detail` | 获取笔记详情 |

### 实例路由

```typescript
class XhsMcpPublisher implements Publisher {
  platform = 'xiaohongshu';

  constructor(public name: string, private client: XhsMcpClient) {}

  async publish(job: PublishJob): Promise<PublishResult> {
    const { title, content, images, tags, scheduleAt, visibility } = job.payload;
    const result = await this.client.callTool('publish_content', {
      title, content, images, tags, scheduleAt, visibility,
    });
    return {
      success: true,
      externalId: result.noteId,
      url: result.noteUrl,
    };
  }

  async checkAuth(): Promise<AuthStatus> {
    return this.client.callTool('check_login_status');
  }

  async startAuth(): Promise<AuthInitResult> {
    const { qrcode, expiresIn } = await this.client.callTool('get_login_qrcode');
    return { type: 'qrcode', data: qrcode, expiresIn };
  }

  validateConfig(): boolean { /* ... */ }
}
```

## EventBus 进度发布

内部事件总线，统一分发进度事件到 WebSocket 和 SSE：

```typescript
interface ProgressEvent {
  type: 'publish' | 'auth';
  jobId?: string;
  platform: string;
  instance?: string;
  status: string;
  progress?: number;
  data?: unknown;
}
```

- WebSocket: 通过 `broadcastMediaAction()` 推送到前端
- SSE: 写入 `SseManager` 的连接池

## 账号与实例映射

### 小红书（当前）

通过配置文件关联，不改数据库：

```env
XHS_MCP_INSTANCES=[
  {"name":"xhs-1","url":"http://100.64.0.11:5601","accountName":"不加糖也很酷"},
  {"name":"xhs-2","url":"http://100.64.0.11:5602","accountName":"陈雅文"}
]
```

发布请求中的 `accountId` → 查数据库 Account 的 `accountName` → 找对应 MCP 实例 → XhsMcpPublisher。

### 后续平台

各平台的认证方式不同（API Key/Secret、AppID + Secret 等），配置方式在各自 Publisher 中定义。

## 图片访问

`publish_content` 的 images 参数支持 HTTP URL 或本地路径。统一使用 HTTP URL：

```
POST /api/xhs/publish
  body.images = ["http://current-project:50000/api/media/file/xxx"]
```

MCP 容器通过 HTTP 拉取图片，不依赖文件系统挂载。video 参数例外（`publish_with_video` 仅支持本地路径）。

## 错误处理

| 场景 | 处理 |
|------|------|
| MCP 容器宕机 | Worker 重试 3 次（指数退避），终态 FAILED |
| Cookie 过期 | publish 失败 → `NEEDS_AUTH` → EventBus 推送 auth 需重新登录 |
| 并发争用 | 每个实例 concurrency: 1，队列保证不重叠 |
| 超时 | 继承 `MediaActionTimeoutService`（每 2 分钟检查超时键） |
| 网络错误 | 5xx 可重试，4xx 不可重试 |
| 图片不存在 | images 中无效 URL 前置校验后返回 400 |

## 过渡计划

### 阶段 1 — Publisher 框架 + MCP 直连

- [x] xhs-mcp.ts 配置
- [ ] Publisher 接口定义
- [ ] ChannelRouter 实现
- [ ] XhsMcpPublisher 实现（第一个 Publisher）
- [ ] PublishQueue 改为通用（当前 publish-queue + media-action-queue 合并统一）
- [ ] routes/xhs.ts + routes/publish.ts API 端点
- [ ] SSE 进度端点
- [ ] EventBus 集成
- [ ] 保留旧 Gateway 代码共存

### 阶段 2 — 登录 UI（小红书）

- [ ] 前端账号管理增加扫码登录弹窗
- [ ] 账号 ↔ MCP 实例配置

### 阶段 3 — 清理

- [ ] Gateway 中 xhs 相关代码删除
- [ ] xhs webhook 路由删除
- [ ] 清理不再需要的环境变量
