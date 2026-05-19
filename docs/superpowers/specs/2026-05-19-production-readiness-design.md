# 生产就绪设计方案

**日期：** 2026-05-19  
**分支：** `service-api`  
**范围：** `apps/server` 下的 Bun/Elysia API 服务  
**目标：** 将当前仅“API 文档齐全、默认测试通过”的服务推进到“具备生产上线门禁”的状态。

## 背景

`service-api` 分支已经完成了 server-only 根目录脚本，并提供了面向前端 agent 设计 UI 的 `/docs` OpenAPI 契约。当前剩余的发布阻塞点已经不是 API 文档，而是生产就绪能力：配置、部署、鉴权、readiness 检查、发布闭环验证、可观测性和运维文档还没有形成完整门禁。

根据当前仓库探索结果：

- 根目录脚本已经只启动 `apps/server`。
- Swagger UI 位于 `/docs`；OpenAPI JSON 位于 `/docs/openapi.json`。
- 默认后端测试通过，但部分集成测试需要显式环境变量才会运行。
- 真实 XHS/Gateway 发布没有进入默认测试，因为它依赖外部服务，并可能产生第三方平台副作用。
- 现有文档仍保留了较早的验证状态和端口信息，需要补充生产就绪 runbook。

## 发布目标

本设计采用最严格的目标：完整生产发布标准。

只有当服务满足以下条件时，才认为具备生产上线能力：

- 可以从干净环境部署。
- 可以使用经过校验的生产配置启动。
- 管理 API 受到鉴权保护。
- Webhook 回调具备独立 token 校验，防止伪造回调。
- 通过 liveness 与 readiness 端点具备可观测性。
- 部署后可以通过 smoke 命令验证。
- 默认测试不产生外部副作用，同时集成测试和真实发布测试具备显式门禁。
- 有部署、迁移、smoke、回滚和已知限制文档。

## 非目标

本阶段不做以下事项：

- 重建前端 UI。
- 删除 legacy `/api/media/*` 路由。
- 让真实第三方发布进入默认测试。
- 替换现有队列或 publisher 架构。
- 在当前 XHS/Gateway 生产就绪路径之外新增其他平台能力。

## 已评估方案

### 方案 A：最小生产门禁

只补充环境校验、Docker 对齐、健康检查、smoke 测试和部署文档。

**未采用原因：** 速度最快，但鉴权、发布闭环验证和运维故障处理仍然不足。

### 方案 B：发布闭环优先

优先处理 XHS 真实发布、回调和状态流转。

**未采用原因：** 贴近业务成功路径，但生产访问控制、部署硬化和 runbook 仍不完整。

### 方案 C：生产就绪矩阵

分层建立生产门禁，覆盖配置、部署、安全、发布闭环验证、可观测性、测试和 runbook。

**已选方案：** 该方案能以可审计的方式回答服务是否可以进入生产。

## 架构总览

生产就绪工作分为五条交付线：

1. 配置与部署。
2. 安全与访问控制。
3. Readiness 与 smoke 验证。
4. 发布闭环验证。
5. 测试门禁与运维文档。

每条交付线都保持清晰边界，使后续实现可以小步推进、便于 review、便于回滚。

## 交付线 1：配置与部署

### 目标

干净的生产环境要么安全启动，要么用可操作的配置错误明确失败，不能静默使用危险默认值。

### 建议涉及文件

- `apps/server/src/config/env.ts`
- `apps/server/src/config/env.test.ts`
- `.env.example`
- `apps/server/.env.example`
- `docker/docker-compose.yml`
- `docs/PRODUCTION_READINESS.md` 中的部署说明

### 生产必填变量

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `COOKIE_ENCRYPTION_KEY`
- `COOKIE_ENCRYPTION_SALT`
- `API_AUTH_TOKEN`
- `CPP_TO_GATEWAY_TOKEN`
- `CPP_FROM_GATEWAY_TOKEN`
- `API_BASE_URL`
- `CONTENT_DIR`
- 启用真实 XHS 发布时需要 `XHS_MCP_INSTANCES`

### 行为要求

- development 和 test 环境可以保留当前测试需要的安全本地默认值。
- production 环境必须拒绝缺失的必填变量。
- production 环境必须拒绝已知 placeholder 或弱 secret。
- production 环境必须校验 URL 类变量和 JSON 类 `XHS_MCP_INSTANCES`。
- Docker 端口、env、volume、network 配置必须与 server-only API 部署方式一致。

### 成功标准

- 生产配置缺失或 secret 过弱时，配置校验明确失败。
- Docker 配置不再与文档中的 API base URL 或端口行为矛盾。
- 运维人员可以从环境样例和文档中识别所有生产必填变量。

## 交付线 2：安全与访问控制

### 目标

生产环境中的管理 API 不能裸奔，Webhook 回调必须继续使用独立认证机制。

### 建议涉及文件

- `apps/server/src/middleware/auth.ts`
- `apps/server/src/middleware/auth.test.ts`
- `apps/server/src/routes/index.ts`
- `apps/server/src/routes/api-doc.ts`
- `docs/API.md`
- `docs/PRODUCTION_READINESS.md`

