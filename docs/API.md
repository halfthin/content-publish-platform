# API 文档

> 更新时间：2026-05-19  
> 范围：`apps/server/src/routes/*`、`apps/server/src/index.ts` 当前后端路由。  
> 默认 Base URL：`http://localhost:50000`（以 `PORT` 环境变量为准；部分历史文档仍可能写 `3000`）。  
> Swagger UI：`/docs`；OpenAPI JSON：`/docs/openapi.json`。

## 1. 通用约定

### Swagger / OpenAPI

当前后端提供两种 API 文档入口：

- `GET /docs`：Swagger UI 页面。
- `GET /docs/openapi.json`：OpenAPI 3.0 JSON。

`docs/API.md` 是叙述版文档；OpenAPI JSON 是 Swagger UI 使用的机器可读契约。测试 `apps/server/src/routes/api-doc.test.ts` 会校验叙述版文档列出的 HTTP/WS 端点都存在于 OpenAPI paths 中。

### 前端 Agent 设计指南

本项目的 Swagger/OpenAPI 现在不仅描述接口，还承担前端 UI 设计输入的职责。

- `tags[*].description`：说明业务域和页面职责。
- `tags[*].x-ui`：给前端 agent 的导航、页面、表格和状态机提示。
- `paths[*].x-ui`：给具体按钮、表单、弹窗、危险操作、实时通道的提示。
- `x-frontend-agent`：说明前端首页导航、MVP 流程和优先级。

推荐前端 IA：

1. 内容库：`scan-inbox` → 内容列表 → 详情预览 → 审核通过/拒绝 → 发布。
2. 账号管理：账号列表 → 详情 → Cookie 导入 → 登录状态检查。
3. 发布状态：发布统计 → 发布历史 → 失败重试。
4. 小红书：登录二维码 → 登录状态 → 快速发布。

设计时优先依据状态枚举决定可用按钮，不要硬编码“某个路由一定可见”。

### 前端 Agent UI 合约

`GET /docs/openapi.json` 的顶层 `x-frontend-agent` 是前端设计 agent 的机器可读 UI 合约。它包含：

- `pages`：MVP 页面、导航路径、核心组件和主接口映射。
- `workflows.reviewAndPublish`：内容审核发布闭环，从 `scan-inbox` 到 `PublishLog.status=SUCCESS`。
- `workflows.accountCookieLogin`：账号创建、Cookie 导入、异步登录态检查和回调状态读取。
- `workflows.publishFailureRecovery`：发布失败查看、重试和人工补偿入口。
- `entityStates`：`Content.status`、`Account.status/loginStatus`、`PublishLog.status` 的按钮可见性和终态规则。
- `formContracts`：关键表单字段、组件建议、接口必填与 UI 必填差异。
- `realtime`：WebSocket `WS /ws` 的用途。
- `auth.production`：生产环境 `Authorization: Bearer <API_AUTH_TOKEN>`、公开路由和 docs 暴露开关。
- `contentSource`：`CONTENT_DIR` 可配置；`inbox`、`approved`、`published` 是固定子目录约定。
- `endpointPriority`：MVP 主接口、legacy optional 接口和 integration-only webhook 接口分层。

前端 agent 应优先实现 `pages` 中的四个 MVP 页面：`/contents`、`/accounts`、`/publish-status`、`/xhs`。`/api/media/*` 可作为素材工作流的可选后续模块，不应阻塞主发布 UI。

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

### 生产鉴权

生产环境中，除 `/health`、`/ready` 和 `/api/webhook/*` 外，管理 API 默认需要：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

Webhook 回调使用独立 Bearer Token，不使用管理 API token：

```http
Authorization: Bearer <CPP_FROM_GATEWAY_TOKEN>
```

`/docs` 与 `/docs/openapi.json` 是否暴露由 `EXPOSE_DOCS` 控制；生产建议设置 `EXPOSE_DOCS=false`。
Cookie 导入支持可选 `password`；未传时使用 `COOKIE_ENCRYPTION_KEY`。

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

### GET `/api/health`

返回服务健康状态，用作 liveness 检查。

**响应示例**

```json
{
  "status": "ok",
  "timestamp": "2026-05-19T00:00:00.000Z"
}
```

### GET `/api/ready`

返回 readiness 检查结果。服务会聚合环境、数据库、Redis、内容目录和 Gateway 等依赖状态；任一必需检查失败时返回 `503`，用于部署/负载均衡流量门禁。

**响应示例**

