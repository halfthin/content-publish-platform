# 小红书博主信息采集功能文档

**创建时间**: 2026-03-07 11:20 CST  
**版本**: 1.0.0

---

## 📋 功能概述

本系统提供完整的小红书博主和博文信息采集功能，包括：

1. **搜索功能** - 根据关键词搜索博主/笔记
2. **博主信息采集** - 采集博主详细资料
3. **笔记采集** - 采集博主发布的笔记内容

---

## 🎯 采集目标

### 1. 搜索关键词 → 获取博主列表

**输入**: 关键词（如"通勤穿搭"）

**输出**: 博主列表（包含昵称、头像、主页链接）

**页面**: `https://www.xiaohongshu.com/search_result?keyword={keyword}`

---

### 2. 博主主页 → 采集详细信息

**采集字段**:

| 字段 | 说明 | 示例 |
|------|------|------|
| 博主名称 (nickname) | 博主昵称 | "时尚达人小美" |
| 小红书号 (userId) | 唯一用户 ID | "69a5fba4000000001b01c6f9" |
| IP 属地 (ipLocation) | IP 归属地 | "广东" |
| 关注数 (followCount) | 关注人数 | "328" |
| 粉丝数 (fansCount) | 粉丝数量 | "12.5 万" |
| 获赞与收藏 (likesCount) | 总获赞数 | "51.2 万" |
| 头像 (avatar) | 头像 URL | "https://..." |
| 主页链接 (profileUrl) | 主页完整 URL | "https://www.xiaohongshu.com/user/profile/xxx" |

**页面**: `https://www.xiaohongshu.com/user/profile/{userId}`

---

### 3. 浏览博文 → 采集笔记信息

**采集字段**:

| 字段 | 说明 | 示例 |
|------|------|------|
| 标题 (title) | 笔记标题 | "早秋通勤穿搭分享" |
| 内容 (content) | 笔记正文 | "今天分享几套通勤穿搭..." |
| 图片 (images) | 图片 URL 列表 | ["url1", "url2", ...] |
| 点赞数 (likeCount) | 点赞数量 | "5153" |
| 收藏数 (collectCount) | 收藏数量 | "2341" |
| 评论数 (commentCount) | 评论数量 | "189" |
| 分享数 (shareCount) | 分享数量 | "56" |
| 作者 (authorName) | 作者昵称 | "时尚达人小美" |
| 发布时间 (publishTime) | 发布日期 | "2025-10-09" |
| 标签 (tags) | 话题标签 | ["#通勤穿搭", "#早秋穿搭"] |
| 笔记链接 (noteUrl) | 完整 URL | "https://www.xiaohongshu.com/explore/xxx" |

**页面**: `https://www.xiaohongshu.com/explore/{noteId}`

---

## 📁 文件结构

```
apps/server/src/
├── config/
│   ├── xiaohongshu-search-selectors.ts   # 搜索页面选择器
│   ├── xiaohongshu-user-selectors.ts     # 用户主页选择器
│   └── xiaohongshu-note-selectors.ts     # 笔记详情页选择器
├── services/
│   └── xiaohongshu-scraper.service.ts    # 采集服务核心逻辑
└── test-xiaohongshu-scraper.mjs          # 测试脚本
```

---

## 🔧 使用方法

### 方式 1：使用测试脚本

```bash
cd ~/dev/content-publish-platform/apps/server

# 运行测试（显示浏览器，便于调试）
bun test-xiaohongshu-scraper.mjs
```

### 方式 2：在代码中调用

```typescript
import { XiaohongshuScraper } from './src/services/xiaohongshu-scraper.service';

async function scrapeBloggers() {
  const scraper = new XiaohongshuScraper({
    accountId: 'your-account-id',
    headless: true,  // 生产环境使用无头模式
    timeout: 90000,
    maxBloggers: 10,   // 最多采集 10 个博主
    maxNotes: 20,      // 每个博主最多采集 20 篇笔记
  });

  try {
    // 初始化
    await scraper.initialize();
    
    // 加载 Cookie（需要先解密）
    // await scraper.loadCookies(encryptedCookies, password);
    
    // 执行采集
    const result = await scraper.scrape('通勤穿搭');
    
    console.log('采集完成:', result);
    
    // 处理结果
    result.bloggers.forEach(blogger => {
      console.log(blogger.nickname, blogger.fansCount);
    });
    
  } finally {
    await scraper.close();
  }
}
```

---

## 📊 输出数据格式

### SearchResult 接口

```typescript
interface SearchResult {
  keyword: string;           // 搜索关键词
  totalCount: number;        // 总结果数
  bloggers: BloggerProfile[]; // 博主列表
  notes: NoteInfo[];         // 笔记列表
}
```

### BloggerProfile 接口

