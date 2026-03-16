# 微博发布器实现说明

## 📋 概述

微博发布器 (`WeiboPublisher`) 是内容发布平台的微博平台自动发布模块，支持通过浏览器自动化技术实现微博内容的自动发布。

## 🎯 功能特性

- ✅ Cookie 保持登录（避免重复扫码）
- ✅ 文字内容发布
- ✅ 图片上传（最多 9 张）
- ✅ 话题标签添加（#话题# 格式）
- ✅ 自动等待发布完成
- ✅ 发布结果反馈（包含发布链接）
- ✅ 集成到 BullMQ 任务队列

## 📁 文件结构

```
apps/server/src/
├── publishers/
│   └── weibo.ts              # 微博发布器主文件
├── config/
│   └── weibo-selectors.ts    # 微博页面元素选择器配置
└── queues/
    └── publish-queue.ts      # 已集成微博 Worker
```

## 🔧 核心类与方法

### WeiboPublisher 类

```typescript
class WeiboPublisher {
  // 初始化浏览器上下文
  initialize(): Promise<void>
  
  // 加载 Cookie
  loadCookies(encryptedCookies: string, password: string): Promise<boolean>
  
  // 保存 Cookie
  saveCookies(password: string): Promise<string>
  
  // 检查登录状态
  checkLoginStatus(): Promise<boolean>
  
  // 执行登录（需要人工介入）
  login(): Promise<boolean>
  
  // 发布内容
  publish(job: PublishJob): Promise<WeiboPublishResult>
  
  // 关闭浏览器
  close(): Promise<void>
}
```

### 发布流程

```
1. initialize()      - 初始化浏览器上下文
2. loadCookies()     - 加载加密的 Cookie 数据
3. checkLoginStatus() - 验证登录状态
4. publish()         - 执行发布流程：
   4.1 fillContent()    - 填写文字内容和话题
   4.2 uploadImages()   - 上传图片（最多 9 张）
   4.3 submitPublish()  - 点击发布按钮
   4.4 waitForPublishComplete() - 等待发布完成
5. close()           - 关闭浏览器
```

## 🍪 Cookie 管理

### 为什么需要 Cookie？

微博发布器使用 Playwright 浏览器自动化技术，通过保持登录状态的 Cookie 来避免每次发布都需要扫码登录。

### Cookie 获取方法

#### 方法一：使用浏览器扩展（推荐）

**Chrome/Edge 浏览器**:

1. **安装扩展**
   - 在 Chrome 网上应用店搜索 "EditThisCookie" 或 "Cookie Editor"
   - 点击"添加至 Chrome"安装

2. **登录微博**
   - 打开 https://weibo.com
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
    "domain": ".weibo.com",
    "name": "SUB",
    "value": "xxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1234567890,
    "httpOnly": true,
    "secure": true
  },
  {
    "domain": ".weibo.com",
    "name": "SUBP",
    "value": "xxxxxxxxxxx",
    "path": "/",
    "expirationDate": 1234567890,
    "httpOnly": true,
    "secure": true
  }
]
```

#### 方法二：使用开发者工具

1. 打开微博并登录
2. 按 F12 打开开发者工具
3. 切换到 Application/Storage 标签
4. 展开 Cookies，选择 weibo.com
5. 手动复制 Cookie 数据

### Cookie 加密存储

系统使用 AES-256-GCM 算法加密 Cookie 数据：

```typescript
// 加密 Cookie
const encrypted = await encryptCookies(cookies, password);

// 解密 Cookie
const cookies = await decryptCookies(encryptedCookies, password);
```

**加密密钥管理**:
- 密钥应存储在环境变量中（如 `COOKIE_ENCRYPTION_KEY`）
- 不要将密钥提交到版本控制系统

## 🧪 测试指南

### 本地测试（非无头模式）

```bash
# 设置环境变量
export PLAYWRIGHT_HEADLESS=false
export PLAYWRIGHT_SLOW_MO=100