```json
{
  "status": "ready",
  "timestamp": "2026-05-19T00:00:00.000Z",
  "checks": {
    "environment": { "status": "ok", "message": "environment valid" },
    "database": { "status": "ok", "message": "database reachable" },
    "redis": { "status": "ok", "message": "redis reachable" },
    "contentDir": { "status": "ok", "message": "content directory writable" },
    "gateway": { "status": "ok", "message": "gateway configured" }
  }
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

扫描 `${CONTENT_DIR}/inbox`，导入待审核内容。

`CONTENT_DIR` 可配置；当前实现固定使用其中的 `inbox` 子目录作为待审核入口，`approved` 与 `published` 也基于同一个基目录。

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

## 6. 小红书 XHS MCP 直连 API

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

## 7. 素材库 API

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


## 8. Webhook API

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

## 9. WebSocket

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
---

## 10. 常用 Smoke Test

生产管理 API 需要 `API_AUTH_TOKEN`；以下命令默认不触发第三方发布。

```bash
export API_BASE_URL=http://localhost:50000
export API_AUTH_TOKEN=<token>

# 健康检查
curl "$API_BASE_URL/health"
curl "$API_BASE_URL/ready"

# 账号列表
curl -H "Authorization: Bearer $API_AUTH_TOKEN" "$API_BASE_URL/api/accounts"

# 内容列表
curl -H "Authorization: Bearer $API_AUTH_TOKEN" "$API_BASE_URL/api/contents"

# 发布统计
curl -H "Authorization: Bearer $API_AUTH_TOKEN" "$API_BASE_URL/api/publish-status/stats"

# XHS MCP 登录状态（需要 XHS_MCP_INSTANCES 且服务已启动）
curl -H "Authorization: Bearer $API_AUTH_TOKEN" \
  "$API_BASE_URL/api/xhs/login/status?instance=xhs-1"
```

部署后可运行脚本化 smoke：

```bash
API_BASE_URL=http://localhost:50000 API_AUTH_TOKEN=<token> EXPOSE_DOCS=false bun run smoke:api
```

---

## 11. 已知限制 / 注意事项

- `CONTENT_DIR` 可配置，但 inbox/approved/published 子目录名目前是约定固定的。
- `/api/publish` 与 `/api/xhs/publish*` 当前会入队到现有 BullMQ 发布队列；完整发布依赖 Redis、Postgres、有效账号、有效 Cookie 或 xhs-mcp 登录态。
- `/api/media/*` 是 legacy/optional 素材工作流，不是当前 `service-api` 主发布路径。
- `PublishJobData` 与新 `PublishJobPayload` 暂时并存，后续需要统一类型边界。
- `XHS_MCP_INSTANCES.accountName` 已在配置类型中支持，但当前 publisher 实例注册 key 仍主要使用 `name`。
- `GET /api/xhs/login/*` 与 `POST /api/xhs/login/refresh` 需要先配置并启动 `XHS_MCP_INSTANCES` 对应实例；未配置时应返回 `404`，不应触发真实外部请求。
- 真实外部发布会对第三方平台产生副作用，合并前建议只做测试账号/草稿内容验证。

## 12. 当前验证状态（2026-05-19）

已完成并同步到当前分支的默认门禁：

- `cd apps/server && bun run check`：通过（Biome 检查）。
- `cd apps/server && bun test`：通过，默认测试不触发真实第三方发布。
- `cd apps/server && bun test src/config/env.test.ts src/middleware/auth.test.ts src/routes/health.test.ts src/routes/publish-flow.test.ts src/routes/api-doc.test.ts`：生产就绪目标测试通过。
- `bun test tests/real-xhs-smoke.test.ts`：默认跳过真实 XHS smoke。
- `RUN_REAL_XHS_TESTS=true` 且缺少真实发布配置时，`tests/real-xhs-smoke.test.ts` 会失败，证明真实发布不会静默运行。

真实 XHS MCP / Gateway smoke 仍需显式授权和测试账号：

- 必须设置 `RUN_REAL_XHS_TESTS=true`。
- 必须配置 `XHS_MCP_INSTANCES`、`API_BASE_URL`、`API_AUTH_TOKEN`。
- 只能使用测试账号和安全测试内容。
- 默认 CI / 默认本地测试不得启用真实第三方发布。

示例配置：

```bash
RUN_REAL_XHS_TESTS=true \
XHS_MCP_INSTANCES='[{"name":"xhs-1","url":"http://<mcp-host>:<port>","accountName":"<test-account>"}]' \
API_BASE_URL=http://localhost:50000 \
API_AUTH_TOKEN=<token> \
bun test tests/real-xhs-smoke.test.ts
```

建议真实验证顺序：

1. `GET /api/xhs/login/status?instance=xhs-1`
2. `GET /api/xhs/login/qrcode?instance=xhs-1`
3. 使用测试账号和安全素材验证 `POST /api/contents/:id/publish` 到 webhook 回调闭环。

最终上线状态以 `docs/PRODUCTION_READINESS.md` 中的 checklist 和最近验证日期为准。
