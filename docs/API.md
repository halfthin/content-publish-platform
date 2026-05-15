# API 文档

> 更新时间：2026-05-15  
> 范围：`apps/server/src/routes/*`、`apps/server/src/index.ts` 当前后端路由。  
> 默认 Base URL：`http://localhost:50000`（以 `PORT` 环境变量为准；部分历史文档仍可能写 `3000`）。  
> Swagger UI：`/docs`；OpenAPI JSON：`/docs/openapi.json`。

## 1. 通用约定

### Swagger / OpenAPI

当前后端提供两种 API 文档入口：

- `GET /docs`：Swagger UI 页面。
- `GET /docs/openapi.json`：OpenAPI 3.0 JSON。

`docs/API.md` 是叙述版文档；OpenAPI JSON 是 Swagger UI 使用的机器可读契约。测试 `apps/server/src/routes/api-doc.test.ts` 会校验叙述版文档列出的 HTTP/WS 端点都存在于 OpenAPI paths 中。

### 响应包络

大多数 JSON API 返回：

```json
{
  "success": true,
  "data": {},
  "message": "optional"
}
```

失败响应通常为：

```json
{
  "success": false,
  "error": "reason"
}
```

部分文件读取端点直接返回二进制 `Response`，例如内容文件、素材文件和缩略图。

### 平台枚举

发布相关接口当前接受：

- `xiaohongshu`
- `weibo`
- `douyin`
- `bilibili`
- `wechat`

### 认证与回调 Token

- 普通管理 API 当前没有统一鉴权中间件。
- Gateway/Webhook 回调使用 Bearer Token：`Authorization: Bearer <CPP_FROM_GATEWAY_TOKEN>`。
- Cookie 导入支持可选 `password`；未传时使用 `COOKIE_ENCRYPTION_KEY`。

---

## 2. 健康检查

### GET `/`

返回 API 基本信息。

**响应示例**

```json
{
  "name": "Content Publish Platform API",
  "version": "1.0.0",
  "status": "running"
}
```

### GET `/health`

返回服务健康状态。

**响应示例**

```json
{
  "status": "ok",
  "timestamp": "2026-05-14T00:00:00.000Z"
}
```

---

## 3. 内容管理 API

Base：`/api/contents`

### GET `/api/contents`

查询内容列表。

**Query**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | 内容状态过滤 |
| `type` | string | 否 | 内容类型过滤 |
| `category` | string | 否 | 分类过滤 |
| `search` | string | 否 | 搜索关键词 |
| `page` | number | 否 | 默认 `1` |
| `limit` | number | 否 | 默认 `20` |

**响应**

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

### GET `/api/contents/:id`

获取内容详情。

### GET `/api/contents/:id/files/*filepath`

读取内容目录中的图片或视频文件。成功时直接返回文件二进制，并设置 `Content-Type`。

**错误**

- `404`：内容或文件不存在
- `400`：非法路径
- `403`：路径遍历拦截

### POST `/api/contents/:id/approve`

审核通过内容，并移动到 approved 目录。

**Body**

```json
{
  "reviewedBy": "system",
  "note": "optional note"
}
```

### POST `/api/contents/:id/reject`

审核拒绝内容。

**Body**

```json
{
  "reviewedBy": "system",
  "note": "optional note"
}
```

### POST `/api/contents/scan-inbox`

扫描 `content/inbox`，导入待审核内容。

### POST `/api/contents/:id/publish`

把已审核内容加入发布队列。此接口会校验内容状态、账号状态、平台和 Cookie，并创建 `PublishLog`。

**Body**

```json
{
  "platform": "xiaohongshu",
  "accountId": "account-id"
}
```

**响应**

```json
{
  "success": true,
  "data": {
    "id": "publish-log-id",
    "jobId": "queue-job-id",
    "status": "QUEUED"
  },
  "message": "Content queued for publishing"
}
```

### POST `/api/contents/:id/move-to-published`

手动移动内容到 published 目录，并把内容状态更新为 `PUBLISHED`。

**Body**

```json
{
  "platform": "xiaohongshu"
}
```

---

## 4. 账号 API

Base：`/api/accounts`

### GET `/api/accounts`

查询账号列表。

