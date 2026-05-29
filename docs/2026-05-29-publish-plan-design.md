# PublishPlan + 简化 Content 设计

## 背景

多平台内容分发需求 + 当前 Content 表冗余（图文字段存 DB 无意义）。
重新设计：Content 只做追踪，文件是真实数据源。

## 文件结构

```
{CONTENT_DIR}/
├── inbox/
│   ├── 笔记12/                   ← 待发布内容
│   │   ├── metadata.json         ← { id, createdAt, title, ... }
│   │   ├── content.md
│   │   └── 01.jpg
│   └── 笔记13/
└── published/
    └── 2026/
        └── 05/
            ├── 笔记12/           ← 全部平台发布完成后移入
            └── 笔记13/
```

- 只有 `inbox` 和 `published` 两个目录，取消 `approved`
- Pending/Approved 状态都在 DB 的 Content.status 追踪
- inbox 里同时存在 PENDING 和 APPROVED 的内容
- `published/` 按 `yyyy/MM/` 分目录，避免单文件夹过多
- 所有 PublishPlan 都完成才移入 published/

## 数据模型

### Content 表（精简）

```prisma
model Content {
  id              String        @id           // UUID v7
  relativePath    String        @unique       // 如 inbox/笔记12/
  title           String                      // 列表展示用
  status          ContentStatus @default(PENDING)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  finishedAt      DateTime?
  platformCount   Int           @default(1)   // 计划发布的平台数

  publishPlans    PublishPlan[]

  @@index([status, createdAt])
  @@map("contents")
}
```

### PublishPlan 表（新增）

```prisma
model PublishPlan {
  id              String        @id @default(cuid())
  contentId       String
  platform        String
  accountId       String
  title           String?       // 平台专属标题，不设则用 Content.title
  status          String        @default("PENDING")  // PENDING → PUBLISHING → DONE / FAILED
  errorMessage    String?
  errorCode       String?
  externalTaskId  String?       // ht-queue taskId
  publishedUrl    String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  finishedAt      DateTime?

  content         Content       @relation(fields: [contentId], references: [id])
  publishLogs     PublishLog[]

  @@index([contentId])
  @@index([content, status])
  @@index([status])
  @@map("publish_plans")
}
```

### PublishLog 表（新增 publishPlanId 关联）

```prisma
model PublishLog {
  // 现有字段保持不变
  publishPlanId   String?       // 新增
  publishPlan     PublishPlan?  @relation(fields: [publishPlanId], references: [id])
  // ...
}
```

## 完整流转

### scanInbox

```
scan inbox/
  → 遍历 inbox/ 下所有子目录
  → 对每个目录:
      读 metadata.json
      如果有 { id } → Content 已存在，跳过
      如果没有 id → 新内容:
        生成 UUID v7
        写 metadata.json: { id, title, createdAt }
        create Content { id, relativePath, title, status: PENDING }
```

注意：scan 时从 metadata.json 读 title。如果目录已有 metadata.json（之前 scan 过），通过 id 判断是否已入库。

### approve

```
POST /api/contents/:id/approve { platform, accountId, title?, description? }
  → 校验 Content.status === PENDING
  → create PublishPlan { contentId, platform, accountId, title?, ... }
  → Content.status = APPROVED
  → enqueue to ht-queue（自动触发发布）
  → return { planId, taskId }
```

### 多平台扩展

```
POST /api/contents/:id/approve { platform: xiaohongshu }  → PublishPlan #1
POST /api/contents/:id/approve { platform: weibo }        → PublishPlan #2
```

Content 的状态机：

| status | 条件 |
|--------|------|
| PENDING | 待审核，无 PublishPlan |
| APPROVED | 至少一个 PublishPlan，无失败 |
| FAILED | 有 PublishPlan FAILED（可重试） |
| PUBLISHED | 所有 PublishPlan 均为 DONE |

当所有 PublishPlan DONE → Content PUBLISHED，内容移入 published/yyyy/MM/。

### file-watcher

监听 `inbox/` 下所有子目录（已有 `recursive: true`）。检测到新文件时触发 `scanInbox()`。

## 不做的事

- Content 表不存 description/images/type
- 不按平台分 inbox 子目录
- 不设 approved/ 目录
- 文件监听逻辑不变
