# 生产环境部署指南

**版本**: 1.0  
**更新日期**: 2025-12-19  
**维护者**: HT-Fish 🐟

---

## 📋 目录

1. [环境要求](#环境要求)
2. [Docker 部署（推荐）](#docker-部署推荐)
3. [本地部署](#本地部署)
4. [环境变量配置](#环境变量配置)
5. [Cookie 导入](#cookie-导入)
6. [故障排除](#故障排除)

---

## 环境要求

### 硬件要求
- **CPU**: 2 核以上（推荐 4 核）
- **内存**: 4GB 以上（推荐 8GB）
- **磁盘**: 20GB 可用空间
- **网络**: 稳定的互联网连接

### 软件要求
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Node.js**: 18+（本地开发）
- **Bun**: 1.0+（推荐）

---

## Docker 部署（推荐）

### 1. 克隆项目

```bash
git clone <repository-url>
cd content-publish-platform
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

**必要配置**:
```env
# 数据库
POSTGRES_PASSWORD=your-secure-password
DATABASE_URL=postgresql://postgres:your-secure-password@postgres:5432/content-publish

# Redis
REDIS_URL=redis://redis:6379/0

# Cookie 加密（生产环境必须修改！）
COOKIE_ENCRYPTION_KEY=your-32-character-secret-key!!
COOKIE_ENCRYPTION_SALT=your-random-salt-string

# 服务器
NODE_ENV=production
PLAYWRIGHT_HEADLESS=true
```

### 3. 启动服务

```bash
# 启动所有服务（后台运行）
docker compose -f docker/docker-compose.yml up -d

# 查看日志
docker compose -f docker/docker-compose.yml logs -f

# 检查服务状态
docker compose -f docker/docker-compose.yml ps
```

### 4. 访问服务

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 | http://localhost:8080 | Web 界面 |
| 后端 API | http://localhost:3000 | REST API |
| 健康检查 | http://localhost:3000/health | 健康状态 |

### 5. 停止服务

```bash
# 停止所有服务
docker compose -f docker/docker-compose.yml down

# 停止并删除数据卷（谨慎使用！）
docker compose -f docker/docker-compose.yml down -v
```

---

## 本地部署

### 1. 安装依赖

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 安装项目依赖
bun install
```

### 2. 安装 Playwright 浏览器

```bash
cd apps/server
bunx playwright install chromium
```

### 3. 配置环境变量

```bash
cp .env.example .env
vim .env
```

### 4. 启动数据库和 Redis

```bash
# 使用 Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:18
docker run -d -p 6379:6379 redis:7-alpine
```

### 5. 数据库迁移

```bash
cd apps/server
bun run db:push
bun run db:generate
```

### 6. 启动服务

```bash
# 启动后端
bun run dev:server

# 启动前端（新终端）
bun run dev:web
```

---

## 环境变量配置

### 完整环境变量列表

```env
# ================================
# 数据库配置
# ================================
POSTGRES_PASSWORD=your-password
DATABASE_URL=postgresql://postgres:password@localhost:5432/content-publish

# ================================
# Redis 配置
# ================================
REDIS_URL=redis://localhost:6379/0

# ================================
# Cookie 加密配置（生产环境必须修改！）
# ================================
COOKIE_ENCRYPTION_KEY=your-32-character-secret-key!!
COOKIE_ENCRYPTION_SALT=your-random-salt-string

# ================================
# 服务器配置
# ================================
PORT=3000
NODE_ENV=development  # production

# ================================
# WebSocket 配置
# ================================
WS_HEARTBEAT_INTERVAL=30000
AUTH_TIMEOUT=900000

# ================================
# 内容目录
# ================================
CONTENT_DIR=./content

# ================================
# 日志级别
# ================================
LOG_LEVEL=info  # debug, info, warn, error

# ================================
# Playwright 配置
# ================================
PLAYWRIGHT_HEADLESS=true  # 生产环境必须为 true
PLAYWRIGHT_SLOW_MO=100
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright  # Docker 中使用
```

### 安全建议

1. **COOKIE_ENCRYPTION_KEY**: 使用 32 字符以上的随机字符串
2. **POSTGRES_PASSWORD**: 使用强密码（大小写 + 数字 + 符号）
3. **NODE_ENV**: 生产环境设置为 `production`
4. **PLAYWRIGHT_HEADLESS**: 生产环境设置为 `true`

---

## Cookie 导入

### 方法 1：通过 API 导入

```bash
# 导入 Cookie
curl -X POST http://localhost:3000/api/accounts/{accountId}/cookies \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [{"name": "a1", "value": "token_value", "domain": ".xiaohongshu.com"}],
    "password": "your-encryption-key"
  }'
```

### 方法 2：通过 Web 界面

1. 访问 http://localhost:8080/accounts
2. 选择账号
3. 点击"导入 Cookie"
4. 粘贴 Cookie JSON
5. 点击"验证"

### Cookie 格式

从浏览器开发者工具导出：

```json
[
  {
    "name": "a1",
    "value": "your-token-value",
    "domain": ".xiaohongshu.com",
    "path": "/",
    "expires": 1709251200,
    "httpOnly": true,
    "secure": true
  }
]
```

**详细指南**: 参考 [COOKIE-IMPORT.md](./COOKIE-IMPORT.md)

---

## 故障排除

### 1. Playwright 浏览器启动失败

**错误**: `Failed to launch browser`

**解决**:
```bash
# Docker 中确保使用 Playwright 官方镜像
# 本地安装浏览器依赖
bunx playwright install-deps
bunx playwright install chromium
```

### 2. 数据库连接失败

**错误**: `ECONNREFUSED` 或 `Authentication failed`

**解决**:
```bash
# 检查数据库是否运行
docker ps | grep postgres

# 检查环境变量
echo $DATABASE_URL

# 测试连接
psql -h localhost -p 5432 -U postgres -d content-publish
```

### 3. Redis 连接失败

**错误**: `ECONNREFUSED 127.0.0.1:6379`

**解决**:
```bash
# 启动 Redis
docker run -d -p 6379:6379 redis:7-alpine

# 或 Docker Compose
docker compose up -d redis
```

### 4. Cookie 解密失败

**错误**: `Decryption failed`

**解决**:
- 确认 `COOKIE_ENCRYPTION_KEY` 一致
- 重新导入 Cookie
- 检查加密密码是否正确

### 5. 端口被占用

**错误**: `EADDRINUSE`

**解决**:
```bash
# 查找占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>

# 或修改端口
PORT=3001
```

---

## 监控和日志

### 查看日志

```bash
# Docker 日志
docker compose logs -f backend
docker compose logs -f frontend

# 按时间过滤
docker compose logs --since="2024-01-01" backend
```

### 健康检查

```bash
# API 健康检查
curl http://localhost:3000/health

# 数据库连接
docker compose exec backend bun run prisma db pull
```

### 性能监控

```bash
# Docker 资源使用
docker stats

# 容器状态
docker compose ps
```

---

## 备份和恢复

### 数据库备份

```bash
# 备份
docker compose exec postgres pg_dump -U postgres content-publish > backup.sql

# 恢复
docker compose exec -T postgres psql -U postgres content-publish < backup.sql
```

### 内容文件备份

```bash
# 备份内容目录
tar -czf content-backup.tar.gz ./content

# 恢复
tar -xzf content-backup.tar.gz
```

---

## 更新和升级

### 更新代码

```bash
git pull
docker compose down
docker compose build
docker compose up -d
```

### 数据库迁移

```bash
docker compose exec backend bun run db:migrate
```

---

## 安全建议

1. **生产环境**:
   - 使用 HTTPS
   - 设置强密码
   - 定期更新依赖
   - 限制 API 访问

2. **Cookie 安全**:
   - 使用加密存储
   - 定期更新 Cookie
   - 限制访问权限

3. **网络安全**:
   - 使用防火墙
   - 限制端口访问
   - 使用反向代理（Nginx）

---

**文档维护者**: HT-Fish 🐟  
**最后更新**: 2025-12-19