**Query**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `platform` | string | 否 | 平台过滤 |
| `status` | string | 否 | 账号状态过滤 |

### POST `/api/accounts`

创建账号。未传 `groupId` 时会自动连接或创建对应平台的“默认分组”。

**Body**

```json
{
  "name": "不加糖也很酷",
  "platform": "xiaohongshu",
  "groupId": "optional-group-id",
  "username": "optional-username",
  "remark": "optional remark"
}
```

### PUT `/api/accounts/:id`

更新账号。

**Body**

```json
{
  "name": "new name",
  "platform": "xiaohongshu",
  "groupId": "group-id",
  "username": "username",
  "remark": "remark",
  "status": "ACTIVE"
}
```

所有字段均可选。

### DELETE `/api/accounts/:id`

删除账号。

### POST `/api/accounts/:id/toggle-status`

在 `ACTIVE` 与 `INACTIVE` 之间切换账号状态。

### GET `/api/accounts/:id`

获取账号详情，包含分组、最近发布日志和最近一次 check-login 回调快照。

### POST `/api/accounts/:id/cookies`

导入并加密保存账号 Cookie。

**Body**

```json
{
  "cookies": [
    {
      "name": "a1",
      "value": "...",
      "domain": ".xiaohongshu.com",
      "path": "/"
    }
  ],
  "password": "optional-encryption-password"
}
```

`cookies` 也可以传 JSON 字符串。

### POST `/api/accounts/:id/cookies/check-login`

通过 Gateway 发起小红书登录状态检查。当前实现中小红书走 `gateway-mcp` 异步回调，其他平台暂未接入 Gateway check-login。

**响应示例**

```json
{
  "success": true,
  "data": {
    "isLoggedIn": null,
    "message": "Check-login request sent, waiting for callback",
    "platform": "xiaohongshu",
    "verifyMethod": "gateway-mcp"
  }
}
```

### GET `/api/accounts/:id/cookies/verify`

使用 Playwright 本地验证已保存 Cookie。

**Query**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `password` | string | 否 | Cookie 解密密码 |

### DELETE `/api/accounts/:id/cookies`

删除账号 Cookie，并把登录状态重置为 `UNKNOWN`。

### POST `/api/accounts/cookies/batch-import`

批量导入 Cookie。

**Body**

```json
{
  "imports": [
    {
      "accountId": "account-id",
      "cookies": [],
      "password": "optional-password"
    }
  ]
}
```

---

## 5. 发布状态 API

Base：`/api/publish-status`

### GET `/api/publish-status/content/:contentId`

查询某内容的所有发布日志，并附带队列 job 状态。

### GET `/api/publish-status/account/all`

查询所有账号的发布历史。

**Query**

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | string | 否 | `20` | 返回数量 |
| `offset` | string | 否 | `0` | 偏移量 |

### GET `/api/publish-status/account/:accountId`

查询某账号的发布历史。

**Query**：同 `/account/all`。

### GET `/api/publish-status/stats`

返回今日、近 7 天、本月、状态维度、平台维度的发布统计。

### POST `/api/publish-status/:id/retry`

重试失败的发布日志。仅 `FAILED` 状态可重试。

---

## 6. 通用发布 API（Publisher Framework）

Base：`/api/publish`

> 这是本分支新增的通用发布入口，目标是统一后续平台接入。当前队列负载仍兼容旧 `PublishJobData`，`accountName`、`action` 和 XHS MCP 可选发布字段会贯穿到队列负载。

### POST `/api/publish`

创建通用发布任务并入队。

**Body**

```json
{
  "platform": "xiaohongshu",
  "accountId": "account-id",
  "accountName": "xhs-1",
  "action": "publish",
  "payload": {
    "title": "标题",
    "description": "正文",
    "images": ["/container/path/1.jpg"],
    "tags": ["tag1"]
  }
}
```

**必填**：`platform`、`accountId`、`action`。  
**响应**

```json
{
  "success": true,
  "data": {
    "jobId": "queue-job-id",
    "status": "QUEUED"
  }
}
```

### GET `/api/publish/progress`

SSE 进度流，供 ht-gates 或其他客户端订阅。

**Headers**

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**事件示例**

