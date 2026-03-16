# 小红书发布功能快速启动指南

## 📋 前提条件

1. **PostgreSQL 数据库** - 运行在 `host.docker.internal:54321`
2. **Redis 服务** - 运行在 `host.docker.internal:16378`
3. **Node.js/Bun** - 已安装 Bun 运行时
4. **浏览器** - Chrome/Edge（用于 Playwright）

---

## 🚀 快速启动

### 1. 安装依赖

```bash
cd /home/halfthin/dev/content-publish-platform
bun install
```

### 2. 配置环境变量

确保 `.env` 文件配置正确：

```bash
# 数据库连接
DATABASE_URL="postgresql://postgres:Bing!15706668163@host.docker.internal:54321/content-publish"

# Redis 连接
REDIS_URL="redis://halfthin:redis@host.docker.internal:16378/0"

# Cookie 加密（生产环境请修改）
COOKIE_ENCRYPTION_KEY="your-32-char-secret-key-here!!!"

# 服务器端口
PORT=3000

# Playwright 配置
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_SLOW_MO=100
```

### 3. 数据库迁移

```bash
cd apps/server
bunx prisma migrate dev
bunx prisma generate
```

### 4. 启动后端服务

```bash
# 方式一：开发模式（热重载）
cd /home/halfthin/dev/content-publish-platform/apps/server
bun run dev

# 方式二：生产模式
bun run start
```

后端服务将运行在：`http://localhost:3000`

### 5. 启动前端服务

```bash
# 新终端
cd /home/halfthin/dev/content-publish-platform/apps/web
bun run dev
```

前端服务将运行在：`http://localhost:50000`

---

## 🍪 配置小红书账号

### 步骤 1: 添加账号

1. 访问 http://localhost:50000/accounts
2. 点击"+ 添加账号"
3. 填写信息：
   - 平台：选择"小红书"
   - 名称：例如"小红书账号 A"
   - 用户名：（可选）
   - 备注：（可选）
4. 点击确定

### 步骤 2: 获取 Cookie

**方法一：使用浏览器扩展（推荐）**

1. 安装 Chrome 扩展：EditThisCookie 或 Cookie Editor
2. 访问 https://www.xiaohongshu.com 并登录
3. 点击扩展图标，导出 Cookie 为 JSON
4. 复制 JSON 内容

**方法二：手动复制**

1. 访问 https://www.xiaohongshu.com 并登录
2. 按 F12 打开开发者工具
3. 切换到 Application → Storage → Cookies
4. 选择所有 Cookie，复制为 JSON

### 步骤 3: 配置 Cookie

1. 访问 http://localhost:50000/cookie-config
2. 选择刚才创建的账号
3. 粘贴 Cookie JSON 到输入框
4. （可选）设置加密密码
5. 点击"测试连接"验证 Cookie 有效性
6. 点击"保存配置"

---

## 📝 创建和发布内容

### 步骤 1: 准备内容文件

在 `content/inbox/` 目录下创建内容文件夹：

```bash
content/inbox/test-content-001/
├── content.md          # 文案
├── image1.jpg          # 图片 1
├── image2.jpg          # 图片 2
└── metadata.json       # 元数据（可选）
```

**content.md 示例**:
```markdown
---
title: 测试内容标题
tags:
  - 测试
  - 小红书
  - 自动化
category: 日常
---

这是测试内容的正文部分...
```

### 步骤 2: 扫描收件箱

1. 访问 http://localhost:50000/contents
2. 点击"📥 扫描收件箱"按钮
3. 内容将出现在列表中，状态为"待审核"

### 步骤 3: 审核内容

1. 在内容列表中找到刚扫描的内容
2. 点击"通过"按钮
3. 填写审核人和备注（可选）
4. 点击确认

### 步骤 4: 发布内容

**方式一：通过内容详情页**

1. 点击内容标题进入详情页
2. 点击"发布"按钮
3. 选择平台和账号
4. 点击确认发布

**方式二：通过 API**

