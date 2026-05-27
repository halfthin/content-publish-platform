# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 行为准则

### 1. 先思考，再编码

实现前先明确假设，不确定就问。有多解时列出权衡，不偷偷选一个。有更简单的方案就说出来。有疑惑就停下，指明困惑点再问。

### 2. 保持简单

最少的代码解决问题，不写推测性代码。不加未要求的功能，不为单次使用场景做抽象。如果写了 200 行但可以 50 行搞定，重写。问自己："资深工程师会觉得这太复杂了吗？"

### 3. 外科手术式修改

只改必须改的地方。不改动相邻代码、注释或格式。不重构没坏的东西。匹配现有风格。如果改动产生了孤儿代码（未使用的 import/变量/函数），清理掉。不改动已有的死代码。

检验标准：每个改动的行都应直接追溯到需求。

### 4. 目标驱动执行

把任务转化为可验证的目标：
- "加验证" → "先写无效输入的测试，再让它们通过"
- "修 bug" → "先写复现 bug 的测试，再让它通过"

多步骤任务先陈述简要计划：
```
1. [步骤] → 验证: [检查点]
2. [步骤] → 验证: [检查点]
```

## 项目概述

多平台内容发布自动化系统，支持小红书、微博、抖音、B站、微信公众号等平台的发布。

**技术栈**: Bun + ElysiaJS (后端) | Vue 3 + Element Plus + Vite (前端) | PostgreSQL + Prisma | Redis + BullMQ | Playwright

## 常用命令

```bash
# 安装依赖
bun install

# 本地开发（同时启动 server + web）
bun run dev

# 分别启动
bun run dev:server      # 后端 (port 50000)
bun run dev:web         # 前端 (port 50001，代理 /api 到 50000)

# 后端 watch 模式
bun run dev:server:watch

# 数据库操作
bun run db:generate      # 生成 Prisma Client
bun run db:migrate       # 数据库迁移
bun run db:push          # 推送 schema 到数据库
bun run db:studio        # 打开 Prisma Studio

# 测试
cd apps/server && bun test              # 后端测试（默认不依赖本地 Postgres/Redis）
cd apps/server && bun test --filter "test-name"  # 运行单个测试
cd apps/server && RUN_INTEGRATION_TESTS=true bun test  # 集成测试（需本地基础设施）

# Lint/Format (Biome)
cd apps/server && bun run check          # Biome 检查+自动修复
cd apps/web && bun run check             # Web 端检查

# Docker
bun run docker:up                         # 启动 Docker 服务
bun run docker:down                       # 停止 Docker 服务

# 冒烟测试
bun run smoke:api                         # API 冒烟测试脚本
```

## 项目结构