# 启动服务
bun run dev
```

### 测试用例

1. **登录测试**
   ```typescript
   const publisher = new WeiboPublisher({ accountId: 'test001' });
   await publisher.initialize();
   await publisher.login();  // 人工扫码
   const isLoggedIn = await publisher.checkLoginStatus();
   console.log('Login status:', isLoggedIn);
   await publisher.close();
   ```

2. **发布测试（文字 + 图片）**
   ```typescript
   const publisher = new WeiboPublisher({ accountId: 'test001' });
   await publisher.initialize();
   await publisher.loadCookies(encryptedCookies, password);
   
   const result = await publisher.publish({
     contentId: 'test-001',
     accountId: 'test001',
     platform: 'weibo',
     content: {
       title: '测试微博',
       description: '这是一条测试微博 #测试# #自动化#',
       images: ['/path/to/image1.jpg', '/path/to/image2.jpg'],
       tags: ['测试', '自动化'],
     },
   });
   
   console.log('Publish result:', result);
   await publisher.close();
   ```

3. **队列集成测试**
   ```typescript
   import { addPublishJob } from './queues/publish-queue';
   
   await addPublishJob({
     contentId: 'content-123',
     accountId: 'weibo-account-001',
     platform: 'weibo',
     content: {
       title: '队列测试',
       description: '通过队列发布的测试微博',
       images: ['/path/to/image.jpg'],
       tags: ['队列测试'],
     },
   });
   ```

## ⚠️ 注意事项

### 1. 页面结构变化

微博页面结构可能会更新，导致 selector 失效。如遇到发布失败：

```bash
# 使用 Playwright Codegen 重新分析页面
npx playwright code https://weibo.com
```

然后更新 `weibo-selectors.ts` 中的选择器配置。

### 2. 图片上传限制

- 最多支持 9 张图片
- 单张图片大小不超过 10MB
- 支持的图片格式：JPG, PNG, GIF

### 3. 发布频率限制

微博对发布频率有限制：
- 建议每条微博间隔至少 1 分钟
- 避免短时间内大量发布
- 遵守微博社区规范

### 4. 内容审核

发布内容需符合微博社区规范：
- 不得发布违法违规内容
- 不得发布垃圾广告
- 不得侵犯他人权益

## 🔍 故障排查

### 常见问题

**1. 发布失败：找不到发布按钮**
```
错误：Publish button not found
解决：检查是否已登录，更新 weibo-selectors.ts 中的 publishButton selector
```

**2. 图片上传失败**
```
错误：Image upload button not found
解决：检查页面是否完全加载，更新 imageUploadButton selector
```

**3. Cookie 失效**
```
错误：Login status check failed
解决：重新获取 Cookie 并更新数据库
```

**4. 发布后未获取到链接**
```
警告：Published URL not found
解决：检查发布是否成功，更新 publishedUrl selector
```

### 日志查看

```bash
# 查看服务日志
docker-compose -f docker/docker-compose.yml logs -f server

# 或本地开发模式
bun run dev 2>&1 | grep weibo
```

## 📊 性能优化

1. **浏览器复用**: 使用 BrowserContext 池化减少浏览器启动时间
2. **Cookie 缓存**: 避免重复登录
3. **并发控制**: 每个账号并发 1 个任务，避免冲突
4. **超时设置**: 合理设置超时时间，避免长时间等待

## 🚀 后续优化

- [ ] 支持视频发布
- [ ] 支持定时发布
- [ ] 支持@提及好友
- [ ] 支持添加位置
- [ ] 支持可见性设置（公开/粉丝可见/仅自己可见）
- [ ] 支持长微博（超过 140 字）

## 📝 更新日志

### v1.0.0 (2026-03-02)
- ✅ 初始版本发布
- ✅ 支持文字 + 图片发布
- ✅ 支持话题标签
- ✅ 集成到 BullMQ 队列
- ✅ Cookie 加密存储

---

**维护者**: HT-Action-Team  
**最后更新**: 2026-03-02