```text
data: {"type":"publish","platform":"system","status":"connected"}

```

进度事件结构：

```json
{
  "type": "publish",
  "jobId": "queue-job-id",
  "platform": "xiaohongshu",
  "instance": "xhs-1",
  "status": "QUEUED",
  "progress": 0,
  "message": "optional",
  "data": {}
}
```

### GET `/api/publish/:jobId`

查询队列任务状态。

**响应**

```json
{
  "success": true,
  "data": {
    "jobId": "queue-job-id",
    "state": "waiting"
  }
}
```

---

## 7. 小红书 XHS MCP 直连 API

Base：`/api/xhs`

> 使用前需要配置 `XHS_MCP_INSTANCES`，例如：  
> `[{"name":"xhs-1","url":"http://127.0.0.1:18060","accountName":"账号名"}]`  
> 代码会自动补齐 `/mcp` 路径。

### GET `/api/xhs/login/qrcode?instance=xhs-1`

调用 MCP `get_login_qrcode` 获取登录二维码，并向进度总线发送 `auth/qr_ready` 事件。若 `instance` 未注册，返回 `404` 与 `MCP instance not found`。

**响应**

```json
{
  "success": true,
  "data": {
    "type": "qrcode",
    "data": "data:image/png;base64,...",
    "expiresIn": 120
  }
}
```

### GET `/api/xhs/login/status?instance=xhs-1`

调用 MCP `check_login_status` 查询登录状态。若 `instance` 未注册，返回 `404` 与 `MCP instance not found`。

**响应**

```json
{
  "success": true,
  "data": {
    "loggedIn": true,
    "accountName": "optional",
    "message": "optional"
  }
}
```

### POST `/api/xhs/login/refresh?instance=xhs-1`

调用 MCP `delete_cookies` 后重新获取登录二维码。若 `instance` 未注册，返回 `404` 与 `MCP instance not found`。

### POST `/api/xhs/publish`

小红书图文发布快捷入口。当前实现会把任务加入通用发布队列。缺少 `accountId`、`title` 或 `content` 时返回 `400`。

**Body**

```json
{
  "accountId": "account-id",
  "accountName": "xhs-1",
  "title": "标题",
  "content": "正文",
  "images": ["/container/path/1.jpg"],
  "tags": ["tag1"],
  "scheduleAt": "optional",
  "visibility": "optional",
  "isOriginal": true,
  "products": []
}
```

**必填**：`accountId`、`title`、`content`。

### POST `/api/xhs/publish/video`

小红书视频发布快捷入口。当前实现会把任务加入通用发布队列。缺少 `accountId`、`title`、`content` 或 `video` 时返回 `400`。

**Body**

```json
{
  "accountId": "account-id",
  "accountName": "xhs-1",
  "title": "标题",
  "content": "正文",
  "video": "/container/path/video.mp4",
  "tags": ["tag1"],
  "visibility": "optional",
  "products": []
}
```

**必填**：`accountId`、`title`、`content`、`video`。  
`video` 必须是容器可访问的本地路径。

---

## 8. 素材库 API

Base：`/api/media`

### GET `/api/media/roots`

返回配置的素材根目录。

### GET `/api/media/favorites`

返回收藏目录列表。

### POST `/api/media/favorites`

新增收藏。

```json
{
  "rootId": "dapai",
  "relativePath": "2026/04/09/A款",
  "label": "A款",
  "pinned": true
}
```

### PATCH `/api/media/favorites/:id`

更新收藏标签或置顶状态。

```json
{
  "label": "新标签",
  "pinned": false
}
```

### DELETE `/api/media/favorites/:id`

删除收藏。

### GET `/api/media/date-tree?rootId=dapai`

返回按年月日组织的素材树。

### GET `/api/media/folder-tree?rootId=regal&path=2026/04/09`

返回普通文件夹树。

### GET `/api/media/folder-summary?rootId=dapai&path=2026/04/09`

返回指定路径下的文件夹摘要。

### GET `/api/media/items?rootId=dapai&path=2026/04/09&recursive=true&limit=120&cursor=...`

返回素材文件列表，支持递归和游标分页。

### GET `/api/media/tags?rootId=dapai&path=2026/04/09/A款`

