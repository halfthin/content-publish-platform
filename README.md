# 内容发布平台

多平台内容发布自动化系统 - 支持小红书、微博、抖音、B 站、微信公众号

## 🚀 技术栈

### 后端
- **运行时**: Bun
- **框架**: ElysiaJS
- **语言**: TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **任务队列**: BullMQ + Redis
- **浏览器自动化**: Playwright

### 前端
- **框架**: Vue 3
- **UI 组件**: Element Plus
- **构建工具**: Vite
- **状态管理**: Pinia
- **路由**: Vue Router

## 📦 快速开始

### 1. 环境准备

```bash
# 复制环境变量
cp .env.example .env

# 编辑 .env 配置数据库和 Redis 连接
```

### 2. 使用 Docker (推荐)

```bash
# 启动所有服务
docker-compose -f docker/docker-compose.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.yml down
```

访问：
- 前端：http://localhost:8080
- 后端 API: http://localhost:3000

### 3. 本地开发

```bash
# 安装依赖
bun install

# 生成 Prisma 客户端
bun run db:generate

# 数据库迁移
bun run db:migrate

# 启动开发服务器
bun run dev
```

---

## 🍪 Cookie 管理指南

### 为什么需要 Cookie？

本系统使用 Playwright 浏览器自动化技术发布内容到小红书。为了避免每次发布都需要扫码登录，系统使用 Cookie 来保持登录状态。

---

### 获取 Cookie（在 Windows/Mac 电脑上操作）

#### 方法一：使用浏览器扩展（推荐）

**Chrome/Edge 浏览器**:

1. **安装扩展**：EditThisCookie 或 Cookie Editor
   - Chrome 网上应用店搜索 "EditThisCookie"
   - 点击"添加至 Chrome"

2. **登录小红书**
   - 打开 https://www.xiaohongshu.com
   - 使用手机扫码或账号密码登录
   - 确保登录成功

3. **导出 Cookie**
   - 点击浏览器工具栏的 EditThisCookie 图标
   - 点击"导出"按钮（向下箭头图标）
   - 选择"JSON"格式
   - 复制导出的 JSON 内容

**示例导出内容**:
```json
[
  {
    "domain": ".xiaohongshu.com",
    "name": "a1",
    "value": "xh_token_xxxxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1709251200,
    "httpOnly": true,
    "secure": true
  },
  {
    "domain": ".xiaohongshu.com",
    "name": "webId",
    "value": "xxxxxxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1709251200,
    "httpOnly": true,
    "secure": true
  }
]
```

#### 方法二：使用开发者工具

**Chrome/Edge 浏览器**:

1. 打开小红书并登录
   - 访问 https://www.xiaohongshu.com
   - 完成登录

2. 打开开发者工具
   - 按 `F12` 或右键 → "检查"
   - 切换到 "Application" 标签
   - 左侧展开 "Cookies" → "https://www.xiaohongshu.com"

3. 复制 Cookie
   - 选中所有 Cookie (Ctrl+A / Cmd+A)
   - 右键 → "Copy" → "Copy as JSON"
   - 或手动复制关键字段

---

### 导入 Cookie 到系统

#### 通过 Web 管理界面

1. **访问账号管理页面**
   - 打开系统：http://localhost:3000
   - 点击左侧菜单 "账号管理"

2. **添加/编辑账号**
   - 点击 "添加账号" 或选择已有账号点击 "编辑"
   - 填写账号名称（如：小红书 -01）
   - 选择平台：小红书

3. **导入 Cookie**
   - 在 "Cookie" 文本框中粘贴 JSON 内容
   - 点击 "验证" 按钮（系统会自动验证 Cookie 有效性）
   - 验证通过后点击 "保存"

4. **查看状态**
   - 账号列表中会显示登录状态
   - 绿色 = 有效，红色 = 已过期

#### 通过 API 导入

