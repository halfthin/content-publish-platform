# PublishPlan + 简化 Content 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 引入 PublishPlan 支持多平台分发，精简 Content 表只做追踪，改用 inbox/published 双目录

**Architecture:** Content 表去掉 description/images/type 等冗余字段，只存 id/relativePath/title/status。
新增 PublishPlan 表记录每个平台的分发计划。scanInbox 时写 metadata.json 持久化 id 关联。
发布成功后按 yyyy/MM/ 目录结构移入 published/。

**Tech Stack:** Bun + ElysiaJS + Prisma + PostgreSQL | UUID v7

---

### Task 1: Prisma schema — 精简 Content + 新增 PublishPlan

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: 替换 Content 模型**

```prisma
model Content {
  id              String        @id           // UUID v7
  relativePath    String        @unique       // 如 inbox/笔记12/
  title           String
  status          ContentStatus @default(PENDING)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  finishedAt      DateTime?

  publishPlans    PublishPlan[]

  @@index([status, createdAt])
  @@map("contents")
}
```

- [ ] **Step 2: 新增 PublishPlan 模型**

```prisma
model PublishPlan {
  id              String        @id @default(cuid())
  contentId       String
  platform        String
  accountId       String
  title           String?
  scheduledAt     DateTime?
  status          String        @default("PENDING")  // PENDING → PUBLISHING → DONE / FAILED
  errorMessage    String?
  errorCode       String?
  externalTaskId  String?
  publishedUrl    String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  finishedAt      DateTime?

  content         Content       @relation(fields: [contentId], references: [id])

  @@index([contentId])
  @@index([contentId, status])
  @@index([status])
  @@map("publish_plans")
}
```

- [ ] **Step 3: 修改 PublishLog 模型**

在 PublishLog 中增加 `publishPlanId` 可选字段：

```prisma
model PublishLog {
  // 保留所有现有字段
  publishPlanId String?       // 新增
  ...
}
```

- [ ] **Step 4: 删除无需的旧模型**

删除 `ContentType`、`ScheduledJob`、`ScheduledStatus` 枚举和模型（ScheduledJob 已不再需要，由 ht-queue 管理定时）。

- [ ] **Step 5: 生成迁移**

```bash
cd apps/server && npx prisma migrate dev --name publish-plan
```

- [ ] **Step 6: 提交**

```bash
git add apps/server/prisma/
git commit -m "feat: add PublishPlan model, simplify Content"
```

### Task 2: Content service — scanInbox 适配 metadata.json

**Files:**
- Rewrite: `apps/server/src/services/content.service.ts`

scanInbox 改为：
1. 遍历 `inbox/` 下所有子目录
2. 读每个目录的 `metadata.json`
3. 如果有 `id` 字段 → 查 DB，已存在就跳过
4. 如果没有 id → 生成 UUID v7，写 `metadata.json`，创建 Content 记录

- [ ] **Step 1: 写 scanInbox 核心逻辑**

```typescript
import { v7 as uuidv7 } from 'uuid';  // UUID v7
// 或使用 crypto.randomUUID() 配合自定义实现

export async function scanInbox(): Promise<void> {
  const inboxDir = join(CONTENT_BASE_DIR, 'inbox');
  const entries = await fs.readdir(inboxDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const dirName of dirs) {
    const dirPath = join(inboxDir, dirName);
    const metaPath = join(dirPath, 'metadata.json');

    let meta: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      meta = JSON.parse(raw);
    } catch {
      // 没有 metadata.json 或格式错误，创建默认
      meta = { title: dirName };
    }

    if (meta.id) {
      // 已有 ID，检查 DB 是否存在
      const existing = await prisma.content.findUnique({ where: { id: meta.id as string } });
      if (existing) continue;
    }

    // 新内容：生成 UUID v7
    const id = meta.id as string || crypto.randomUUID();
    const title = (meta.title as string) || dirName;
    const relativePath = `inbox/${dirName}`;

    // 写 metadata.json
    meta.id = id;
    meta.title = title;
    meta.createdAt = meta.createdAt || new Date().toISOString();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

    // 创建 Content 记录
    await prisma.content.create({
      data: { id, relativePath, title, status: 'PENDING' },
    });

    logger.info('New content scanned', { id, title, relativePath });
  }
}
```

