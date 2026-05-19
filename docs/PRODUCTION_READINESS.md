# 生产就绪 Runbook

> 当前状态：默认门禁通过；真实 XHS 发布需测试账号显式验证  
> 最近验证日期：2026-05-19  
> 服务范围：`apps/server` API 服务  
> Swagger：`/docs`（受 `EXPOSE_DOCS` 控制）  
> OpenAPI JSON：`/docs/openapi.json`（受 `EXPOSE_DOCS` 控制）

本文件用于记录 `service-api` 分支上线前的操作顺序、门禁命令、回滚方式和已知限制。默认门禁必须保持无第三方发布副作用；真实小红书发布验证必须通过显式环境变量和测试账号执行。

## 1. 上线前必填环境变量

生产环境必须配置并通过启动时校验：

- `NODE_ENV=production`
- `PORT=50000`
- `DATABASE_URL`
- `REDIS_URL`
- `COOKIE_ENCRYPTION_KEY`
- `COOKIE_ENCRYPTION_SALT`
- `API_AUTH_TOKEN`
- `CPP_TO_GATEWAY_TOKEN`
- `CPP_FROM_GATEWAY_TOKEN`
- `API_BASE_URL`
- `CONTENT_DIR`
- `EXPOSE_DOCS=false`（生产建议关闭公开文档）
- 真实 XHS 发布启用时：`XHS_MCP_INSTANCES`

生产 secret 不得使用 placeholder、短 token 或开发示例值。

## 2. 部署顺序

1. 准备 Postgres 与 Redis。
2. 准备 `CONTENT_DIR` 持久化目录，并确保应用进程可读写。
3. 配置生产 `.env`。
4. 运行 Prisma 迁移。
5. 启动 API 服务。
6. 运行 `/health` 与 `/ready` 检查。
7. 运行 API smoke 脚本。
8. 如果启用真实发布，使用测试账号执行门禁保护的真实 XHS smoke。

## 3. 数据库迁移

```bash
cd apps/server
bun run db:migrate
```

迁移前应备份生产数据库；如迁移包含不可逆变更，必须提前准备回滚说明。

## 4. Smoke

默认 smoke 只验证 API 可访问性和管理鉴权，不创建第三方发布副作用：

```bash
API_BASE_URL=http://localhost:50000 \
API_AUTH_TOKEN=<token> \
EXPOSE_DOCS=false \
bun run smoke:api
```

如果 `EXPOSE_DOCS=false`，`/docs` 与 `/docs/openapi.json` 应返回不可访问状态；如果临时暴露文档，应显式设置 `EXPOSE_DOCS=true` 并限制访问范围。

## 5. 测试门禁

| 层级 | 命令 | 是否有外部副作用 | 说明 |
| --- | --- | --- | --- |
| 格式/静态检查 | `cd apps/server && bun run check` | 否 | Biome 检查并格式化 server 代码 |
| 默认单元/路由测试 | `cd apps/server && bun test` | 否 | 不应触发真实第三方发布 |
| 集成测试 | `cd apps/server && RUN_INTEGRATION_TESTS=true bun test` | 否 | 仅在依赖服务可用时运行 |
| API smoke 语法检查 | `bash -n scripts/smoke-api.sh` | 否 | 验证部署后 smoke 脚本语法 |
| 真实 XHS smoke | `RUN_REAL_XHS_TESTS=true bun test tests/real-xhs-smoke.test.ts` | 是 | 只允许测试账号和安全测试内容 |

真实 XHS smoke 默认跳过。显式设置 `RUN_REAL_XHS_TESTS=true` 后，如果缺少 `XHS_MCP_INSTANCES`、`API_BASE_URL` 或 `API_AUTH_TOKEN`，测试应失败并阻止静默执行。

## 6. 管理鉴权与文档暴露

- 生产环境中，除 `/health`、`/ready` 与 `/api/webhook/*` 外，管理 API 默认需要：

  ```http
  Authorization: Bearer <API_AUTH_TOKEN>
  ```

- Webhook 使用独立回调 token：

  ```http
  Authorization: Bearer <CPP_FROM_GATEWAY_TOKEN>
  ```

- `/docs` 与 `/docs/openapi.json` 是否暴露由 `EXPOSE_DOCS` 控制。

## 7. 内容目录约定

`CONTENT_DIR` 可配置；服务在该目录下使用固定子目录：

- `inbox`：待扫描/待审核内容入口。
- `approved`：审核通过后内容目录。
- `published`：发布成功或人工补偿后内容目录。

当前主发布流程是：`POST /api/contents/scan-inbox` → 审核 → `POST /api/contents/:id/publish` → webhook 回调更新发布状态。

## 8. 回滚

1. 停止新版本服务，避免继续消费发布队列。
2. 恢复上一版镜像或代码提交。
3. 如涉及数据库迁移，按迁移说明恢复数据库备份或执行补偿脚本。
4. 检查 `CONTENT_DIR` 是否需要回滚或人工修复。
5. 重新运行 `/health`、`/ready` 和 smoke。
6. 检查队列中是否存在未完成发布任务，必要时暂停或重试。

## 9. 上线 Checklist

- [x] `cd apps/server && bun run check` 通过
- [x] `cd apps/server && bun test` 通过
- [x] `bash -n scripts/smoke-api.sh` 通过
- [ ] Docker image 可构建
- [x] `/health` 路由有测试覆盖
- [x] `/ready` 路由有测试覆盖
- [ ] smoke 脚本已对 live deployment 通过
- [x] 管理 API 鉴权有测试覆盖
- [x] Webhook token 校验有回归测试覆盖
- [x] 生产 secret 非 placeholder / 非弱密钥校验有测试覆盖
- [ ] 数据库迁移已在目标环境完成
- [ ] 回滚流程已在目标环境演练
- [x] 默认模拟发布闭环测试通过
- [ ] 真实 XHS 测试账号发布闭环通过，或本次 release 标记为 API-only

## 10. 最近验证证据

2026-05-19 已执行：

```bash
cd apps/server && bun run check
cd apps/server && bun test
bash -n scripts/smoke-api.sh
cd apps/server && bun test src/config/env.test.ts src/middleware/auth.test.ts src/routes/health.test.ts src/routes/publish-flow.test.ts src/routes/api-doc.test.ts
bun test tests/real-xhs-smoke.test.ts
```

结果：默认 server 测试 `154 pass / 0 fail`；目标生产就绪测试 `17 pass / 0 fail`；真实 XHS smoke 默认 `2 skip / 0 fail`。未执行 live deployment smoke、Docker image 构建、真实 XHS 测试账号发布。

## 11. 已知限制

- 真实 XHS 发布依赖测试账号、XHS MCP/Gateway、有效 cookie 或登录态。
- 默认测试不会触发第三方平台发布。
- `/api/media/*` 是 legacy/optional API，不是当前 `service-api` 主发布路径。
- `CONTENT_DIR` 可配置，但 `inbox`、`approved`、`published` 子目录名是当前实现约定。
