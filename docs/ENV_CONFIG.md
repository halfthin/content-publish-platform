# Content-Publish-Platform 环境配置

**最后更新**: 2026-03-02  
**维护者**: HT-PM 📋

---

## 🏗️ 架构说明

### 外部服务（独立部署，已运行）
项目**不管理**以下服务，它们由系统统一提供：

| 服务 | 端口 | 连接信息 |
|------|------|----------|
| **PostgreSQL** | 54321 | `postgresql://postgres:密码@host.docker.internal:54321/content-publish` |
| **Redis** | 16378 | `redis://halfthin:密码@host.docker.internal:16378/0` |

### 项目容器（docker-compose.yml 管理）
项目只负责以下服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| **Server** | 3000 | 后端 API + Playwright 浏览器自动化 |
| **Web** | 8080 | 前端 Vue 3 + Element Plus |

---

## 📁 配置文件

### .env（开发环境）
```env
# 数据库配置（外部 PostgreSQL）
POSTGRES_PASSWORD=***
DATABASE_URL="postgresql://postgres:***@host.docker.internal:54321/content-publish"

# Redis 配置（外部 Redis）
REDIS_URL="redis://halfthin:***@host.docker.internal:16378/0"

# Cookie 加密配置
COOKIE_ENCRYPTION_KEY="your-32-char-secret-key-here!!!"
COOKIE_ENCRYPTION_SALT="random-salt-string"

# Playwright 配置（本地开发可以用 headed 模式）
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_SLOW_MO=100
```

### docker/.env（Docker Compose 环境变量）
```env
POSTGRES_PASSWORD=***
COOKIE_ENCRYPTION_KEY=***
COOKIE_ENCRYPTION_SALT=***
```

### docker/docker-compose.yml
```yaml
services:
  server:
    build:
      context: ..
      dockerfile: docker/Dockerfile.server
    container_name: content-publish-server
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - COOKIE_ENCRYPTION_KEY=${COOKIE_ENCRYPTION_KEY}
      - COOKIE_ENCRYPTION_SALT=${COOKIE_ENCRYPTION_SALT}
    ports:
      - "3000:3000"
    volumes:
      - ../content:/app/content
    extra_hosts:
      - "host.docker.internal:host-gateway"

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
    container_name: content-publish-web
    ports:
      - "8080:80"
    depends_on:
      - server
```

---

## 🐳 Docker 网络说明

### 访问外部服务
容器内访问宿主机服务使用 `host.docker.internal`：
```bash
# Docker Compose 中配置
extra_hosts:
  - "host.docker.internal:host-gateway"
```

### 端口映射
| 容器端口 | 宿主机端口 | 用途 |
|----------|------------|------|
| 3000 | 3000 | 后端 API |
| 8080 | 8080 | 前端 Web |

---

## 🔧 开发流程

### 启动项目
```bash
cd /home/halfthin/dev/content-publish-platform
docker compose -f docker/docker-compose.yml up -d --build
```

### 查看日志
```bash
docker compose -f docker/docker-compose.yml logs -f server
docker compose -f docker/docker-compose.yml logs -f web
```

### 进入容器调试
```bash
docker compose -f docker/docker-compose.yml exec server bash
```

### 停止项目
```bash
docker compose -f docker/docker-compose.yml down
```

---

## 📊 服务依赖关系

```
┌─────────────────────────────────────────────────┐
│              外部服务（独立部署）                 │
│  ┌──────────────┐     ┌──────────────┐          │
│  │  PostgreSQL  │     │    Redis     │          │
│  │   :54321     │     │   :16378     │          │
│  └──────────────┘     └──────────────┘          │
│         ↓                       ↓                │
│         └───────────┬───────────┘                │
│                     ↓                            │
│         ┌───────────────────────┐                │
│         │   项目容器（Docker）    │                │
│         │  ┌─────────────────┐  │                │
│         │  │     Server      │  │                │
│         │  │    :3000        │  │                │
│         │  │  + Playwright   │  │                │
│         │  └────────┬────────┘  │                │
│         │           ↓           │                │
│         │  ┌─────────────────┐  │                │
│         │  │      Web        │  │                │
│         │  │    :8080        │  │                │
│         │  └─────────────────┘  │                │
│         └───────────────────────┘                │
└─────────────────────────────────────────────────┘
```

---

## ⚠️ 重要注意事项

1. **不要修改外部服务配置** - PostgreSQL 和 Redis 由系统统一管理
2. **Docker 网络配置** - 必须添加 `extra_hosts` 才能访问宿主机服务
3. **环境变量分离** - 开发环境用 `.env`，Docker 用 `docker/.env`
4. **Playwright 模式** - Docker 内必须使用 `headless=true`

---

## 📝 配置变更记录

| 日期 | 变更内容 | 负责人 |
|------|----------|--------|
| 2026-03-02 | 改为使用外部 PostgreSQL/Redis，移除项目内的数据库服务 | HT-Fish |

---

*此配置由 HT Action Team 维护，修改前请咨询 HT-PM*