注意：`crypto.randomUUID()` 在 Bun 中生成的是 UUID v4。如果需要严格的 UUID v7（时间有序），需要额外处理或使用 npm `uuid` 包的 v7 版本。

- [ ] **Step 2: 精简 getContents/getContentById**

去掉 description/type/images/video/tags/category 等字段的查询和返回。只用 Content 现有精简字段：

```typescript
export async function getContents(filter: ContentFilter = {}) {
  const where: Prisma.ContentWhereInput = {};
  if (filter.status) where.status = filter.status as ContentStatus;
  if (filter.search) where.title = { contains: filter.search };

  const [data, total] = await Promise.all([
    prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: ((filter.page || 1) - 1) * (filter.limit || 20),
      take: filter.limit || 20,
    }),
    prisma.content.count({ where }),
  ]);

  return { data, total, page: filter.page || 1, limit: filter.limit || 20, totalPages: Math.ceil(total / (filter.limit || 20)) };
}
```

- [ ] **Step 3: 重写 approveContent**

不再挪动目录。改为更新状态 + 创建 PublishPlan：

```typescript
export async function approveContent(
  contentId: string,
  platform: string,
  accountId: string,
  options?: { title?: string; reviewedBy?: string; note?: string; scheduledAt?: string },
) {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return null;
  if (content.status !== 'PENDING') throw new Error('Content is not PENDING');

  // 创建 PublishPlan
  const plan = await prisma.publishPlan.create({
    data: {
      contentId,
      platform,
      accountId,
      title: options?.title || content.title,
      scheduledAt: options?.scheduledAt ? new Date(options.scheduledAt) : null,
      status: 'PENDING',
    },
  });

  // 更新 Content 为 APPROVED
  await prisma.content.update({
    where: { id: contentId },
    data: {
      status: 'APPROVED',
      reviewedBy: options?.reviewedBy,
      reviewedAt: new Date(),
      reviewNote: options?.note,
    },
  });

  return { content: await prisma.content.findUnique({ where: { id: contentId } }), plan };
}
```

- [ ] **Step 4: 重写 moveToPublished — yyyy/MM/ 目录**

```typescript
export async function moveToPublished(contentId: string): Promise<void> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new Error('Content not found');

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const destDir = join(CONTENT_BASE_DIR, 'published', String(year), month);
  const srcPath = join(CONTENT_BASE_DIR, content.relativePath);
  const dirName = content.relativePath.split('/').pop() || contentId;
  const destPath = join(destDir, dirName);

  await fs.mkdir(destDir, { recursive: true });
  await fs.rename(srcPath, destPath);

  await prisma.content.update({
    where: { id: contentId },
    data: {
      status: 'PUBLISHED',
      relativePath: `published/${year}/${month}/${dirName}`,
      finishedAt: new Date(),
    },
  });
}
```

- [ ] **Step 5: 删除不再需要的函数**

