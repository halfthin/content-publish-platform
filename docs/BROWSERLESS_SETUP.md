# Browserless 集成配置指南

## 📋 概述

本项目已集成 Browserless 服务，用于远程运行 Playwright 浏览器自动化。相比本地浏览器，Browserless 提供：

- ✅ 容器化部署，无需在主机安装浏览器
- ✅ 资源隔离，避免影响其他服务
- ✅ 支持并发连接
- ✅ 统一的浏览器版本管理

---

## 🔧 配置说明

### 1. 环境变量配置

#### 开发环境 (`apps/server/.env`)

```env
# Browserless 服务地址
# Docker 容器内访问（推荐）
BROWSERLESS_URL=ws://browserless:3000/playwright

# 本地开发时（从主机访问）
# BROWSERLESS_URL=ws://localhost:6666/playwright
```

#### Docker 环境 (`docker/.env`)

```env
# Browserless 服务地址
BROWSERLESS_URL=ws://browserless:3000/playwright
```

### 2. Docker 网络配置

在 `docker/docker-compose.yml` 中，server 服务已配置连接到 `web_net` 网络：

```yaml
services:
  server:
    networks:
      - web_net

networks:
  web_net:
    external: true
```

**注意**: 确保 Browserless 容器也连接到 `web_net` 网络，以便服务间通信。

---

## 🚀 使用示例

### 基本连接

```typescript
import { chromium } from 'playwright';

const browser = await chromium.connect({
  wsEndpoint: process.env.BROWSERLESS_URL || 'ws://localhost:6666/playwright'
});

const page = await browser.newPage();
await page.goto('https://example.com');
// ... 执行自动化操作

await browser.close();
```

### 使用 BrowserPool（推荐）

项目已封装 BrowserPool 类，自动处理 Browserless 连接：

```typescript
import { browserPool } from './config/playwright';

// 初始化（自动检测 BROWSERLESS_URL）
await browserPool.initialize();

// 创建上下文
const context = await browserPool.createContext('account-1');
const page = await context.newPage();

// 使用完成后关闭
await browserPool.close();
```

---

## ⚠️ 版本兼容性

### Playwright 版本匹配

**重要**: Browserless 服务器的 Playwright 版本必须与客户端版本匹配！

当前项目配置：
- **客户端 Playwright 版本**: v1.58.2
- **Browserless 要求版本**: v1.58.x

#### 检查版本

```bash
# 查看项目 Playwright 版本
cd apps/server
cat package.json | grep playwright

# 查看 Browserless 版本
docker logs browserless | grep -i version
```

#### 版本不匹配解决

如果遇到类似错误：
```
Playwright version mismatch:
  - server version: v1.41
  - client version: v1.58
```

**解决方案 1**: 升级 Browserless（推荐）
```bash
docker pull browserless/chrome:latest
# 或使用指定版本
docker pull browserless/chrome:v1.58.0
```

**解决方案 2**: 降级项目 Playwright
```bash
cd apps/server
bun install playwright@1.41.0
```

---

## 🐛 故障排查

### 1. 连接失败

**症状**: `WebSocket error: connect ECONNREFUSED`

**检查项**:
- [ ] Browserless 容器是否运行：`docker ps | grep browserless`
- [ ] 端口是否正确映射：`docker port browserless`
- [ ] 网络是否连通：`docker network inspect web_net`
- [ ] 环境变量是否正确：`echo $BROWSERLESS_URL`

### 2. 版本不匹配

**症状**: `Playwright version mismatch`

**解决方案**: 参考上方"版本兼容性"章节

### 3. 权限问题

**症状**: `Permission denied` 或无法启动浏览器

**解决方案**:
- 确保 Browserless 容器以正确权限运行
- 检查 Docker 网络配置
- 验证 `web_net` 网络已创建

### 4. 超时问题

**症状**: 连接或页面加载超时

**解决方案**:
```env
# 增加超时时间
PLAYWRIGHT_TIMEOUT=120000
```

---

## 📊 监控与调试

### 查看 Browserless 日志

```bash
docker logs -f browserless
```

### 查看连接统计

Browserless 提供内置监控面板：
- 访问：`http://localhost:6666`
- 查看活跃连接、资源使用等

### 应用日志

```bash
# 查看 server 日志
docker logs content-publish-server | grep -i browser
```

---

## 🔗 相关资源

- [Browserless 官方文档](https://www.browserless.io/docs)
- [Playwright 远程浏览器指南](https://playwright.dev/docs/browsers#browser-as-a-service)
- [Browserless Docker Hub](https://hub.docker.com/r/browserless/chrome)

---

## 📝 更新记录

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-02 | v1.0 | 初始集成 Browserless 服务 |