```bash
# 导入 Cookie
curl -X POST http://localhost:3000/api/accounts/:id/cookies \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": "[{\"name\":\"a1\",\"value\":\"...\"}]"
  }'

# 验证 Cookie
curl -X GET http://localhost:3000/api/accounts/:id/cookies/verify
```

---

### Cookie 加密存储

**安全机制**:
- ✅ **AES-256-GCM 加密** - 军事级加密算法
- ✅ **PBKDF2 密钥派生** - 防止暴力破解
- ✅ **随机 Salt** - 每次加密使用不同 Salt
- ✅ **随机 IV** - 每次加密使用不同初始化向量
- ✅ **Auth Tag 验证** - 防止数据篡改

**存储位置**: PostgreSQL 数据库 `cookies` 表

**加密流程**:
```
用户输入 Cookie JSON
        ↓
AES-256-GCM 加密
        ↓
Salt + IV + AuthTag + 密文
        ↓
Hex 编码存储到数据库
```

**解密流程**:
```
从数据库读取加密数据
        ↓
Hex 解码
        ↓
使用密码解密（需要 Salt + IV + AuthTag）
        ↓
验证 AuthTag
        ↓
返回原始 Cookie JSON
        ↓
加载到浏览器上下文
```

---

### Cookie 维护和更新

#### 检查 Cookie 状态

**自动检测**:
- 系统每次发布前会自动检查 Cookie 有效性
- 如果 Cookie 过期，会提示"登录已过期，请重新导入 Cookie"

**手动验证**:
1. 访问 "账号管理" 页面
2. 点击账号右侧的 "验证" 按钮
3. 系统会检查登录状态并显示结果

#### 更新 Cookie

当 Cookie 过期时：

1. 重新登录小红书
   - 在浏览器中打开小红书
   - 重新扫码或输入密码登录

2. 导出新的 Cookie
   - 使用 EditThisCookie 导出新的 Cookie JSON

3. 更新系统
   - 访问 "账号管理"
   - 选择对应账号 → "编辑"
   - 粘贴新的 Cookie
   - 点击 "保存"

#### Cookie 有效期

| Cookie 类型 | 有效期 | 说明 |
|-------------|--------|------|
| 短期 Cookie | 7-15 天 | 普通登录 |
| 长期 Cookie | 30-90 天 | 记住登录状态 |
| 设备绑定 | 可能更短 | 需要设备验证 |

**建议**:
- 每周检查一次 Cookie 状态
- 发现过期立即更新
- 重要发布前验证 Cookie

---

### 常见问题

#### Q: Cookie 导入后验证失败？

**A**: 可能原因：
1. Cookie 已过期 → 重新登录小红书并导出新 Cookie
2. Cookie 格式错误 → 确保是完整的 JSON 数组
3. 设备绑定限制 → 在常用设备上登录

#### Q: 一个账号可以导入多个设备的 Cookie 吗？

**A**: 可以，但建议：
- 每个账号固定使用一个设备的 Cookie
- 频繁切换设备可能触发风控
- 系统支持多账号管理，建议一个设备对应一个账号

#### Q: Cookie 安全吗？会被盗用吗？

**A**: 安全措施：
1. **加密存储** - AES-256-GCM 加密，无法直接读取
2. **数据库隔离** - 只有系统可以访问
3. **权限控制** - 需要管理员权限才能查看
4. **定期更新** - 建议定期更换 Cookie

**建议**:
- 不要分享 Cookie 文件
- 定期更新 Cookie
- 使用独立的发布账号

#### Q: 如何批量导入多个账号的 Cookie？

**A**: 批量导入功能开发中，目前可以：
1. 逐个账号导入
2. 使用 API 批量导入（需要编程）
3. 等待 Web 界面的批量导入功能

---

### 最佳实践

1. **固定设备** - 在固定的电脑上导出 Cookie，避免频繁切换设备
2. **定期更新** - 每周检查 Cookie 状态，发布前验证 Cookie 有效性
3. **备份 Cookie** - 导出后保存备份（加密存储），防止意外丢失
4. **账号分组** - 按用途分组管理账号，便于维护和监控
5. **监控日志** - 查看发布日志，发现 Cookie 问题及时处理

