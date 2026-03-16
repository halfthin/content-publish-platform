# 微博发布器快速开始指南

## 🚀 5 分钟快速上手

### 步骤 1: 获取微博 Cookie

1. 打开浏览器，访问 [https://weibo.com](https://weibo.com)
2. 登录你的微博账号
3. 使用 **EditThisCookie** 扩展导出 Cookie（JSON 格式）
4. 复制 Cookie JSON 内容

详细步骤见：[Cookie 获取指南](./COOKIE_GUIDE.md)

---

### 步骤 2: 配置环境变量

```bash
# 编辑 .env 文件
cd /home/halfthin/dev/content-publish-platform

# 添加 Cookie 加密密钥（如果没有）
COOKIE_ENCRYPTION_KEY=your-secret-key-here

# 设置 Playwright 模式（首次测试建议关闭无头模式）
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_SLOW_MO=100
```

---

### 步骤 3: 添加微博账号

通过管理界面或 API 添加微博账号：

**API 方式**:
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "weibo",
    "name": "测试微博账号",
    "encryptedCookies": "加密后的 Cookie 数据",
    "encryptionPassword": "your-secret-key-here"
  }'
```

**管理界面**:
1. 访问 http://localhost:8080
2. 进入 **账号管理**
3. 点击 **添加账号**
4. 选择平台：**微博**
5. 粘贴 Cookie JSON
6. 设置加密密码
7. 保存

---

### 步骤 4: 发布第一条微博

**方式一：通过管理界面**

1. 访问 http://localhost:8080
2. 进入 **内容管理** > **新建内容**
3. 填写内容：
   - 标题：我的第一条自动化微博
   - 描述：这是通过内容发布平台发布的测试微博 #自动化# #测试#
   - 图片：上传 1-9 张图片（可选）
   - 标签：添加话题标签
4. 选择发布平台：**微博**
5. 选择账号：**测试微博账号**
6. 点击 **立即发布**

**方式二：通过 API**

```bash
curl -X POST http://localhost:3000/api/publish \
  -H "Content-Type: application/json" \
  -d '{
    "contentId": "test-001",
    "accountId": "weibo-account-id",
    "platform": "weibo",
    "content": {
      "title": "我的第一条自动化微博",
      "description": "这是通过内容发布平台发布的测试微博",
      "images": ["/path/to/image1.jpg"],
      "tags": ["自动化", "测试"]
    }
  }'
```

**方式三：通过代码**

```typescript
import { addPublishJob } from './apps/server/src/queues/publish-queue';

await addPublishJob({
  contentId: 'test-001',
  accountId: 'weibo-account-id',
  platform: 'weibo',
  content: {
    title: '我的第一条自动化微博',
    description: '这是通过内容发布平台发布的测试微博',
    images: ['/path/to/image1.jpg'],
    tags: ['自动化', '测试'],
  },
});
```

---

### 步骤 5: 查看发布结果

**查看日志**:
```bash
# Docker 模式
docker-compose -f docker/docker-compose.yml logs -f server

# 本地开发模式
bun run dev 2>&1 | grep weibo
```

**查看发布状态**:
```bash
# 查看队列状态
curl http://localhost:3000/api/queue/stats

# 查看任务状态
curl http://localhost:3000/api/jobs/{jobId}
```

**查看微博**:
访问微博个人主页，确认发布的微博

---

## 📝 完整示例

### 示例 1: 发布纯文字微博

```typescript
await addPublishJob({
  contentId: 'text-only-001',
  accountId: 'weibo-001',
  platform: 'weibo',
  content: {
    title: '文字微博',
    description: '这是一条纯文字测试微博，没有任何图片',
    tags: ['文字微博', '测试'],
  },
});
```

---

### 示例 2: 发布带图片的微博

```typescript
await addPublishJob({
  contentId: 'image-001',
  accountId: 'weibo-001',
  platform: 'weibo',
  content: {
    title: '图片微博',
    description: '这是一条带图片的测试微博',
    images: [
      '/path/to/image1.jpg',
      '/path/to/image2.jpg',
      '/path/to/image3.jpg',
    ],
  },
});
```

---

### 示例 3: 发布带话题的微博

```typescript
await addPublishJob({
  contentId: 'topic-001',
  accountId: 'weibo-001',
  platform: 'weibo',
  content: {
    title: '话题微博',
    description: '这是一条带多个话题的测试微博',
    tags: ['自动化发布', '微博机器人', '效率工具'],
  },
});
```

---

### 示例 4: 完整功能（文字 + 图片 + 话题）

```typescript
await addPublishJob({
  contentId: 'full-001',
  accountId: 'weibo-001',
  platform: 'weibo',
  content: {
    title: '完整测试',
    description: '这是一条完整的测试微博，包含文字、图片和话题标签，展示所有功能',
    images: [
      '/path/to/image1.jpg',
      '/path/to/image2.jpg',
      '/path/to/image3.jpg',
      '/path/to/image4.jpg',
    ],
    tags: ['完整测试', '自动化', '微博发布器'],
  },
});
```

---

## 🔍 故障排查

### 问题 1: 发布失败，提示未登录

**症状**: 
```
Error: Login status check failed
```

**解决方案**:
1. Cookie 可能已过期
2. 重新获取 Cookie 并更新
3. 验证 Cookie 格式正确

---

### 问题 2: 图片上传失败

**症状**:
```
Error: Image upload button not found
```

**解决方案**:
1. 检查页面是否完全加载
2. 检查图片路径是否正确
3. 检查图片格式（支持 JPG/PNG/GIF）
4. 检查图片大小（单张不超过 10MB）

---

### 问题 3: 发布按钮找不到

**症状**:
```
Error: Publish button not found
```

**解决方案**:
1. 检查是否已登录
2. 检查是否有发布权限
3. 更新 weibo-selectors.ts 中的选择器

---

### 问题 4: 队列任务不执行

**症状**:
- 任务添加到队列但没有执行

**解决方案**:
```bash
# 检查 Redis 是否运行
docker-compose ps

# 检查 Worker 是否启动
docker-compose logs -f server | grep "Worker started"

# 重启服务
docker-compose restart
```

---

## 📚 相关文档

- [微博发布器实现说明](./WEIBO_PUBLISHER.md) - 详细技术文档
- [Cookie 获取指南](./COOKIE_GUIDE.md) - Cookie 管理教程
- [测试报告](./WEIBO_TEST_REPORT.md) - 完整测试结果
- [README](../README.md) - 项目总体说明

---

## ⚡ 快捷命令

```bash
# 启动所有服务（Docker 模式）
docker-compose -f docker/docker-compose.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.yml down

# 本地开发
bun install
bun run db:generate
bun run db:migrate
bun run dev

# 查看队列状态
curl http://localhost:3000/api/queue/stats

# 测试发布
curl -X POST http://localhost:3000/api/publish \
  -H "Content-Type: application/json" \
  -d '{"contentId":"test","accountId":"weibo-001","platform":"weibo","content":{"title":"测试","description":"测试微博"}}'
```

---

## 🎯 下一步

完成快速开始后，你可以：

1. ✅ 配置多个微博账号
2. ✅ 设置定时发布任务
3. ✅ 集成到现有工作流
4. ✅ 开发其他平台发布器（抖音、B 站等）

---

**需要帮助？** 查看完整文档或联系 HT-Action-Team

**最后更新**: 2026-03-02