### 访问规则

- `/health` 默认公开。
- `/ready` 可根据部署需求公开或受保护，但不能泄露 secret。
- `/docs` 和 `/docs/openapi.json` 由 `EXPOSE_DOCS` 等环境开关控制。
- `/api/webhook/*` 使用 webhook callback token，不使用管理 API token。
- production 环境下其他 `/api/*` 路由需要 `Authorization: Bearer <API_AUTH_TOKEN>`。

### 日志规则

- 不记录完整 token。
- 不记录原始 cookie。
- 不记录完整 cookie 加密 key 或 salt。
- 保留足够审计上下文：route、鉴权失败类型、platform、task id、请求类别。

### 成功标准

- 访问受保护 API 时缺少管理 token 返回 `401`。
- 正确管理 token 可以访问受保护 API。
- Webhook token 校验与管理 API 鉴权彼此独立。
- 生产环境可以关闭 docs 暴露。

## 交付线 3：Health、Readiness 与 Smoke

### 目标

部署后的服务必须同时暴露进程存活状态和服务可接流量状态，并提供 smoke 验证命令。

### 建议涉及文件

- `apps/server/src/routes/health.ts`
- `apps/server/src/routes/health.test.ts`
- `apps/server/src/routes/index.ts`
- `scripts/smoke-api.sh` 或 `apps/server/scripts/smoke-api.ts`
- `docs/PRODUCTION_READINESS.md`

### 端点语义

#### `/health`

只表示 liveness，即进程是否响应。

期望响应形态：

```json
{
  "status": "ok",
  "timestamp": "2026-05-19T00:00:00.000Z"
}
```

#### `/ready`

表示 readiness，即服务是否适合接收真实流量。

检查项：

- 环境配置校验结果。
- 数据库连接。
- Redis 连接。
- `CONTENT_DIR` 是否存在，以及必需子目录是否可访问。
- 生产必需 token 是否存在。
- 启用发布时 Gateway/XHS 配置状态。

期望响应形态：

```json
{
  "status": "ready",
  "checks": {
    "env": "ok",
    "database": "ok",
    "redis": "ok",
    "contentDir": "ok",
    "gateway": "ok"
  }
}
```

如果一项或多项检查失败，`/ready` 返回非 ready 状态，并使用适合部署门禁的非 2xx 状态码。

### Smoke 验证

Smoke 至少应验证：

- `/health` 返回 ok。
- `/ready` 返回 ready，或返回明确且符合预期的 unready 原因。
- `/docs` 行为符合 `EXPOSE_DOCS` 配置。
- 受保护 API 正确执行管理鉴权。
- 使用鉴权后，一个只读核心端点可访问。
- `/api/publish/progress` 可以建立 SSE 连接。

### 成功标准

- 只需一条 smoke 命令即可在接流量前验证部署后的服务。
- readiness 失败信息可操作，且不泄露 secret。

## 交付线 4：发布闭环验证

### 目标

业务关键路径必须被验证，同时默认测试不能造成第三方平台副作用。

### 标准发布流程

```text
CONTENT_DIR/inbox
  -> POST /api/contents/scan-inbox
  -> Content(PENDING)
  -> POST /api/contents/:id/approve
  -> Content(APPROVED)
  -> POST /api/contents/:id/publish
  -> PublishLog(QUEUED) + Queue Job
  -> Gateway / XHS MCP
  -> POST /api/webhook/:platform/publish-result
  -> PublishLog(SUCCESS/FAILED)
  -> Content(PUBLISHED/FAILED)
  -> CONTENT_DIR/published/{platform}
```

### 路由职责

- `/api/contents/:id/publish` 是已审核内容的主 UI 和生产工作流入口。
- `/api/xhs/publish*` 保留为高级快速发布 API，不作为已审核内容的主流程。
- `/api/webhook/:platform/publish-result` 是发布结果状态的权威回调入口。
- `PublishLog` 是队列、Gateway、回调、重试和错误历史的运维审计对象。
- `Content.status` 用于前端按钮 gating，并表示业务工作流状态。

### 默认无副作用测试

默认测试应模拟：

1. 已存在 approved content。
2. 账号处于 active 状态，并具备 mock 路径所需的发布凭据。
3. 发布会创建 `PublishLog` 和 queue job。
4. 模拟 webhook callback 更新 `PublishLog`。
5. 关联 `Content` 转为 `PUBLISHED` 或 `FAILED`。
6. 失败日志可以通过 `/api/publish-status/:id/retry` 重试。

### 真实 XHS 测试门禁

真实第三方发布必须同时要求：

- `RUN_REAL_XHS_TESTS=true`
- 已配置 `XHS_MCP_INSTANCES`
- 测试账号 credentials/cookies
- 明确的测试内容
- 测试输出明确警告该测试可能发布到外部平台

### 成功标准

- 默认测试验证系统状态闭环，但不产生外部副作用。
- 真实发布只能通过测试账号显式开启。
- 默认 CI 或本地测试不会意外发布到第三方平台。

## 交付线 5：测试门禁与运维文档

### 目标

