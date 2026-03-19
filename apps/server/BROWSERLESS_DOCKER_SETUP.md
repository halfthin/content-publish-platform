# 🔧 Browserless Docker 配置指南

**创建时间**: 2026-03-06 23:15 CST  
**创建人**: HT-Fish 🐟

---

## 📋 当前状态

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Docker 安装 | ✅ 已安装 | Docker 28.3.3 |
| Docker 权限 | ❌ 无权限 | 需要添加到 docker 组或使用 sudo |
| Browserless 容器 | ❌ 未运行 | 权限问题无法启动 |
| 6666 端口 | ⚠️ 占用 | 有其他服务（非 Browserless） |

---

## 🚀 启动 Browserless 容器

### 方法 1: 使用 sudo（推荐临时使用）

```bash
sudo docker run -d \
  --name browserless \
  -p 6666:3000 \
  -e "CONNECTION_TIMEOUT=-1" \
  -e "ENABLE_DEBUGGER=false" \
  browserless/chrome:latest
```

### 方法 2: 添加用户到 docker 组（推荐长期使用）

```bash
# 添加当前用户到 docker 组
sudo usermod -aG docker $USER

# 重新登录或执行
newgrp docker

# 验证
docker ps
```

### 方法 3: 使用本地浏览器（当前方案）

**无需 Browserless**，直接使用本地 Chromium：

```bash
# .env 中注释 BROWSERLESS_URL
# BROWSERLESS_URL=ws://localhost:6666

# 代码会自动使用本地浏览器
```

---

## ✅ 验证 Browserless 运行

```bash
# 检查容器
docker ps | grep browserless

# 查看日志
docker logs browserless

# 测试连接
curl http://localhost:6666

# WebSocket 测试
wscat -c ws://localhost:6666/playwright
```

---

## 🔧 更新 .env 配置

```bash
# 使用 Browserless Docker
BROWSERLESS_URL=ws://localhost:6666

# 或使用本地浏览器（注释掉）
# BROWSERLESS_URL=ws://localhost:6666
```

---

## 📊 当前推荐方案

**方案 A: 本地浏览器 (当前使用)**

**优点**:
- ✅ 无需 Docker 权限
- ✅ 调试直观
- ✅ 适合开发环境

**缺点**:
- ⚠️ 性能略低于 Browserless
- ⚠️ 需要安装 Chromium

**方案 B: Browserless Docker (推荐生产环境)**

**优点**:
- ✅ 性能更好
- ✅ 支持并发
- ✅ 易于部署

**缺点**:
- ⚠️ 需要 Docker 权限
- ⚠️ 配置复杂

---

## 🎯 下一步行动

### 立即执行（如需 Browserless）

```bash
# 1. 解决 Docker 权限
sudo usermod -aG docker $USER
newgrp docker

# 2. 启动 Browserless
docker run -d --name browserless -p 6666:3000 -e "CONNECTION_TIMEOUT=-1" browserless/chrome:latest

# 3. 验证
docker ps | grep browserless
curl http://localhost:6666
```

### 或使用本地浏览器（当前方案）

```bash
# 无需额外配置
# 代码会自动使用本地浏览器
bun test
```

---

**更新时间**: 2026-03-06 23:15 CST  
**状态**: ⚠️ Docker 权限问题，建议使用本地浏览器方案
