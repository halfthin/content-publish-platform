# 微博 Cookie 配置指南

本文档说明如何配置微博账号的 Cookie，以便自动化发布内容。

---

## 📋 目录

1. [为什么需要 Cookie](#为什么需要-cookie)
2. [获取 Cookie 的方法](#获取-cookie-的方法)
3. [配置 Cookie 到系统](#配置-cookie-到系统)
4. [验证 Cookie 是否有效](#验证-cookie-是否有效)
5. [常见问题](#常见问题)

---

## 为什么需要 Cookie

微博平台需要用户登录才能发布内容。通过保存登录后的 Cookie，系统可以：
- 自动保持登录状态
- 无需每次发布都重新登录
- 支持多账号管理

---

## 获取 Cookie 的方法

### 方法一：使用浏览器开发者工具（推荐）

#### 步骤 1: 登录微博

1. 打开 Chrome/Edge 浏览器
2. 访问 [https://weibo.com](https://weibo.com)
3. 使用账号密码或扫码登录

#### 步骤 2: 打开开发者工具

1. 按 `F12` 或右键点击页面 → "检查"
2. 切换到 **Application**（应用）标签
3. 左侧菜单展开 **Cookies** → 选择 `https://weibo.com`

#### 步骤 3: 导出 Cookie

**Chrome/Edge:**
1. 右键点击 Cookie 列表
2. 选择 **Export → Export JSON**
3. 保存为 `weibo-cookies.json`

**或者手动复制:**
1. 全选 Cookie 列表（Ctrl+A）
2. 复制（Ctrl+C）
3. 粘贴到文本编辑器

**需要的关键 Cookie:**
- `SUB` - 登录凭证（最重要）
- `SUBP` - 子凭证
- `_s_tentry` - 会话入口
- `ULV` - 用户登录验证
- `SSOLoginState` - 登录状态

---

### 方法二：使用 Playwright 脚本自动获取

创建一个脚本，手动登录后保存 Cookie：

```typescript
// save-weibo-cookies.ts
import { chromium } from 'playwright';
import * as fs from 'fs';

async function saveCookies() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('请在打开的浏览器中登录微博...');
  await page.goto('https://weibo.com');
  
  // 等待用户手动登录（最长 5 分钟）
  console.log('等待登录完成...');
  await page.waitForSelector('.woo-avatar-img', { timeout: 300000 });
  console.log('检测到已登录！');
  
  // 获取并保存 Cookie
  const cookies = await context.cookies();
  fs.writeFileSync('weibo-cookies.json', JSON.stringify(cookies, null, 2));
  console.log(`Cookie 已保存，共 ${cookies.length} 条`);
  
  await browser.close();
}

saveCookies().catch(console.error);
```

运行脚本：
```bash
bun save-weibo-cookies.ts
```

---

## 配置 Cookie 到系统

### 方式 1: 通过环境变量（开发环境）

```bash
# .env 文件
WEIBO_COOKIES='[{"name":"SUB","value":"xxx","domain":".weibo.com",...}]'
WEIBO_ENCRYPTION_KEY="your-32-char-secret-key"
```

### 方式 2: 通过数据库（生产环境）

在账号管理界面添加微博账号，粘贴 Cookie JSON。

### 方式 3: 使用加密存储（推荐）

系统会自动加密存储 Cookie：

```typescript
import { encryptCookies } from './utils/encryption';

const encrypted = await encryptCookies(cookies, process.env.COOKIE_ENCRYPTION_KEY!);
// 保存 encrypted 到数据库
```

---

## 验证 Cookie 是否有效

### 使用测试脚本

```bash
cd /home/halfthin/dev/content-publish-platform/apps/server
bun test-weibo-publisher.ts
```

**预期输出:**
```
🧪 测试微博发布器...

🌐 初始化浏览器池（本地无头模式）...
✅ 浏览器池初始化完成

📋 测试 1: 检查登录状态
登录状态：✅ 已登录

📋 测试 2: 测试发布功能
发布结果：{ success: true, publishedUrl: '...' }

✅ 测试完成
```

### 手动验证

1. 使用保存的 Cookie 启动浏览器
2. 访问微博
3. 检查是否自动登录

---

## 常见问题

### Q1: Cookie 失效怎么办？

**原因:**
- Cookie 过期（微博 Cookie 通常有效期 30 天）
- 账号被强制登出
- 密码修改

**解决方案:**
1. 重新获取 Cookie（参考上面步骤）
2. 更新系统中的 Cookie 配置

### Q2: 获取 Cookie 后仍然显示未登录？

**可能原因:**
- Cookie 不完整（缺少关键 Cookie）
- Cookie 格式错误
- Domain 不匹配

**解决方案:**
1. 确保包含 `SUB` 和 `SUBP` Cookie
2. 检查 Domain 是否为 `.weibo.com`
3. 使用 JSON 格式导出，不要手动编辑

### Q3: 多账号如何管理？

每个账号独立的 Cookie：

```typescript
// 账号 A
const publisherA = new WeiboPublisher({ accountId: 'weibo-account-1' });
await publisherA.loadCookies(encryptedCookiesA, encryptionKey);

// 账号 B
const publisherB = new WeiboPublisher({ accountId: 'weibo-account-2' });
await publisherB.loadCookies(encryptedCookiesB, encryptionKey);
```

### Q4: Cookie 安全吗？

**安全措施:**
- ✅ Cookie 使用 AES-256 加密存储
- ✅ 加密密钥与代码分离
- ✅ 仅服务器可访问
- ⚠️ 不要将 Cookie 提交到 Git

**最佳实践:**
```bash
# .gitignore
*.json
.env
cookies/
```

---

## Cookie 格式示例

```json
[
  {
    "name": "SUB",
    "value": "_2A25xxx...",
    "domain": ".weibo.com",
    "path": "/",
    "expires": 1740000000,
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
  },
  {
    "name": "SUBP",
    "value": "0000000000000000000000000000000000000000000000000000",
    "domain": ".weibo.com",
    "path": "/",
    "expires": 1740000000,
    "httpOnly": true,
    "secure": true
  }
]
```

---

## 相关文档

- [微博发布器开发文档](./weibo-publisher.md)
- [Playwright 配置指南](./playwright-config.md)
- [多账号管理](./multi-account-management.md)

---

**最后更新**: 2026-03-02  
**维护者**: HT 行动团队