---

## 📁 项目结构

```
content-publish-platform/
├── apps/
│   ├── server/          # 后端服务
│   └── web/             # 前端应用
├── content/             # 内容文件存储
│   ├── inbox/          # 待审核
│   ├── approved/       # 已通过
│   └── published/      # 已发布
├── docker/             # Docker 配置
├── prisma/             # 数据库 Schema
└── docker-compose.yml  # Docker Compose 配置
```

## 🔧 开发命令

```bash
# 后端开发
bun --cwd apps/server run dev

# 前端开发
bun --cwd apps/web run dev

# 数据库操作
bun --cwd apps/server run db:generate
bun --cwd apps/server run db:migrate
bun --cwd apps/server run db:studio
```

## 🌐 多平台支持

### 架构设计

本系统采用**模块化发布者架构**，支持轻松扩展多个内容平台。

**核心设计理念**:
- ✅ **Cookie 管理通用** - 所有平台使用统一的 Cookie 加密存储
- ✅ **浏览器池通用** - Playwright 支持所有 Web 平台
- ✅ **任务队列通用** - BullMQ 队列适用于任何发布任务
- ✅ **发布器独立** - 每个平台独立的发布器实现

**系统架构**:
```
┌─────────────────────────────────────────────────────────┐
│                    Web 管理界面                          │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   后端服务                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Cookie 管理   │  │ 浏览器池     │  │ 任务队列     │   │
│  │  (通用)      │  │ (通用)       │  │ (通用)       │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ 小红书发布器 │  │ 微博发布器   │  │ 抖音发布器   │   │
│  │ (平台特定)   │  │ (平台特定)   │  │ (平台特定)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

### 已支持平台

| 平台 | 状态 | 发布类型 | Cookie 有效期 | 难度 |
|------|------|----------|--------------|------|
| **小红书** | ✅ 已完成 | 图文 | 7-90 天 | ⭐⭐ |
| **微博** | ⏳ 开发中 | 图文 | 30-180 天 | ⭐⭐ |
| **微信公众号** | 📅 计划中 | 图文 | 7-30 天 | ⭐⭐⭐ |
| **抖音** | 📅 计划中 | 视频 | 7-30 天 | ⭐⭐⭐⭐ |
| **B 站** | 📅 计划中 | 视频 | 30-90 天 | ⭐⭐⭐ |

**图例**:
- ✅ 已完成并测试
- ⏳ 开发中
- 📅 计划中

---

### 平台特性对比

#### 小红书
- **发布内容**: 图文（6-10 张图片 + 文案）
- **Cookie 机制**: Token + Session
- **设备绑定**: 是
- **风控等级**: 中等
- **发布频率**: 建议 ≤3 次/天/账号
- **特殊要求**: 需要真实图片，文案不能有明显营销

#### 微博
- **发布内容**: 图文（9 张图片 + 文案）
- **Cookie 机制**: Cookie + Token
- **设备绑定**: 否
- **风控等级**: 中等
- **发布频率**: 建议 ≤5 次/天/账号
- **特殊要求**: 支持话题标签，支持@用户

#### 微信公众号
- **发布内容**: 长图文
- **Cookie 机制**: Cookie
- **设备绑定**: 是（需要扫码）
- **风控等级**: 高
- **发布频率**: 服务号 ≤4 次/月，订阅号 ≤1 次/天
- **特殊要求**: 需要公众号管理员扫码

#### 抖音
- **发布内容**: 短视频（≤15 分钟）
- **Cookie 机制**: Token + Cookie
- **设备绑定**: 是（强绑定）
- **风控等级**: 高
- **发布频率**: 建议 ≤2 次/天/账号
- **特殊要求**: 视频格式要求严格，需要封面图

#### B 站
- **发布内容**: 短视频
- **Cookie 机制**: Cookie
- **设备绑定**: 否
- **风控等级**: 中等
- **发布频率**: 建议 ≤3 次/天/账号
- **特殊要求**: 视频格式、分区选择、标签

---

### 为什么 Cookie 方式是通用的？

**技术原理**:
所有 Web 平台都使用 Cookie 来维持登录状态，这是 Web 标准协议（HTTP State Management）的一部分。

**通用流程**:
```
1. 用户在浏览器登录 → 2. 服务器返回 Cookie → 3. 浏览器保存 Cookie
       ↓
