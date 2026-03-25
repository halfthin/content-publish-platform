# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

多平台内容发布自动化系统，支持小红书、微博、抖音、B站、微信公众号等平台的Cookie驱动的浏览器自动化发布。

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

# 数据库操作
bun run db:generate      # 生成 Prisma Client
bun run db:migrate       # 数据库迁移
bun run db:push          # 推送 schema 到数据库
bun run db:studio        # 打开 Prisma Studio

# 测试
cd apps/server && bun test              # 后端测试（默认不依赖本地 Postgres/Redis）
cd apps/server && RUN_INTEGRATION_TESTS=true bun test  # 集成测试（需本地基础设施）

# Lint/Format
cd apps/server && bun run check          # Biome 检查
cd apps/web && bun run check             # Web 端检查

# Docker
bun run docker:up                         # 启动 Docker 服务
bun run docker:down                       # 停止 Docker 服务
```

## 项目结构

```
content-publish-platform/
├── apps/
│   ├── server/           # 后端 API (Bun + ElysiaJS, port 50000)
│   │   ├── src/
│   │   │   ├── index.ts              # 入口，bootstrap 流程
│   │   │   ├── routes/                # API 路由 (accounts, contents, publish-status)
│   │   │   ├── services/              # 业务逻辑 (content, file-watcher, cookie-refresh)
│   │   │   ├── publishers/            # 平台发布器 (xiaohongshu, weibo, douyin)
│   │   │   ├── queues/               # BullMQ 队列 + Workers
│   │   │   ├── config/               # 单例配置 (browserPool, prisma, logger)
│   │   │   ├── utils/                # 工具 (encryption, cookie-normalizer)
│   │   │   └── websocket/            # WebSocket 处理
│   │   └── prisma/schema.prisma       # 数据库 schema
│   └── web/              # 前端 (Vue 3 + Vite, port 50001)
│       ├── src/
│       │   ├── views/                 # 页面 (Dashboard, Contents, Accounts, Publish等)
│       │   ├── api/                  # API 客户端
│       │   ├── stores/               # Pinia 状态管理
│       │   └── websocket/            # WebSocket 客户端
│       └── vite.config.ts            # Vite 配置（代理 /api 到 50000）
├── content/              # 内容文件存储
│   ├── inbox/           # 待审核内容（文件监听目录）
│   ├── approved/        # 已通过
│   └── published/       # 已发布
├── docker/              # Docker Compose 配置
└── docs/               # 文档（中文）
```

## 核心架构

### 内容流转

旧流程:
content/inbox/ → file-watcher → content.service → BullMQ → Playwright publishers

新流程:
content/inbox/ → file-watcher → content.service → BullMQ → GatewayService → OpenClaw Gateway webhook
                                                                                ↓
                                                                        ht-om agent (xhs-mcp skill)
                                                                                ↓
POST /api/webhook/:platform/publish-result ← 回调通知 → 更新 PublishLog 和 Content 状态

### 单例模式

- `BrowserPool` - Playwright 浏览器池单例 (`apps/server/src/config/playwright.ts`)
- `Prisma Client` - 数据库客户端单例 (`apps/server/src/config/prisma.ts`)
- `PublishQueue` - BullMQ 队列单例 (`apps/server/src/queues/publish-queue.ts`)

### Cookie 安全

- AES-256-GCM 加密存储
- PBKDF2 密钥派生
- 每次加密使用独立 Salt + IV + AuthTag

## 关键配置

环境变量见 `.env`（由 `.env.example` 复制）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 50000 | 服务端口 |
| `DATABASE_URL` | localhost:54321 | PostgreSQL |
| `REDIS_URL` | localhost:16379 | Redis |
| `PLAYWRIGHT_HEADLESS` | true | 浏览器模式 |
| `CONTENT_DIR` | ./content | 内容根目录 |

### Gateway 发布模式环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENCLAW_GATEWAY_URL` | http://localhost:18789 | OpenClaw Gateway 地址 |
| `CPP_TO_GATEWAY_TOKEN` | - | 调用 Gateway 的认证 token |
| `CPP_FROM_GATEWAY_TOKEN` | - | Gateway 回调认证 token |
| `PUBLISH_MODE` | gateway | 发布模式: gateway 或 local |
| `API_BASE_URL` | http://localhost:50000 | 本服务暴露地址 (用于 Gateway 回调) |

### 平台名称映射

| 内部平台名 | Gateway Webhook 路径 |
|-----------|---------------------|
| xiaohongshu | xhs |
| weibo | weibo |
| douyin | douyin |
| bilibili | bilibili |
| wechat | wechat |

## 扩展新平台

1. 在 `apps/server/src/publishers/` 创建 `<platform>.ts` 发布器类
2. 在 `apps/server/src/queues/publish-queue.ts` 注册发布器
3. 在 `apps/server/src/config/` 添加平台选择器配置
4. 更新前端 `Accounts.vue` 添加平台选项

参考 `apps/server/src/publishers/xiaohongshu.ts` 已有实现。

## API 路由

后端运行在 `http://localhost:50000`，前端通过 Vite 代理访问：

- `GET /api/contents` - 内容列表
- `POST /api/contents` - 创建内容
- `GET /api/accounts` - 账号列表
- `POST /api/accounts/:id/cookies` - 导入 Cookie
- `GET /api/accounts/:id/cookies/verify` - 验证 Cookie
- `POST /api/publish` - 发布内容
- `WS /ws` - WebSocket 实时更新
