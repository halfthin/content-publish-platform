# Cookie 获取与管理指南

## 📋 目录

- [为什么需要 Cookie](#为什么需要-cookie)
- [微博 Cookie 获取](#微博-cookie-获取)
- [小红书 Cookie 获取](#小红书-cookie-获取)
- [Cookie 加密存储](#cookie-加密存储)
- [常见问题](#常见问题)

---

## 为什么需要 Cookie？

本系统使用 **Playwright 浏览器自动化** 技术来发布内容到各大平台。为了避免每次发布都需要扫码登录，系统使用 **Cookie 保持登录状态**。

**Cookie 的作用**:
- ✅ 保持账号登录状态
- ✅ 避免重复扫码/输入密码
- ✅ 提高发布效率
- ✅ 支持多账号管理

---

## 微博 Cookie 获取

### 方法一：使用浏览器扩展（推荐 ⭐）

#### 步骤 1: 安装 Cookie 编辑器

**Chrome/Edge 浏览器**:

1. 打开 Chrome 网上应用店
2. 搜索 **"EditThisCookie"** 或 **"Cookie Editor"**
3. 点击 **"添加至 Chrome"** 安装

**Firefox 浏览器**:

1. 打开 Firefox 附加组件商店
2. 搜索 **"Cookie Editor"**
3. 点击 **"添加到 Firefox"** 安装

#### 步骤 2: 登录微博

1. 打开浏览器，访问 [https://weibo.com](https://weibo.com)
2. 使用手机扫码或账号密码登录
3. 确保登录成功（能看到个人首页）

#### 步骤 3: 导出 Cookie

1. 点击浏览器工具栏的 **EditThisCookie** 图标
2. 点击 **"导出"** 按钮（向下箭头图标 ↓）
3. 选择 **"JSON"** 格式
4. 复制导出的 JSON 内容

**示例导出内容**:
```json
[
  {
    "domain": ".weibo.com",
    "name": "SUB",
    "value": "xxxxxxxxxxxxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1735689600,
    "httpOnly": true,
    "secure": true
  },
  {
    "domain": ".weibo.com",
    "name": "SUBP",
    "value": "xxxxxxxxxxxxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1735689600,
    "httpOnly": true,
    "secure": true
  },
  {
    "domain": ".weibo.com",
    "name": "SCF",
    "value": "xxxxxxxxxxxxxxxxxxxxx",
    "path": "/",
    "httpOnly": true,
    "secure": false
  }
]
```

#### 步骤 4: 导入到系统

1. 打开内容发布平台管理界面
2. 进入 **账号管理** > **添加账号**
3. 选择平台：**微博**
4. 粘贴 Cookie JSON 数据
5. 设置加密密码
6. 点击保存

---

### 方法二：使用开发者工具

#### 步骤 1: 打开开发者工具

1. 登录微博后，按 **F12** 打开开发者工具
2. 或右键点击页面 > **"检查"**

#### 步骤 2: 查看 Cookie

**Chrome/Edge**:
1. 切换到 **"Application"** 标签
2. 左侧展开 **"Cookies"**
3. 选择 **"https://weibo.com"**

**Firefox**:
1. 切换到 **"Storage"** 标签
2. 左侧展开 **"Cookies"**
3. 选择 **"https://weibo.com"**

#### 步骤 3: 复制 Cookie

手动复制关键 Cookie 字段：

| 名称   | 说明                  | 必需 |
|--------|-----------------------|------|
| SUB    | 主要登录凭证          | ✅   |
| SUBP   | 登录凭证（备用）      | ✅   |
| SCF    | 安全凭证              | ✅   |
| SSOLoginState | 登录状态    | ⚠️   |
| _s_tea | 用户追踪            | ⚠️   |

#### 步骤 4: 转换为 JSON 格式

手动创建 JSON 格式：

```json
[
  {
    "domain": ".weibo.com",
    "name": "SUB",
    "value": "复制的值",
    "path": "/",
    "httpOnly": true,
    "secure": true
  }
]
```

---

## 小红书 Cookie 获取

### 方法一：使用浏览器扩展（推荐 ⭐）

#### 步骤 1: 安装 Cookie 编辑器

同上，安装 **EditThisCookie** 或 **Cookie Editor** 扩展。

#### 步骤 2: 登录小红书创作者平台

1. 打开浏览器，访问 [https://creator.xiaohongshu.com](https://creator.xiaohongshu.com)
2. 使用手机扫码登录
3. 确保登录成功（能看到创作者后台）

#### 步骤 3: 导出 Cookie

1. 点击浏览器工具栏的 **EditThisCookie** 图标
2. 点击 **"导出"** 按钮
3. 选择 **"JSON"** 格式
4. 复制导出的 JSON 内容

**示例导出内容**:
```json
[
  {
    "domain": ".xiaohongshu.com",
    "name": "a1",
    "value": "xxxxxxxxxxxxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1735689600,
    "httpOnly": true,
    "secure": true
  },
  {
    "domain": ".xiaohongshu.com",
    "name": "web_session",
    "value": "xxxxxxxxxxxxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1735689600,
    "httpOnly": false,
    "secure": false
  }
]
```

---

### 方法二：使用开发者工具

#### 步骤 1: 打开小红书创作者平台

访问 [https://creator.xiaohongshu.com](https://creator.xiaohongshu.com) 并登录

#### 步骤 2: 打开开发者工具

按 **F12** 打开开发者工具

#### 步骤 3: 查看并复制 Cookie

1. 切换到 **Application** > **Cookies** > **https://www.xiaohongshu.com**
2. 复制关键 Cookie：

| 名称        | 说明              | 必需 |
|-------------|-------------------|------|
| a1          | 主要登录凭证      | ✅   |
| web_session | 会话凭证          | ✅   |
| xsec_token  | 安全令牌          | ⚠️   |

---

## Cookie 加密存储

### 加密原理

系统使用 **AES-256-GCM** 算法加密 Cookie 数据，确保存储安全。

### 加密流程

```typescript
// 1. 导入加密工具
import { encryptCookies, decryptCookies } from './utils/encryption';

// 2. 加密 Cookie（存储到数据库）
const password = process.env.COOKIE_ENCRYPTION_KEY;
const encrypted = await encryptCookies(cookies, password);

// 3. 解密 Cookie（使用时）
const cookies = await decryptCookies(encrypted, password);
```

### 密钥管理

**环境变量配置**:

```bash
# .env 文件
COOKIE_ENCRYPTION_KEY=your-secret-key-here
```

**安全建议**:
- ✅ 使用强密码（至少 32 位随机字符）
- ✅ 不要将密钥提交到 Git
- ✅ 定期更换密钥
- ✅ 不同环境使用不同密钥

---

## 常见问题

### Q1: Cookie 多久会过期？

**答**: Cookie 有效期取决于平台：
- **微博**: 通常 30-90 天
- **小红书**: 通常 7-30 天

过期后需要重新获取 Cookie。

### Q2: 如何判断 Cookie 是否失效？

**答**: 系统会自动检测：
1. 发布前会检查登录状态
2. 如果失败，会返回 "NOT_LOGGED_IN" 错误
3. 需要重新获取 Cookie 并更新

### Q3: Cookie 可以在多个设备间共享吗？

**答**: 不建议。
- Cookie 与浏览器指纹相关
- 跨设备使用可能导致失效
- 建议在固定浏览器上获取

### Q4: 获取 Cookie 安全吗？

**答**: 安全，但需注意：
- ✅ Cookie 会被加密存储
- ✅ 只有授权人员可访问
- ⚠️ 不要将 Cookie 分享给他人
- ⚠️ 定期更新 Cookie

### Q5: Cookie 失效了怎么办？

**答**: 重新获取并更新：
1. 按照上述步骤重新获取 Cookie
2. 在管理界面找到对应账号
3. 点击 **"更新 Cookie"**
4. 粘贴新的 Cookie JSON
5. 保存

### Q6: 支持多账号吗？

**答**: 支持。
- 每个账号有独立的 Cookie
- 通过 accountId 区分
- 可同时管理多个微博/小红书账号

---

## 最佳实践

### 1. 定期更新 Cookie

建议每 **2-4 周** 更新一次 Cookie，避免突然失效影响发布。

### 2. 备份 Cookie

导出 Cookie 后，建议：
- 保存在安全的密码管理器中
- 或加密备份到本地

### 3. 监控发布状态

定期检查发布任务状态：
```bash
# 查看队列状态
curl http://localhost:3000/api/queue/stats
```

### 4. 使用测试账号

首次使用时，建议：
1. 先用测试账号验证
2. 确认发布成功后再使用正式账号

---

## 技术支持

如遇到问题，请查看：
- [微博发布器文档](./WEIBO_PUBLISHER.md)
- [小红书发布器文档](./XIAOHONGSHU_PUBLISHER.md)
- 系统日志：`docker-compose logs -f server`

---

**维护者**: HT-Action-Team  
**最后更新**: 2026-03-02