```
content-publish-platform/
├── apps/
│   ├── server/                           # 后端 API (Bun + ElysiaJS, port 50000)
│   │   ├── src/
│   │   │   ├── index.ts                  # 入口，bootstrap + 优雅关闭
│   │   │   ├── routes/                   # API 路由
│   │   │   │   ├── index.ts              # 路由聚合
│   │   │   │   ├── accounts.ts           # 账号 CRUD + Cookie 管理
│   │   │   │   ├── contents.ts           # 内容 CRUD
│   │   │   │   ├── publish.ts            # 发布入口 + 进度 SSE
│   │   │   │   ├── publish-status.ts     # 发布状态查询
│   │   │   │   ├── media.ts              # 素材管理
│   │   │   │   ├── media-actions.ts      # 素材动作（转图片、去重等）
│   │   │   │   ├── webhook.ts            # Gateway 回调接收
│   │   │   │   ├── health.ts             # 健康检查
│   │   │   │   └── xhs.ts                # 小红书 MCP 相关接口
│   │   │   ├── services/                 # 业务逻辑层
│   │   │   │   ├── content.service.ts    # 内容管理逻辑
│   │   │   │   ├── file-watcher.service.ts  # content/inbox 文件监听
│   │   │   │   ├── gateway.service.ts    # OpenClaw Gateway 客户端
│   │   │   │   ├── channel-router.ts     # Publisher 注册/路由
│   │   │   │   ├── xhs-mcp-publisher.ts  # 小红书 MCP 发布器
│   │   │   │   ├── cookie-refresh.service.ts  # Cookie 自动刷新
│   │   │   │   ├── media-*.ts            # 素材相关服务（上传、库、收藏、缩略图等）
│   │   │   │   ├── openclaw-callback-*.ts    # Gateway 回调处理/去重
│   │   │   │   ├── sse-server-manager.ts     # SSE 服务端管理
│   │   │   │   └── progress-event-bus.ts     # 发布进度事件总线
│   │   │   ├── publishers/               # 平台发布器（本地 Playwright 模式）
│   │   │   │   ├── xiaohongshu.ts        # 小红书发布器
│   │   │   │   ├── weibo.ts              # 微博发布器
│   │   │   │   └── douyin.ts             # 抖音发布器
│   │   │   ├── queues/                   # BullMQ 队列 + Workers
│   │   │   │   ├── publish-queue.ts      # 发布队列
│   │   │   │   └── media-action-queue.ts # 素材动作队列
│   │   │   ├── workers/                  # Worker 进程
│   │   │   ├── config/                   # 单例配置 + 平台选择器
│   │   │   │   ├── playwright.ts         # BrowserPool 单例
│   │   │   │   ├── prisma.ts             # Prisma 客户端单例
│   │   │   │   ├── redis.ts              # Redis 客户端单例
│   │   │   │   ├── gateway.ts            # Gateway 配置
│   │   │   │   ├── xhs-mcp.ts            # XHS MCP 配置
│   │   │   │   └── env.ts               # 环境变量校验
│   │   │   ├── types/                    # TypeScript 类型定义
│   │   │   ├── utils/                    # 工具函数（加密、Cookie 标准化）
│   │   │   ├── middleware/               # Elysia 中间件
│   │   │   └── websocket/               # WebSocket 处理
│   │   └── prisma/                       # 数据库 schema + migrations
│   └── web/                              # 前端 (Vue 3 + Vite, port 50001)
│       ├── src/
│       │   ├── views/                    # 页面 (Dashboard, Contents, Accounts, Publish等)
│       │   ├── api/                      # API 客户端
│       │   ├── stores/                   # Pinia 状态管理
│       │   ├── components/               # 通用组件
│       │   ├── websocket/                # WebSocket 客户端
│       │   ├── router.ts                 # 路由配置
│       │   └── config/                   # 前端配置
│       └── vite.config.ts                # Vite 配置（代理 /api 到 50000）
├── content/                              # 内容文件存储
│   ├── inbox/                            # 待审核内容（文件监听目录）
│   ├── approved/                         # 已通过
│   └── published/                        # 已发布
├── docker/                               # Docker Compose 配置
├── docs/                                 # 文档（中文）
├── tests/                                # 跨模块功能/回归测试
│   ├── test-env-exec.ts
│   └── test-*.ts
└── scripts/                              # 工具脚本
    └── smoke-api.sh                      # API 冒烟测试
```

## 核心架构

### 两种发布模式

系统支持两种发布模式，通过 `PUBLISH_MODE` 环境变量切换：

**1. Gateway 模式（默认）**：通过 OpenClaw Gateway 委托发布
```
content/inbox/ → file-watcher → content.service → BullMQ
    → GatewayService → OpenClaw Gateway webhook → ht-om agent (MCP skill)
    → POST /api/webhook/:platform/publish-result ← 回调通知 → 更新状态
```

**2. Local 模式**：使用 Playwright 本地浏览器发布
```
content/inbox/ → file-watcher → content.service → BullMQ → Playwright publishers
```

### Publisher 路由系统（ChannelRouter）