读取文件夹标签。

### POST `/api/media/tags`

保存文件夹标签。

```json
{
  "rootId": "dapai",
  "path": "2026/04/09/A款",
  "tags": {
    "style": ["lookbook"],
    "scene": ["studio"]
  }
}
```

### GET `/api/media/thumb/:assetKey`

返回素材缩略图二进制。

### GET `/api/media/file/:assetKey`

返回素材原图或原文件二进制。

---

## 9. 素材动作 API

Base：`/api/media/actions`

### GET `/api/media/actions/definitions`

返回支持的素材动作定义。

### GET `/api/media/actions?limit=20`

返回最近素材动作任务。

### POST `/api/media/actions`

提交素材动作任务。

```json
{
  "actionType": "image-to-image",
  "operator": "user",
  "assets": [
    {
      "rootId": "dapai",
      "relativePath": "2026/04/09/A款/1.png"
    }
  ],
  "formData": {
    "mode": "lookbook"
  },
  "context": {
    "workspaceDatePath": "2026/04/09",
    "favoritePaths": ["2026/04/09/A款"]
  }
}
```

### GET `/api/media/actions/:id`

查询素材动作详情。

### POST `/api/media/actions/:id/retry`

重试失败的素材动作。

### DELETE `/api/media/actions/:id`

删除素材动作；如回调保存过上传结果，会尝试删除对应上传目录。

### GET `/api/media/actions/:id/uploads/*filepath`

读取某个素材动作回调保存的上传结果文件。

### GET `/api/media/actions/uploads/roots`

返回上传结果浏览根目录。

### GET `/api/media/actions/uploads/tree?provider=openclaw&path=...`

返回上传结果日期树。

### GET `/api/media/actions/uploads/items?provider=openclaw&path=...&recursive=true&limit=120&cursor=...`

返回上传结果文件列表。

### GET `/api/media/actions/uploads/:provider/*filepath`

读取上传结果文件。

### DELETE `/api/media/actions/uploads/:provider/*filepath`

删除上传结果文件。

---

## 10. Webhook API

Base：`/api/webhook`

### POST `/api/webhook/:platform/publish-result`

接收 Gateway/OpenClaw 发布结果回调。支持统一回调 envelope，也兼容旧 payload。需要 `CPP_FROM_GATEWAY_TOKEN`。

**Headers**

```http
Authorization: Bearer <CPP_FROM_GATEWAY_TOKEN>
Content-Type: application/json
```

**统一 Envelope 示例**

```json
{
  "version": "1.0",
  "eventId": "evt-001",
  "kind": "publish",
  "taskId": "gw-task-001",
  "actionType": "xhs.publish",
  "status": "success",
  "timestamp": "2026-05-14T00:00:00.000Z",
  "refs": {
    "publishLogId": "publish-log-id",
    "contentId": "content-id",
    "accountId": "account-id"
  },
  "target": {
    "platform": "xiaohongshu"
  },
  "result": {
    "url": "https://www.xiaohongshu.com/explore/...",
    "externalId": "note-id"
  }
}
```

**状态映射**

| 回调状态 | PublishLog 状态 | Content 状态 |
| --- | --- | --- |
| `success` | `SUCCESS` | `PUBLISHED` |
| `queued` | `QUEUED` | 不变 |
| `running` | `RUNNING` | 不变 |
| `needs-auth` | `NEEDS_AUTH` | `FAILED` |
| `failed` | `FAILED` | `FAILED` |

重复 `eventId` 会返回 `{ "success": true, "duplicate": true }`。

### POST `/api/webhook/media-actions/:actionType/result`

接收素材动作回调。支持 JSON 或 multipart；multipart 可携带结果文件，服务会保存到 `content/uploaded/openclaw/...` 并写 manifest。

**Headers**

```http
Authorization: Bearer <MEDIA_ACTION_FROM_GATEWAY_TOKEN 或 CPP_FROM_GATEWAY_TOKEN>
```

**JSON Body 示例**