4. 导出 Cookie → 5. 系统加密存储 → 6. Playwright 加载
       ↓
7. 自动登录 → 8. 执行发布 → 9. 保存结果
```

**Cookie 结构** (所有平台通用):
```typescript
interface Cookie {
  name: string;      // Cookie 名称
  value: string;     // Cookie 值
  domain: string;    // 域名（如 .xiaohongshu.com）
  path: string;      // 路径（通常是 /）
  expires?: number;  // 过期时间（Unix 时间戳）
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}
```

**Playwright 支持** (适用于任何平台):
```typescript
// 通用 Cookie 加载代码
await context.addCookies([
  { name: 'session', value: 'xxx', domain: 'platform.com', path: '/' }
]);

// 访问任何平台
await page.goto('https://platform.com');
await publisher.publish(content);
```

**本系统的 Cookie 管理** (100% 通用):
- ✅ **加密存储**: AES-256-GCM（与平台无关）
- ✅ **格式统一**: JSON 数组（所有平台通用）
- ✅ **导出方式**: EditThisCookie（支持所有平台）
- ✅ **验证机制**: 自动检查登录状态

---

### 如何扩展新平台？

**扩展步骤**:

#### 1. 创建发布器类

**文件**: `src/publishers/<platform>.ts`

```typescript
import { Publisher, Content, PublishResult } from './base';

export class WeiboPublisher implements Publisher {
  private context: BrowserContext;
  
  async initialize(context: BrowserContext) {
    this.context = context;
  }
  
  async checkLoginStatus(): Promise<boolean> {
    // 检查微博登录状态
    const page = await this.context.newPage();
    await page.goto('https://weibo.com');
    const isLoggedIn = await page.$('.WB_text');
    return !!isLoggedIn;
  }
  
  async publish(content: Content): Promise<PublishResult> {
    const page = await this.context.newPage();
    
    // 1. 导航到发布页面
    await page.goto('https://weibo.com/composer/');
    
    // 2. 上传图片
    await this.uploadImages(content.images);
    
    // 3. 填写文案
    await page.fill('.WB_textarea', content.description);
    
    // 4. 添加话题
    await this.addHashtags(content.tags);
    
    // 5. 提交发布
    await page.click('.W_btn_a');
    
    // 6. 等待发布完成
    await this.waitForPublishComplete();
    
    return { success: true, url: page.url() };
  }
  
  private async uploadImages(images: string[]) {
    // 实现图片上传逻辑
  }
  
  private async addHashtags(tags: string[]) {
    // 实现话题添加逻辑
  }
  
  private async waitForPublishComplete() {
    // 等待发布完成
  }
  
  async close() {
    await this.context.close();
  }
}
```

#### 2. 注册发布器

**文件**: `src/queues/publish-queue.ts`

```typescript
import { WeiboPublisher } from '../publishers/weibo';

const publisherMap = {
  xiaohongshu: XiaohongshuPublisher,
  weibo: WeiboPublisher,  // 新增
  // ... 其他平台
};
```

#### 3. 添加平台配置

**文件**: `src/config/platforms.ts`

```typescript
export const platformConfig = {
  weibo: {
    name: '微博',
    baseUrl: 'https://weibo.com',
    publishUrl: 'https://weibo.com/composer/',
    maxImages: 9,
    maxTextLength: 2000,
    supportsVideo: false,
    cookieDomain: '.weibo.com',
  },
  // ... 其他平台
};
```

#### 4. 更新 Web 界面

**文件**: `apps/web/src/views/Accounts.vue`

```vue
<template>
  <select v-model="platform">
    <option value="xiaohongshu">小红书</option>
    <option value="weibo">微博</option>  <!-- 新增 -->
    <!-- ... 其他平台 -->
  </select>
