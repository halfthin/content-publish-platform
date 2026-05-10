# Xiaohongshu MCP 直连重构设计

## 概述

当前项目通过 OpenClaw Gateway 间接调用 xiaohongshu-mcp 容器，链路冗余。重构后去除 OpenClaw 依赖，直连 xhs-mcp Docker 容器（Streamable HTTP 传输），并新增 SSE 进度端点供 ht-gates 消费。

## 架构

### 重构前

```
Queue → GatewayService → OpenClaw Gateway(:18789) → ht-om agent → mcporter → xhs-mcp Docker(:18060/mcp)
```

### 重构后

```
                         XhsMcpService
Queue ──→ XhsMcpService ──→ HTTP POST JSON-RPC ──→ xhs-mcp Docker(:18060/mcp)
              │                                          │
              ↓                                     Playwright 自动化
          EventBus
           │      │
           │      └──→ WebSocket /ws → apps/web（保留期）
           │
           └───────→ SSE /api/sse/progress → ht-gates → ht-ui
```

## 配置

### 环境变量

`apps/server/.env.example` 和根 `.env.example` 新增：

```env
# Xiaohongshu MCP 直连配置
# JSON 数组，每个元素对应一个 xhs-mcp Docker 容器实例
# name: 实例标识名, url: MCP 服务地址, accountName: 绑定的小红书账号名
# XHS_MCP_INSTANCES=[{"name":"xhs-1","url":"http://100.64.0.11:5601","accountName":"不加糖也很酷"}]
```

### 配置文件

`apps/server/src/config/xhs-mcp.ts`：

- 解析 `XHS_MCP_INSTANCES` 环境变量（JSON 数组）
- 提供 `getMcpUrlByName(name)` 和 `getMcpUrlByIndex(index)` 获取完整 MCP 端点 URL（自动拼接 `/mcp` 路径）
- 启动时 `validateXhsMcpConfig()` 校验配置
- 实例过滤：空 name/url 自动跳过并 warn

## API 路由

新增 `apps/server/src/routes/xhs.ts`，注册到 `/api/xhs` 前缀：

### POST /api/xhs/publish

发布图文笔记。

- Body: `{ accountId, title, content, images[], tags?, scheduleAt?, visibility?, isOriginal?, products? }`
- 流程：入队 BullMQ → worker 根据 accountName 映射实例 → 调 MCP `publish_content`
- 响应: `{ taskId, status: "QUEUED" }`

### POST /api/xhs/publish/video

发布视频笔记。

- Body: `{ accountId, title, content, video, tags?, visibility?, products? }`
- 注意：video 必须是容器可访问的本地路径，不支持 HTTP URL

### GET /api/xhs/login/qrcode

获取登录二维码。

- Query: `?instance=xhs-1`
- 流程：调 MCP `get_login_qrcode`
- 响应: `{ qrcode: "data:image/png;base64,...", expiresIn: 120 }`

### GET /api/xhs/login/status

查询登录状态。

- Query: `?instance=xhs-1`
- 流程：调 MCP `check_login_status`
- 响应: `{ loggedIn: boolean }`

### POST /api/xhs/login/refresh

重置登录（清除 cookies 后重新获取二维码）。

- Query: `?instance=xhs-1`
- 流程：调 MCP `delete_cookies` → `get_login_qrcode`
- 响应: `{ qrcode: "data:image/png;base64,...", expiresIn: 120 }`

## SSE 进度端点

### GET /api/sse/progress

ht-gates 订阅发布/操作进度的事件流。

```
data: {"type":"publish","taskId":"...","status":"RUNNING","progress":0,"instance":"xhs-1"}
data: {"type":"publish","taskId":"...","status":"SUCCESS","progress":100,"url":"..."}
data: {"type":"login","instance":"xhs-1","status":"qr_ready"}
data: {"type":"login","instance":"xhs-1","status":"logged_in"}
```

- 协议：标准 text/event-stream
- ht-gates 连接后被动接收事件，无需轮询
- 可选 query `?token=xxx` 预留后续认证

## XhsMcpService 设计

`apps/server/src/services/xhs-mcp.service.ts`

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

| 内部方法 | MCP 工具 | 用途 |
|----------|----------|------|
| `publish(title, content, images, ...)` | `publish_content` | 发布图文 |
| `publishVideo(title, content, video, ...)` | `publish_with_video` | 发布视频 |
| `getLoginQrcode()` | `get_login_qrcode` | 获取登录二维码 |
| `checkLoginStatus()` | `check_login_status` | 查询登录态 |
| `refreshLogin()` | `delete_cookies` → `get_login_qrcode` | 重新登录 |
| `searchFeeds(keyword, filters)` | `search_feeds` | 搜索笔记 |
| `getFeedDetail(feedId, xsecToken)` | `get_feed_detail` | 获取笔记详情 |

### 实例路由

```typescript
class XhsMcpService {
  // accountName → MCP 实例映射
  private getClientForAccount(accountName: string): XhsMcpClient {
    const instance = xhsMcpConfig.instances.find(i => i.accountName === accountName);
    if (!instance) throw new Error(`No MCP instance for account: ${accountName}`);
    return new XhsMcpClient(instance.url);
  }
}
```

## EventBus 进度发布

内部事件总线，统一分发进度事件到 WebSocket 和 SSE：

```typescript
interface ProgressEvent {
  type: 'publish' | 'login' | 'action';
  taskId?: string;
  instance: string;
  status: string;
  progress?: number;
  data?: unknown;
}
```

- WebSocket: 通过 `broadcastMediaAction()` 推送到前端
- SSE: 写入 `SseManager` 的客户端连接池

## 账号与 MCP 实例映射

通过配置文件关联，不改数据库：

```env
XHS_MCP_INSTANCES=[
  {"name":"xhs-1","url":"http://100.64.0.11:5601","accountName":"不加糖也很酷"},
  {"name":"xhs-2","url":"http://100.64.0.11:5602","accountName":"陈雅文"}
]
```

发布请求中的 `accountId` → 查数据库 Account 的 `accountName` → 找对应 MCP 实例 → 调 MCP。

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
| Cookie 过期 | publish_content 返回需要登录 → `NEEDS_AUTH` → 通知用户重新登录 |
| 并发争用 | 每个实例 concurrency: 1，队列保证不重叠 |
| 超时 | 继承 `MediaActionTimeoutService`（每 2 分钟检查超时键） |
| 网络错误 | 5xx 可重试，4xx 不可重试 |
| 图片不存在 | images 中无效 URL 前置校验后返回 400 |

## 过渡计划

### 阶段 1 — MCP 直连

- [x] xhs-mcp.ts 配置
- [ ] XhsMcpService 实现
- [ ] routes/xhs.ts API 端点
- [ ] SSE 进度端点
- [ ] 队列 worker 集成
- [ ] 保留 Gateway 代码共存

### 阶段 2 — 登录 UI

- [ ] 前端登录二维码弹窗
- [ ] 账号 ↔ MCP 实例配置

### 阶段 3 — 清理

- [ ] Gateway 中 xhs 相关代码删除
- [ ] xhs webhook 路由删除
- [ ] 清理不再需要的环境变量