```bash
curl -X POST http://localhost:3000/api/contents/{content-id}/publish \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "xiaohongshu",
    "accountId": "account-uuid"
  }'
```

---

## 📊 查看发布状态

### 发布状态页面

访问 http://localhost:50000/publish-status

**功能**:
- 📊 统计卡片：今日/本周/本月发布数量
- ✅ 成功/失败统计
- 📋 发布日志表格
- 🔄 失败重试按钮

### 发布流程状态

```
QUEUED → PUBLISHING → SUCCESS/FAILED
```

**状态说明**:
- `QUEUED`: 已加入队列，等待处理
- `PUBLISHING`: 正在发布中
- `SUCCESS`: 发布成功
- `FAILED`: 发布失败（可重试）

---

## 🐛 故障排查

### 问题 1: 数据库连接失败

**错误**: `Can't reach database server`

**解决**:
```bash
# 检查数据库是否运行
docker ps | grep postgres

# 或检查本地 PostgreSQL 服务
systemctl status postgresql

# 更新 .env 中的 DATABASE_URL
```

### 问题 2: Redis 连接失败

**错误**: `Redis error`

**解决**:
```bash
# 检查 Redis 是否运行
docker ps | grep redis

# 测试 Redis 连接
redis-cli -h host.docker.internal -p 16378 ping
```

### 问题 3: Cookie 加载失败

**错误**: `Cookie 加载失败，可能已过期`

**解决**:
1. 重新获取 Cookie（小红书 Cookie 有效期较短）
2. 确保 Cookie 格式正确（JSON 数组）
3. 检查加密密码是否正确

### 问题 4: 发布失败

**错误**: `发布失败 - 具体错误信息`

**解决**:
1. 查看发布日志中的错误信息
2. 检查账号登录状态
3. 检查内容格式是否符合平台要求
4. 点击"重试"按钮重新发布

---

## 🔧 开发调试

### 查看日志

```bash
# 后端日志
tail -f apps/server/logs/app.log

# 浏览器控制台日志
# 访问 http://localhost:50000 打开开发者工具
```

### 调试模式

```bash
# 启用详细日志
export LOG_LEVEL=debug
bun run dev
```

### 测试 Cookie

```bash
# 测试账号 Cookie
curl http://localhost:3000/api/accounts/{account-id}/cookies/verify \
  -d '{"password": "your-password"}'
```

---

## 📚 API 文档

### 内容管理

- `GET /api/contents` - 获取内容列表
- `GET /api/contents/:id` - 获取内容详情
- `POST /api/contents/:id/approve` - 审核通过
- `POST /api/contents/:id/reject` - 审核拒绝
- `POST /api/contents/:id/publish` - 发布内容

### 账号管理

- `GET /api/accounts` - 获取账号列表
- `POST /api/accounts` - 创建账号
- `PUT /api/accounts/:id` - 更新账号
- `POST /api/accounts/:id/cookies` - 保存 Cookie
- `GET /api/accounts/:id/cookies/verify` - 验证 Cookie

### 发布状态

- `GET /api/publish-status/content/:id` - 获取内容发布状态
- `GET /api/publish-status/account/:id` - 获取账号发布历史
- `GET /api/publish-status/stats` - 获取发布统计
- `POST /api/publish-status/:id/retry` - 重试失败发布

---

## 🎯 最佳实践

### 1. Cookie 管理

- 定期更新 Cookie（建议每周）
- 为不同账号设置不同的加密密码
- 不要分享 Cookie 文件

### 2. 内容审核

- 所有内容必须审核后才能发布
- 添加审核备注便于追溯
- 批量审核提高效率

### 3. 发布策略

- 避免短时间内大量发布
- 监控账号健康度
- 失败任务及时重试

### 4. 错误处理

- 查看错误日志定位问题
- 使用重试机制处理临时错误
- 定期清理失败任务

---

## 📞 技术支持

遇到问题？

1. 查看日志文件
2. 检查数据库和 Redis 连接
3. 验证 Cookie 有效性
4. 查阅文档和错误码

---

**最后更新**: 2026-03-02  
**版本**: 1.0.0