</template>
```

#### 5. 测试验证

```bash
# 运行微博发布器测试
bun test src/publishers/weibo.test.ts

# 端到端测试
bun run src/test-weibo.ts
```

**预计工作量**:
- 简单平台（知乎、豆瓣）: 4-8 小时
- 中等平台（微博、B 站）: 6-12 小时
- 复杂平台（抖音、微信公众号）: 12-24 小时

---

### 平台扩展清单

**想添加新平台？** 按以下清单检查：

- [ ] 平台是否基于 Web？（是 → 可以使用本系统）
- [ ] 是否支持 Cookie 登录？（是 → 可以导入 Cookie）
- [ ] 是否有发布页面？（是 → 可以实现自动化）
- [ ] 是否了解发布流程？（是 → 可以编写发布器）
- [ ] 是否了解平台规则？（是 → 可以避免风控）

**如果以上都是"是"，那么可以轻松扩展！**

---

### 常见问题

#### Q: 所有平台都能用这种方式吗？

**A**: 理论上是的，但需要注意：
- ✅ **Web 平台**: 完全支持（小红书、微博、知乎等）
- ⚠️ **App 优先平台**: 需要额外工作（抖音、快手等）
- ❌ **纯 App 平台**: 不支持（需要移动端自动化）

#### Q: Cookie 在所有平台都有效吗？

**A**: 是的，但有差异：
- **长期有效**: 微博、B 站、知乎（30-180 天）
- **中期有效**: 小红书、微信公众号（7-90 天）
- **短期有效**: 抖音、快手（7-30 天）

#### Q: 一个账号可以在多个平台使用吗？

**A**: 可以，但建议：
- 每个平台独立管理 Cookie
- 不要混用不同平台的 Cookie
- 系统支持多账号管理，可以分别配置

#### Q: 扩展新平台难吗？

**A**: 取决于平台复杂度：
- **简单**: 知乎、豆瓣（4-8 小时）
- **中等**: 微博、B 站（6-12 小时）
- **困难**: 抖音、微信公众号（12-24 小时）

**关键**: 了解平台发布流程和风控规则。

---

### 推荐扩展顺序

根据你的需求（电商引流），推荐优先级：

| 优先级 | 平台 | 理由 | 预计工时 |
|--------|------|------|----------|
| **P0** | 小红书 | ✅ 已完成 | - |
| **P0** | 微博 | 流量大，门槛低 | 6-12 小时 |
| **P1** | 微信公众号 | 私域流量，转化高 | 8-16 小时 |
| **P1** | 抖音 | 流量巨大，视频引流 | 12-24 小时 |
| **P2** | B 站 | 年轻用户，长尾效应 | 8-16 小时 |
| **P2** | 知乎 | 专业用户，口碑传播 | 4-8 小时 |

---

### 技术栈复用率

| 模块 | 复用率 | 说明 |
|------|--------|------|
| Cookie 加密 | 100% | 所有平台通用 |
| 浏览器池 | 100% | Playwright 支持所有平台 |
| 任务队列 | 100% | BullMQ 与平台无关 |
| Web 界面 | 80% | 只需添加平台选项 |
| 发布逻辑 | 0% | 每个平台独立实现 |

**结论**: 扩展新平台只需要实现发布逻辑，其他都可以复用！

---

## 📝 API 文档

后端 API 运行在 `http://localhost:3000`

- `GET /` - API 信息
- `GET /health` - 健康检查
- `GET /api/contents` - 内容列表
- `GET /api/accounts` - 账号列表
- `POST /api/publish` - 发布内容

## 📄 License

MIT
