# 快速启动指南 - 账号管理与 Cookie 配置

## 🚀 当前状态

- ✅ 前端服务已启动：http://localhost:50000
- ⚠️ 后端服务需要 Redis 支持

---

## 📝 立即使用（前端）

1. **访问前端界面**
   ```
   http://localhost:50000
   ```

2. **导航到账号管理**
   - 点击左侧菜单 "👥 账号管理"

3. **添加第一个账号**
   - 点击 "+ 添加账号"
   - 选择平台：小红书
   - 输入账号名称：例如 "我的小红书账号"
   - 点击确定

4. **配置 Cookie**
   - 点击左侧菜单 "🍪 Cookie 配置"
   - 选择刚才创建的账号
   - 按照页面提示配置 Cookie

---

## 🔧 启动完整服务（需要 Redis）

### 方法一：使用 Docker（推荐）

```bash
cd /home/halfthin/dev/content-publish-platform

# 启动所有服务（需要 Docker 权限）
docker compose -f docker/docker-compose.yml up -d

# 查看日志
docker compose -f docker/docker-compose.yml logs -f

# 访问
# 前端：http://localhost:50000
# 后端：http://localhost:50001
```

### 方法二：本地开发模式

```bash
cd /home/halfthin/dev/content-publish-platform

# 1. 确保 Redis 和 PostgreSQL 运行
# Redis: redis://host.docker.internal:16378/0
# PostgreSQL: postgresql://postgres:***@host.docker.internal:54321/content-publish

# 2. 安装依赖（如果还没安装）
bun install

# 3. 生成 Prisma 客户端
bun run db:generate

# 4. 启动开发服务器（前后端一起）
bun run dev

# 或者分别启动
bun run dev:server  # 后端
bun run dev:web     # 前端
```

---

## 🍪 获取小红书 Cookie

### 方法一：使用浏览器扩展（推荐）

1. **安装扩展**
   - Chrome/Edge: 安装 "EditThisCookie" 或 "Cookie Editor"

2. **登录小红书**
   - 访问 https://www.xiaohongshu.com
   - 使用手机扫码登录

3. **导出 Cookie**
   - 点击浏览器工具栏的 Cookie 扩展图标
   - 点击"导出"按钮
   - 选择 JSON 格式
   - 复制内容

### 方法二：手动复制

1. **打开开发者工具**
   - 访问 https://www.xiaohongshu.com
   - 按 F12 打开开发者工具

2. **找到 Cookie**
   - 切换到 "Application" 或 "存储" 标签
   - 展开 "Cookies"
   - 选择 "https://www.xiaohongshu.com"

3. **复制 Cookie**
   - 手动复制所有 Cookie 名称和值
   - 格式化为 JSON 数组：
   ```json
   [
     {"name": "SUB", "value": "xxx", "domain": ".xiaohongshu.com"},
     {"name": "SESSION", "value": "yyy", "domain": ".xiaohongshu.com"}
   ]
   ```

---

## ✅ 验证 Cookie

1. **访问 Cookie 配置页面**
   ```
   http://localhost:50000/cookie-config
   ```

2. **选择账号**
   - 从下拉列表选择账号

3. **粘贴 Cookie**
   - 将 JSON 格式的 Cookie 粘贴到输入框

4. **测试连接**
   - 点击 "🔍 测试连接"
   - 等待验证结果
   - 显示 "✅ Cookie 验证成功" 表示可用

5. **保存配置**
   - 点击 "💾 保存配置"

---

## 🐛 常见问题

### 1. 前端无法访问
```bash
# 检查前端服务是否运行
ps aux | grep vite

# 重启前端
cd /home/halfthin/dev/content-publish-platform/apps/web
bun run dev --host 0.0.0.0 --port 50000
```

### 2. 后端连接 Redis 失败
```bash
# 检查 Redis 是否运行
ps aux | grep redis

# 修改 .env 中的 REDIS_URL
# 使用正确的 Redis 地址
```

### 3. Cookie 验证失败
- 确保 Cookie 是最新的（重新登录小红书）
- 确保 Cookie 包含所有必要的字段（name, value, domain）
- 检查 Cookie 格式是否为有效的 JSON 数组

### 4. 数据库连接失败
```bash
# 检查 PostgreSQL 是否运行
# 验证 .env 中的 DATABASE_URL 配置
# 确保数据库用户有足够权限
```

---

## 📞 技术支持

如有问题，请联系 HT 行动团队 📋

---

**最后更新**: 2026-03-02 21:25