`services/channel-router.ts` 管理所有 Publisher 的单例注册表。支持两种发布途径：
- **Gateway 途径**: 通过 `xhs-mcp-publisher.ts` 实现，它将发布任务转发给 OpenClaw Gateway
- **本地途径**: 通过 `publishers/` 下的 Playwright 实现

注册 key 为 `platform:name` 格式，支持命名账号（如 `xiaohongshu:default`）和按账号名精确匹配。

### 素材动作系统

支持对发布素材进行预处理（转图片格式、去重、状态检查等），通过 `media-action-queue.ts`（BullMQ 队列）+ `media-action-dispatcher.ts` 调度，结果通过 SSE 推送。

### 单例模式

- `BrowserPool` - Playwright 浏览器池单例 (`config/playwright.ts`)
- `Prisma Client` - 数据库客户端单例 (`config/prisma.ts`)
- `PublishQueue` - BullMQ 发布队列单例 (`queues/publish-queue.ts`)
- `GatewayService` - Gateway 客户端单例 (`services/gateway.service.ts`)
- `ChannelRouter` - Publisher 注册表单例 (`services/channel-router.ts`)

### 优雅关闭

`index.ts` 的 `shutdown()` 函数按顺序清理：文件监听 → 发布队列 → 素材动作队列 → SSE 管理器 → 浏览器池 → 服务器 → 数据库 → Redis。

### Cookie 安全

- AES-256-GCM 加密存储
- PBKDF2 密钥派生
- 每次加密使用独立 Salt + IV + AuthTag

### WebSocket / SSE

- `/ws` - WebSocket 端点，支持心跳（ping/pong），用于实时推送发布状态
- `GET /api/publish/progress` - SSE 端点，用于素材动作进度推送
- `progress-event-bus.ts` - 发布进度事件总线，连接 BullMQ worker 和前端

## 关键配置

环境变量见 `.env`（由 `.env.example` 复制）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 50000 | 服务端口 |
| `DATABASE_URL` | localhost:54321 | PostgreSQL |
| `REDIS_URL` | localhost:16379 | Redis |
| `PLAYWRIGHT_HEADLESS` | true | 浏览器模式 |
| `CONTENT_DIR` | ./content | 内容根目录 |
| `PUBLISH_MODE` | gateway | 发布模式: gateway 或 local |
| `API_BASE_URL` | http://localhost:50000 | 本服务暴露地址（用于 Gateway 回调） |

### Gateway 发布模式

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENCLAW_GATEWAY_URL` | http://localhost:18789 | OpenClaw Gateway 地址 |
| `CPP_TO_GATEWAY_TOKEN` | - | 调用 Gateway 的认证 token |
| `CPP_FROM_GATEWAY_TOKEN` | - | Gateway 回调认证 token |

### 平台名称映射（Gateway 模式）

| 内部平台名 | Gateway Webhook 路径 |
|-----------|---------------------|
| xiaohongshu | xhs |
| weibo | weibo |
| douyin | douyin |
| bilibili | bilibili |
| wechat | wechat |

## 测试约定

- 后端测试文件使用 `*.test.ts` 后缀，放在被测试文件旁边
- 默认测试不依赖本地 Postgres/Redis（使用 mock），设 `RUN_INTEGRATION_TESTS=true` 启用集成测试
- 跨模块回归测试放在 `tests/` 目录
- 参考 `apps/server/src/routes/` 下的测试文件了解模式

## 扩展新平台

1. 在 `apps/server/src/publishers/` 创建 `<platform>.ts` 发布器类
2. 在 `apps/server/src/queues/publish-queue.ts` 注册发布器
3. 在 `apps/server/src/config/` 添加平台选择器配置
4. 更新前端 `Accounts.vue` 添加平台选项

参考 `apps/server/src/publishers/xiaohongshu.ts` 已有实现。

## 更多参考

编码风格、提交规范、安全配置等详见 [AGENTS.md](./AGENTS.md)。