```typescript
interface BloggerProfile {
  userId: string;           // 用户 ID
  nickname: string;         // 昵称
  avatar: string;           // 头像 URL
  ipLocation: string;       // IP 属地
  followCount: string;      // 关注数
  fansCount: string;        // 粉丝数
  likesCount: string;       // 获赞与收藏数
  profileUrl: string;       // 主页链接
  collectedAt: string;      // 采集时间
}
```

### NoteInfo 接口

```typescript
interface NoteInfo {
  noteId: string;           // 笔记 ID
  title: string;            // 标题
  content: string;          // 内容
  images: string[];         // 图片 URL 列表
  likeCount: string;        // 点赞数
  collectCount: string;     // 收藏数
  commentCount: string;     // 评论数
  shareCount: string;       // 分享数
  authorName: string;       // 作者名
  publishTime: string;      // 发布时间
  tags: string[];           // 标签
  noteUrl: string;          // 笔记链接
  collectedAt: string;      // 采集时间
}
```

---

## 🧪 测试流程

### 步骤 1：准备 Cookie

```bash
# Cookie 文件位置
.workspace/config/xiaohongshu.cookies.ts
```

确保 Cookie 有效（已登录状态）。

### 步骤 2：运行测试

```bash
bun test-xiaohongshu-scraper.mjs
```

### 步骤 3：查看结果

测试结果会保存到：
```
.workspace/tests/scraper-test-result-{timestamp}.json
```

---

## ⚠️ 注意事项

### 1. Cookie 有效性

- 必须使用**已登录**的 Cookie
- Cookie 可能过期，需定期更新
- 建议使用 `--session-name` 持久化会话

### 2. 反爬机制

- 小红书有反爬机制，采集速度不宜过快
- 建议设置 `maxBloggers` 和 `maxNotes` 限制采集数量
- 可以添加随机延迟：

```typescript
await page.waitForTimeout(Math.random() * 2000 + 1000);
```

### 3. 选择器维护

- 小红书页面结构可能频繁更新
- 定期运行验证脚本：`validate-selectors.ts`
- 发现采集失败时，首先检查选择器是否有效

### 4. 法律合规

- 仅采集公开信息
- 遵守小红书用户协议
- 不要用于商业用途
- 控制采集频率，避免给服务器造成负担

---

## 🔧 配置选项

### ScraperConfig

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| accountId | string | 必需 | 账号 ID（用于浏览器会话管理） |
| headless | boolean | true | 是否使用无头模式 |
| timeout | number | 60000 | 超时时间（毫秒） |
| maxBloggers | number | 10 | 最多采集博主数量 |
| maxNotes | number | 20 | 每个博主最多采集笔记数量 |

---

## 📈 性能优化建议

### 1. 并发控制

```typescript
// 单个浏览器上下文，避免被封
const scraper = new XiaohongshuScraper({
  accountId: 'single-account',
  maxBloggers: 10,
});
```

### 2. 数据缓存

```typescript
// 缓存已采集的博主数据，避免重复采集
const cache = new Map<string, BloggerProfile>();
```

### 3. 增量采集

```typescript
// 只采集新笔记，跳过已采集的
if (!existingNotes.has(noteId)) {
  await collectNote(noteId);
}
```

---

## 🐛 常见问题

### Q1: 采集到的数据为空

**原因**: 
- Cookie 已过期
- 选择器失效
- 页面结构变化

**解决方案**:
1. 更新 Cookie
2. 运行验证脚本检查选择器
3. 使用浏览器开发者工具检查实际 DOM

### Q2: 采集速度慢

**原因**:
- 网络延迟
- 等待时间过长

**解决方案**:
1. 调整 `timeout` 参数
2. 减少 `maxBloggers` 和 `maxNotes`
3. 使用更快的网络环境

### Q3: 被限制访问

**原因**:
- 采集频率过高
- 触发反爬机制

**解决方案**:
1. 降低采集频率
2. 添加随机延迟
3. 更换 Cookie 或 IP

---

## 📝 更新日志

### v1.0.0 (2026-03-07)

- ✅ 创建搜索页面选择器
- ✅ 创建用户主页选择器
- ✅ 创建笔记详情页选择器
- ✅ 实现采集服务核心功能
- ✅ 创建测试脚本
- ✅ 编写功能文档

---

## 🔗 相关链接

- [搜索选择器配置](./src/config/xiaohongshu-search-selectors.ts)
- [用户主页选择器](./src/config/xiaohongshu-user-selectors.ts)
- [笔记详情页选择器](./src/config/xiaohongshu-note-selectors.ts)
- [采集服务实现](./src/services/xiaohongshu-scraper.service.ts)
- [测试脚本](./test-xiaohongshu-scraper.mjs)

---

**文档维护者**: HT-PM 📋  
**最后更新**: 2026-03-07 11:30 CST
