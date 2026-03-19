# 抖音 Cookie 配置指南

本文档说明如何配置抖音账号的 Cookie，以便自动化发布视频内容。

---

## 📋 目录

1. [为什么需要 Cookie](#为什么需要-cookie)
2. [获取 Cookie 的方法](#获取-cookie-的方法)
3. [配置 Cookie 到系统](#配置-cookie-到系统)
4. [验证 Cookie 是否有效](#验证-cookie-是否有效)
5. [抖音视频要求](#抖音视频要求)
6. [常见问题](#常见问题)

---

## 为什么需要 Cookie

抖音创作者平台需要用户登录才能发布视频。通过保存登录后的 Cookie，系统可以：
- 自动保持登录状态
- 无需每次发布都重新登录/扫码
- 支持多账号管理
- 实现定时发布和批量发布

---

## 获取 Cookie 的方法

### 方法一：使用浏览器开发者工具（推荐）

#### 步骤 1: 登录抖音创作者平台

1. 打开 Chrome/Edge 浏览器
2. 访问 [https://creator.douyin.com](https://creator.douyin.com)
3. 使用抖音 App 扫码登录或账号密码登录

#### 步骤 2: 打开开发者工具

1. 按 `F12` 或右键点击页面 → "检查"
2. 切换到 **Application**（应用）标签
3. 左侧菜单展开 **Cookies** → 选择 `https://creator.douyin.com`

#### 步骤 3: 导出 Cookie

**Chrome/Edge:**
1. 右键点击 Cookie 列表
2. 选择 **Export → Export JSON**
3. 保存为 `douyin-cookies.json`

**或者手动复制:**
1. 全选 Cookie 列表（Ctrl+A）
2. 复制（Ctrl+C）
3. 粘贴到文本编辑器

**需要的关键 Cookie:**
- `sessionid` - 会话凭证（最重要）
- `sessionid_ss` - 会话凭证备份
- `sid_guard` - 会话守卫
- `uid_tt` - 用户 ID
- `sid_tt` - 会话 ID
- `msToken` - 安全令牌

---

### 方法二：使用 Playwright 脚本自动获取

创建一个脚本，手动登录后保存 Cookie：

```typescript
// save-douyin-cookies.ts
import { chromium } from 'playwright';
import * as fs from 'fs';

async function saveCookies() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('请在打开的浏览器中登录抖音创作者平台...');
  console.log('访问：https://creator.douyin.com');
  await page.goto('https://creator.douyin.com');
  
  // 等待用户手动登录（最长 5 分钟）
  console.log('等待登录完成...');
  // 等待用户头像出现（已登录标志）
  await page.waitForSelector('[class*="avatar"]', { timeout: 300000 });
  console.log('检测到已登录！');
  
  // 获取并保存 Cookie
  const cookies = await context.cookies();
  fs.writeFileSync('douyin-cookies.json', JSON.stringify(cookies, null, 2));
  console.log(`Cookie 已保存，共 ${cookies.length} 条`);
  
  await browser.close();
}

saveCookies().catch(console.error);
```

运行脚本：
```bash
bun save-douyin-cookies.ts
```

---

## 配置 Cookie 到系统

### 方式 1: 通过环境变量（开发环境）

```bash
# .env 文件
DOUYIN_COOKIES='[{"name":"sessionid","value":"xxx","domain":".douyin.com",...}]'
COOKIE_ENCRYPTION_KEY="your-32-char-secret-key"
```

### 方式 2: 通过数据库（生产环境）

在账号管理界面添加抖音账号，粘贴 Cookie JSON。

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
bun test
```

**预期输出:**
```
🧪 测试抖音发布器...

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
2. 访问抖音创作者平台
3. 检查是否自动登录

---

## 抖音视频要求

### 格式要求
- **推荐格式**: MP4
- **支持格式**: MP4, MOV, AVI
- **分辨率**: 720p 及以上（推荐 1080x1920 竖屏）
- **帧率**: 24-60 fps
- **码率**: 2-10 Mbps

### 大小限制
- **最大文件大小**: 4GB
- **推荐大小**: 500MB 以内（上传更快）
- **时长限制**: 15 秒 - 10 分钟

### 内容规范
- ✅ 原创内容
- ✅ 清晰画质
- ✅ 无水印
- ❌ 不得包含违规内容
- ❌ 不得侵犯他人权益

---

## 常见问题

### Q1: Cookie 失效怎么办？

**原因:**
- Cookie 过期（抖音 Cookie 通常有效期 30-90 天）
- 账号被强制登出
- 密码修改
- 异地登录

**解决方案:**
1. 重新获取 Cookie（参考上面步骤）
2. 更新系统中的 Cookie 配置
3. 考虑使用长期有效的 Cookie（如设备授权）

### Q2: 获取 Cookie 后仍然显示未登录？

**可能原因:**
- Cookie 不完整（缺少关键 Cookie）
- Cookie 格式错误
- Domain 不匹配
- IP 地址变化

**解决方案:**
1. 确保包含 `sessionid` 和 `sessionid_ss` Cookie
2. 检查 Domain 是否为 `.douyin.com`
3. 使用 JSON 格式导出，不要手动编辑
4. 尽量在同一网络环境下使用

### Q3: 视频上传失败？

**可能原因:**
- 视频格式不支持
- 视频文件过大
- 网络问题
- 账号权限不足

**解决方案:**
1. 检查视频格式（推荐 MP4）
2. 压缩视频到合适大小
3. 检查网络连接
4. 确认账号有发布权限

### Q4: 多账号如何管理？

每个账号独立的 Cookie：

```typescript
// 账号 A
const publisherA = new DouyinPublisher({ accountId: 'douyin-account-1' });
await publisherA.loadCookies(encryptedCookiesA, encryptionKey);

// 账号 B
const publisherB = new DouyinPublisher({ accountId: 'douyin-account-2' });
await publisherB.loadCookies(encryptedCookiesB, encryptionKey);
```

### Q5: Cookie 安全吗？

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
    "name": "sessionid",
    "value": "abc123xxx...",
    "domain": ".douyin.com",
    "path": "/",
    "expires": 1740000000,
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
  },
  {
    "name": "sessionid_ss",
    "value": "def456yyy...",
    "domain": ".douyin.com",
    "path": "/",
    "expires": 1740000000,
    "httpOnly": true,
    "secure": true
  },
  {
    "name": "sid_guard",
    "value": "ghi789zzz...",
    "domain": ".douyin.com",
    "path": "/",
    "expires": 1740000000,
    "httpOnly": true
  }
]
```

---

## 发布流程

1. **准备视频**: 确保视频符合格式要求
2. **配置 Cookie**: 导入有效的抖音 Cookie
3. **创建任务**: 通过 API 或界面创建发布任务
4. **等待发布**: 视频上传和处理需要时间
5. **验证结果**: 检查发布状态和链接

---

## 相关文档

- [抖音发布器开发文档](./douyin-publisher.md)
- [Playwright 配置指南](./playwright-config.md)
- [多账号管理](./multi-account-management.md)
- [微博 Cookie 配置](./weibo-cookie-guide.md)

---

**最后更新**: 2026-03-02  
**维护者**: HT 行动团队