删除 `moveToApproved()`、更新 `getContentById()`、`rejectContent()` 保持简单状态更新。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/services/content.service.ts
git commit -m "refactor: rewrite content service with metadata.json and PublishPlan"
```

### Task 3: Contents routes — approve 接口增加 platform/account

**Files:**
- Modify: `apps/server/src/routes/contents.ts`

- [ ] **Step 1: 更新 POST /:id/approve**

改为接受 `platform`、`accountId` 参数，创建 PublishPlan 并触发发布：

```typescript
.post(
  '/:id/approve',
  async ({ params, body }) => {
    const { id } = params;
    const { platform, accountId, title, reviewedBy, note, scheduledAt } = body as Record<string, unknown>;

    if (!platform || !accountId) {
      return { success: false, error: 'platform and accountId required' };
    }

    try {
      const result = await approveContent(
        id,
        platform as string,
        accountId as string,
        { title: title as string, reviewedBy: reviewedBy as string, note: note as string, scheduledAt: scheduledAt as string }
      );

      if (!result) {
        return { success: false, error: 'Content not found' };
      }

      // 入队 ht-queue
      const { enqueuePublish } = await import('../services/queue-client');
      await enqueuePublish(platform as string, {
        contentId: id,
        accountId: accountId as string,
        platform: platform as string,
        publishPlanId: result.plan.id,
        action: 'publish',
        content: { title: result.plan.title || result.content.title },
      });

      return {
        success: true,
        data: { content: result.content, plan: result.plan },
        message: 'Content approved and queued for publishing',
      };
    } catch (error) {
      logger.error('Error approving content:', error);
      return { success: false, error: String(error) };
    }
  },
  {
    body: t.Object({
      platform: t.String(),
      accountId: t.String(),
      title: t.Optional(t.String()),
      reviewedBy: t.Optional(t.String()),
      note: t.Optional(t.String()),
      scheduledAt: t.Optional(t.String()),
    }),
  }
)
```

- [ ] **Step 2: 移除 POST /:id/publish 端点**

该端点 (`POST /:id/publish`) 不再需要，因为发布逻辑已合并到 approve 中。直接删除此路由。

- [ ] **Step 3: 清理不用的 import**

移除 `addPublishJob`、`moveToApproved`、`moveToPublished` 等不再使用的导入。

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/routes/contents.ts
git commit -m "feat: update approve endpoint to create PublishPlan and trigger publish"
```

### Task 4: Callback handler — 发布完成后更新 PublishPlan

**Files:**
- Modify: `apps/server/src/routes/queues/xhs.callback.ts`

- [ ] **Step 1: 发布成功后更新 PublishPlan**

成功时：
```typescript
await prisma.publishPlan.update({
  where: { id: data.publishPlanId },
  data: { status: 'DONE', publishedUrl: result.publishedUrl, finishedAt: new Date() },
});
```

失败时：
```typescript
await prisma.publishPlan.update({
  where: { id: data.publishPlanId },
  data: { status: 'FAILED', errorMessage: errMsg, finishedAt: new Date() },
});
```

- [ ] **Step 2: 所有 PublishPlan 完成后更新 Content 并挪目录**

发布成功后，检查该 Content 是否还有未完成的 PublishPlan。全部完成后调用 `moveToPublished()`：

```typescript
// 检查是否还有未完成的计划
const remaining = await prisma.publishPlan.count({
  where: { contentId, status: { notIn: ['DONE', 'FAILED'] } },
});

if (remaining === 0) {
  // 全部完成，移入 published/
  const allFailed = await prisma.publishPlan.count({
    where: { contentId, status: 'FAILED' },
  });
  if (allFailed === 0) {
    await moveToPublished(contentId);
  } else {
    // 有失败的，标记 Content FAILED
    await prisma.content.update({
      where: { id: contentId },
      data: { status: 'FAILED', finishedAt: new Date() },
    });
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/routes/queues/xhs.callback.ts
git commit -m "feat: update PublishPlan status after publish, move to published on completion"
```

### Task 5: Update enqueue payload to include publishPlanId

**Files:**
- Modify: `apps/server/src/services/queue-client.ts`
- Modify: `apps/server/src/queues/publish-queue.ts`

- [ ] **Step 1: 在 PublishJobData 中加入 publishPlanId**

```typescript
export interface PublishJobData {
  publishPlanId?: string;  // 新增
  // ... 其他现有字段
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/services/queue-client.ts apps/server/src/queues/publish-queue.ts
git commit -m "feat: add publishPlanId to PublishJobData"
```

### Task 6: Remove old frontend publish endpoint and simplify API

**Files:**
- Modify: `apps/server/src/routes/publish.ts`
- Modify: `apps/server/src/routes/publish-status.ts`

- [ ] **Step 1: 清理旧 publish 路由**

`POST /api/publish` 不再通过外部接口（统一到 approve 流程）。保留或标记为 deprecated。

- [ ] **Step 2: 提交**

```bash
git add apps/server/src/routes/publish.ts
git commit -m "refactor: deprecate standalone publish endpoint"
```
