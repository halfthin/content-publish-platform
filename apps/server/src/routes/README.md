# 内容管理 API 文档

## 基础信息

- **Base URL**: `http://localhost:3000/api/contents`
- **认证**: 暂无（开发中）

---

## API 端点

### 1. 获取内容列表

```http
GET /api/contents
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页数量，默认 20 |
| status | string | 否 | 内容状态过滤 (PENDING/APPROVED/REJECTED/PUBLISHING/PUBLISHED/FAILED) |
| type | string | 否 | 内容类型过滤 (IMAGE/VIDEO/MIXED) |
| category | string | 否 | 分类过滤 |
| search | string | 否 | 搜索关键词（标题/描述/标签） |

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "内容标题",
      "status": "PENDING",
      "type": "IMAGE",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

### 2. 获取内容详情

```http
GET /api/contents/:id
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 内容 ID |

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "内容标题",
    "description": "描述",
    "type": "IMAGE",
    "status": "APPROVED",
    "basePath": "/path/to/content",
    "images": ["/path/to/image1.jpg"],
    "video": null,
    "mdFile": "/path/to/content.md",
    "previewUrls": ["/api/contents/uuid/files/image1.jpg"],
    "mdContent": "# Markdown 内容...",
    "reviewedBy": "admin",
    "reviewedAt": "2024-01-01T00:00:00.000Z",
    "reviewNote": "审核通过",
    "tags": ["标签 1", "标签 2"],
    "category": "分类",
    "publishCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 3. 获取内容文件（图片/视频预览）

```http
GET /api/contents/:id/files/*filepath
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 内容 ID |
| filepath | string | 文件相对路径 |

**响应：** 文件二进制数据（图片/视频）

---

### 4. 审核通过内容

```http
POST /api/contents/:id/approve
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 内容 ID |

**请求体：**

```json
{
  "reviewedBy": "admin",
  "note": "审核通过，内容优质"
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "APPROVED",
    "reviewedBy": "admin",
    "reviewedAt": "2024-01-01T00:00:00.000Z",
    "reviewNote": "审核通过，内容优质"
  },
  "message": "Content approved successfully"
}
```

---

### 5. 审核拒绝内容

```http
POST /api/contents/:id/reject
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 内容 ID |

**请求体：**

```json
{
  "reviewedBy": "admin",
  "note": "内容质量不符合要求"
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "REJECTED",
    "reviewedBy": "admin",
    "reviewedAt": "2024-01-01T00:00:00.000Z",
    "reviewNote": "内容质量不符合要求"
  },
  "message": "Content rejected successfully"
}
```

---

### 6. 扫描收件箱

```http
POST /api/contents/scan-inbox
```

**说明：** 手动触发扫描 `/content/inbox/` 目录，发现新内容并创建数据库记录。

**响应示例：**

```json
{
  "success": true,
  "message": "Inbox scanned successfully"
}
```

---

### 7. 发布内容

```http
POST /api/contents/:id/publish
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 内容 ID |

**请求体：**

```json
{
  "platform": "xiaohongshu",
  "accountId": "account-uuid"
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "publish-log-uuid",
    "contentId": "content-uuid",
    "accountId": "account-uuid",
    "platform": "xiaohongshu",
    "status": "QUEUED"
  },
  "message": "Content queued for publishing"
}
```

---

### 8. 移动到已发布目录

```http
POST /api/contents/:id/move-to-published
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 内容 ID |

**请求体：**

```json
{
  "platform": "xiaohongshu"
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PUBLISHED",
    "publishCount": 1
  },
  "message": "Content moved to published"
}
```

---

## 内容状态说明

| 状态 | 说明 |
|------|------|
| PENDING | 待审核 |
| APPROVED | 已通过 |
| REJECTED | 已拒绝 |
| PUBLISHING | 发布中 |
| PUBLISHED | 已发布 |
| FAILED | 发布失败 |

---

## 内容类型说明

| 类型 | 说明 |
|------|------|
| IMAGE | 纯图片内容 |
| VIDEO | 纯视频内容 |
| MIXED | 图文混合内容 |

---

## 错误响应

```json
{
  "success": false,
  "error": "错误信息"
}
```
