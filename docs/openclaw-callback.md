# OpenClaw 回调协议

本文档说明 CPP 接收 OpenClaw / Gateway 媒体动作回调的统一方式，当前重点用于 `image-to-image`（图生图）结果回流。

## 1. 接口地址

```http
POST /api/webhook/media-actions/:actionType/result
```

示例：

```http
POST /api/webhook/media-actions/image-to-image/result
```

## 2. 认证方式

请求头必须带：

```http
Authorization: Bearer <MEDIA_ACTION_FROM_GATEWAY_TOKEN>
```

未通过认证时返回：

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

## 3. 支持的请求方式

### 3.1 JSON 回调

适合：

- `queued`
- `running`
- `needs-auth`
- `failed`
- `success`（仅回状态，不上传文件）

```http
Content-Type: application/json
```

```json
{
  "version": "1.0",
  "eventId": "evt-img-001",
  "taskId": "ext-img-001",
  "source": "openclaw",
  "kind": "media-action",
  "actionType": "image-to-image",
  "status": "running",
  "refs": {
    "mediaActionId": "media-action-id"
  },
  "result": {
    "summary": "处理中"
  },
  "timestamp": "2026-04-11T09:00:00.000Z"
}
```

### 3.2 multipart 文件回调

适合图生图成功后，把生成结果图片直接上传给 CPP。

```http
Content-Type: multipart/form-data
```

表单字段：

- `payload`: JSON 字符串，结构与 JSON 回调完全一致
- `files`: 一个或多个图片文件，允许重复同名字段

示例：

```bash
curl -X POST 'http://cpp.local/api/webhook/media-actions/image-to-image/result' \
  -H 'Authorization: Bearer MEDIA_ACTION_FROM_GATEWAY_TOKEN' \
  -F 'payload={"version":"1.0","eventId":"evt-img-upload-001","taskId":"ext-img-upload-001","source":"openclaw","kind":"media-action","actionType":"image-to-image","status":"success","refs":{"mediaActionId":"media-action-id"},"result":{"summary":"生成完成"},"timestamp":"2026-04-11T09:00:00.000Z"}' \
  -F 'files=@./generated-1.png' \
  -F 'files=@./generated-2.png'
```

## 4. 统一 payload 字段

| 字段 | 说明 |
| --- | --- |
| `version` | 当前固定为 `1.0` |
| `eventId` | 回调事件 ID，用于幂等去重 |
| `taskId` | OpenClaw / Gateway 外部任务 ID |
| `source` | `openclaw` 或 `gateway` |
| `kind` | 当前为 `media-action` |
| `actionType` | 如 `image-to-image` |
| `status` | `queued` / `running` / `success` / `failed` / `needs-auth` |
| `refs.mediaActionId` | CPP 内部 media action ID，强烈建议传 |
| `result.summary` | 简要结果描述 |
| `result.artifacts` | 可选，外部已生成的产物描述 |
| `result.extra` | 可选，附加结构化数据 |
| `error` | 失败或需要人工处理时的错误信息 |
| `timestamp` | 回调时间，ISO 字符串 |

## 5. 成功响应

### 5.1 普通成功

```json
{
  "success": true,
  "data": {
    "eventId": "evt-img-001",
    "taskId": "ext-img-001",
    "actionType": "image-to-image",
    "status": "running",
    "upload": null
  }
}
```

### 5.2 带文件上传的成功

```json
{
  "success": true,
  "data": {
    "eventId": "evt-img-upload-001",
    "taskId": "ext-img-upload-001",
    "actionType": "image-to-image",
    "status": "success",
    "upload": {
      "fileCount": 2,
      "directory": "uploaded/openclaw/2026/04/11/ext-img-upload-001",
      "manifestPath": "uploaded/openclaw/2026/04/11/ext-img-upload-001/manifest.json"
    }
  }
}
```

### 5.3 重复回调

当 `eventId` 已处理过时：

```json
{
  "success": true,
  "duplicate": true,
  "data": {
    "eventId": "evt-img-upload-001",
    "taskId": "ext-img-upload-001",
    "actionType": "image-to-image",
    "status": "success",
    "upload": null
  }
}
```

## 6. 文件落地规则

上传成功后，CPP 会把文件保存到：

```txt
content/uploaded/openclaw/YYYY/MM/DD/<taskId>/
```

并生成：

```txt
manifest.json
```

说明：

- 文件名会做安全清洗，并按顺序重命名，如 `01-generated-1.png`
- 结果会回填到 media action 的 `callbackPayload.result`
- 上传文件信息会进入：
  - `result.artifacts`
  - `result.extra.upload`

## 7. 当前限制

当前服务端限制如下：

- 最多 **50** 张图片
- 单次请求总大小最多 **200MB**
- 仅接受图片文件；非图片将返回 `400`

## 8. 建议

- `refs.mediaActionId` 建议始终传，避免仅靠 `taskId` 反查
- `actionType` 应与 URL 中的 `:actionType` 保持一致
- 图生图成功回调优先使用 multipart，这样 CPP 能直接持久化结果文件