测试和文档必须让后续 agent 与运维人员明确知道：哪些已经验证，哪些尚未验证。

### 建议涉及文件

- `docs/PRODUCTION_READINESS.md`
- `docs/API.md`
- `tests/` 中适合承载 smoke 或 release note 的文件
- 现有 `*.test.ts` 按测试门禁更新或重组

### 测试层级

#### 默认测试层

命令：

```bash
cd apps/server && bun run check
cd apps/server && bun test
```

特征：

- 无外部副作用。
- 不执行真实第三方发布。
- 适合 CI 稳定运行。
- 覆盖 env schema、auth、docs、health/readiness、queue payload、webhook 状态更新和模拟发布闭环。

#### 集成测试层

命令：

```bash
cd apps/server && RUN_INTEGRATION_TESTS=true bun test
```

特征：

- 可能需要 Postgres 和 Redis。
- 不发布到第三方平台。
- 覆盖 Prisma、BullMQ、content scan、enqueue 和 retry 行为。

#### 真实发布测试层

命令：

```bash
cd apps/server && RUN_REAL_XHS_TESTS=true bun test
```

特征：

- 需要显式 XHS/Gateway/测试账号配置。
- 可能产生第三方平台副作用。
- 绝不能默认运行。

### 生产 Runbook 内容

`docs/PRODUCTION_READINESS.md` 应包括：

- 必填环境变量。
- secret 轮换指导。
- 数据库迁移步骤。
- Docker 启动步骤。
- health 与 readiness 检查。
- smoke 命令。
- 真实 XHS 验证流程。
- 回滚流程。
- 已知限制。
- 带状态字段的 release checklist。

### 成功标准

- 后续 agent 或运维人员可以按 runbook 完成部署、验证和回滚。
- `docs/API.md` 中的验证状态和端口引用保持当前有效。
- skip/todo 测试按门禁记录，不会被误认为已经覆盖生产能力。

## 错误处理模型

### 配置错误

示例：

- 缺少 `DATABASE_URL`。
- 缺少 `REDIS_URL`。
- `COOKIE_ENCRYPTION_KEY` 太弱。
- `XHS_MCP_INSTANCES` JSON 无效。

行为：

- production 启动失败，或 `/ready` 报告 unready。
- 错误信息可操作。
- 不打印 secret。

### 鉴权错误

示例：

- 缺少管理 token。
- Webhook token 无效。

行为：

- 返回 `401`。
- 日志记录 route 和鉴权失败类型。
- 不记录调用方提交的 token。

### 业务状态错误

示例：

- 内容未审核。
- 账号未激活。
- 账号没有 cookie。
- 平台不支持。

行为：

- 返回稳定 JSON envelope。
- 优先使用稳定 `code`，方便前端和运维处理：
  - `CONTENT_NOT_APPROVED`
  - `ACCOUNT_NOT_ACTIVE`
  - `ACCOUNT_COOKIES_MISSING`
  - `UNSUPPORTED_PLATFORM`

### 外部系统错误

示例：

- Gateway 不可达。
- XHS MCP 不可达。
- 回调超时。
- 登录状态过期。

行为：

- 视情况将 `PublishLog.status` 记录为 `FAILED` 或 `NEEDS_AUTH`。
- 保留 `errorCode` 与 `errorMessage`。
- 在安全的情况下允许重试。

## 生产发布 Checklist

只有满足以下条件，才认为本服务具备生产发布条件：

- `cd apps/server && bun run check` 通过。
- `cd apps/server && bun test` 通过。
- Docker image 可以构建并启动。
- `/health` 返回 ok。
- 目标环境中 `/ready` 返回 ready。
- Smoke 命令通过。
- 管理 API 鉴权已启用。
- Webhook token 校验已启用。
- 生产 secret 不是 placeholder，也不是弱密钥。
- 数据库迁移流程已文档化并测试。
- 回滚流程已文档化。
- 默认模拟发布闭环测试通过。
- 真实 XHS 测试账号发布闭环通过；如果没有通过，则本次 release 必须明确标记为“仅 API 服务上线，真实发布禁用”。
- `docs/PRODUCTION_READINESS.md` 记录最终 release 状态。

## 推荐实现顺序

1. 增加环境 schema 校验并更新 env 样例。
2. 拆分 `/health` 与 `/ready`，并增加测试。
3. 增加 smoke 脚本。
4. 增加管理 API 鉴权与 docs 暴露开关。
5. 对齐 Docker 配置与部署文档。
6. 增加默认模拟发布闭环测试。
7. 增加显式真实 XHS 测试门禁。
8. 更新 `docs/API.md` 并编写 `docs/PRODUCTION_READINESS.md`。
9. 运行完整验证并产出最终 release 状态。

## 验收标准

当后续 implementation plan 能把本设计拆解为小任务，并且每个任务都具备以下内容时，本设计即满足进入实施计划的条件：

- 清晰的待修改文件。
- 需要新增或更新的测试。
- 明确的执行命令。
- 除非显式门禁开启，否则不触发真实第三方发布。
- 不存在生产弱密钥路径。
- 最终能形成基于 runbook 的 release 决策。