```json
{
  "version": "1.0",
  "eventId": "evt-media-001",
  "kind": "media-action",
  "taskId": "ext-task-001",
  "actionType": "image-to-image",
  "status": "success",
  "timestamp": "2026-05-14T00:00:00.000Z",
  "refs": {
    "mediaActionId": "media-action-id"
  },
  "result": {
    "summary": "done",
    "outputFiles": []
  }
}
```

### POST `/api/webhook/:platform/check-login-result`

接收账号登录状态检查回调。需要 `CPP_FROM_GATEWAY_TOKEN`。

**Body 示例**

```json
{
  "version": "1.0",
  "eventId": "evt-login-001",
  "kind": "account",
  "taskId": "check-task-001",
  "actionType": "xiaohongshu.check-login",
  "status": "success",
  "timestamp": "2026-05-14T00:00:00.000Z",
  "refs": {
    "accountId": "account-id"
  },
  "result": {
    "extra": {
      "loggedIn": true,
      "username": "optional"
    }
  }
}
```

服务会更新账号 `loginStatus` 为 `LOGGED_IN` 或 `EXPIRED`，并保存最近一次回调快照。

---

## 11. WebSocket

### WS `/ws`

用于前端实时通知。

**客户端心跳**

```json
{"type":"ping"}
```

**服务端响应**

```json
{"type":"pong","timestamp":1778767345000}
```

素材动作终态回调在没有活跃 SSE 订阅时会广播：

- `media_action_done`
- `media_action_failed`

---

## 12. 常用 Smoke Test

```bash
# 健康检查
curl http://localhost:50000/health

# 账号列表
curl http://localhost:50000/api/accounts

# 内容列表
curl http://localhost:50000/api/contents

# 发布统计
curl http://localhost:50000/api/publish-status/stats

# SSE 进度流（保持连接）
curl -N http://localhost:50000/api/publish/progress

# XHS MCP 登录状态（需要 XHS_MCP_INSTANCES 且服务已启动）
curl 'http://localhost:50000/api/xhs/login/status?instance=xhs-1'
```

---

## 13. 已知限制 / 注意事项

- `/api/publish` 与 `/api/xhs/publish*` 当前会入队到现有 BullMQ 发布队列；完整发布依赖 Redis、Postgres、有效账号、有效 Cookie 或 xhs-mcp 登录态。
- `PublishJobData` 与新 `PublishJobPayload` 暂时并存，后续需要统一类型边界。
- `XHS_MCP_INSTANCES.accountName` 已在配置类型中支持，但当前 publisher 实例注册 key 仍主要使用 `name`。
- `GET /api/xhs/login/*` 与 `POST /api/xhs/login/refresh` 需要先配置并启动 `XHS_MCP_INSTANCES` 对应实例；未配置时应返回 `404`，不应触发真实外部请求。
- 真实外部发布会对第三方平台产生副作用，合并前建议只做测试账号/草稿内容验证。

## 14. 当前验证状态（2026-05-14）

已完成：

- `cd apps/server && bun run check`：通过（Biome 检查并格式化）。
- `cd apps/server && bun test`：通过，包含发布路由、XHS 路由和队列映射回归测试。
- `bun run build`：通过（Vite 仅有 chunk-size warning）。
- 本地非破坏性 smoke：`/health`、`/api/accounts`、`/api/contents`、`/api/publish-status/stats` 均返回 `200`。

真实 XHS MCP / Gateway smoke 当前阻塞：

- `apps/server/.env` 中 `XHS_MCP_INSTANCES` 未配置。
- 探测端口显示 `OPENCLAW_GATEWAY_URL=http://localhost:18789` 未监听，常见 XHS MCP 端口 `18060`、`5601` 未监听。
- 因此当前只验证到本地 API、队列入参映射和缺实例错误路径；未执行会产生第三方平台副作用的真实发布。

解除阻塞后建议使用测试账号配置：

```bash
XHS_MCP_INSTANCES='[{"name":"xhs-1","url":"http://<mcp-host>:<port>","accountName":"<test-account>"}]'
```

然后依次验证：

1. `GET /api/xhs/login/status?instance=xhs-1`
2. `GET /api/xhs/login/qrcode?instance=xhs-1`
3. `GET /api/publish/progress` SSE 连接事件
4. 仅使用测试账号/安全素材验证 enqueue；真实发布需单独授权。
