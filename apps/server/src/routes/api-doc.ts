import { Elysia } from 'elysia';

type OpenApiSchema = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const jsonContent = (schema: OpenApiSchema, example?: unknown) => ({
  'application/json': {
    schema,
    ...(example === undefined ? {} : { example }),
  },
});

const binaryContent = {
  'application/octet-stream': {
    schema: {
      type: 'string',
      format: 'binary',
    },
  },
};

const textEventStreamContent = {
  'text/event-stream': {
    schema: ref('ProgressEventStream'),
    example:
      'data: {"type":"publish","platform":"system","status":"connected"}\n\n' +
      'data: {"type":"publish","jobId":"job-001","platform":"xiaohongshu","status":"RUNNING","progress":60}\n\n',
  },
};

const envelope = (dataSchema: OpenApiSchema) => ({
  allOf: [
    ref('ApiEnvelope'),
    {
      type: 'object',
      properties: {
        data: dataSchema,
      },
    },
  ],
});

function jsonResponse(
  description = 'JSON response',
  dataSchema?: OpenApiSchema,
  example?: unknown
) {
  return {
    description,
    content: jsonContent(dataSchema ? envelope(dataSchema) : ref('ApiEnvelope'), example),
  };
}

function directJsonResponse(description: string, schema: OpenApiSchema, example?: unknown) {
  return {
    description,
    content: jsonContent(schema, example),
  };
}

function errorResponse(
  description: string,
  example: unknown = { success: false, error: description }
) {
  return directJsonResponse(description, ref('ErrorEnvelope'), example);
}

function binaryResponse(description = 'Binary file response') {
  return {
    description,
    content: binaryContent,
  };
}

function requestBody(schema: OpenApiSchema, example?: unknown, description?: string) {
  return {
    description,
    required: true,
    content: jsonContent(schema, example),
  };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

function pathParam(name: string, description?: string) {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string' },
  };
}

function queryParam(
  name: string,
  schema: Record<string, unknown> = { type: 'string' },
  description?: string
) {
  return {
    name,
    in: 'query',
    required: false,
    description,
    schema,
  };
}

const platformSchema = {
  type: 'string',
  enum: ['xiaohongshu', 'weibo', 'douyin', 'bilibili', 'wechat'],
  description: 'Publishing platform identifier used by filters, accounts, publish jobs, and logs.',
};

const contentStatusSchema = {
  type: 'string',
  enum: ['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHING', 'PUBLISHED', 'FAILED'],
  description:
    'Content workflow state. UI should gate actions: approve/reject for PENDING, publish for APPROVED, retry from publish logs for FAILED.',
};

const publishStatusSchema = {
  type: 'string',
  enum: [
    'PENDING',
    'QUEUED',
    'RUNNING',
    'NEEDS_AUTH',
    'USER_INTERVENING',
    'RESUMED',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'RETRYING',
  ],
};

const accountStatusSchema = {
  type: 'string',
  enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED'],
};

const loginStatusSchema = {
  type: 'string',
  enum: ['LOGGED_IN', 'EXPIRED', 'UNKNOWN', 'CHECKING'],
};

const cookieSchema = {
  type: 'object',
  description:
    'Browser cookie object. domain or url is needed during normalization; name and value are required.',
  properties: {
    name: { type: 'string', example: 'a1' },
    value: { type: 'string', example: 'cookie-value' },
    domain: { type: 'string', example: '.xiaohongshu.com' },
    url: { type: 'string', example: 'https://www.xiaohongshu.com' },
    path: { type: 'string', example: '/' },
    expires: { type: 'number', nullable: true },
    httpOnly: { type: 'boolean' },
    secure: { type: 'boolean' },
    sameSite: { type: 'string' },
  },
  required: ['name', 'value'],
  additionalProperties: true,
};

const publishPayloadSchema = {
  type: 'object',
  description:
    'Payload sent to Publisher Framework. For XHS image/text use title, description/content, images, tags and optional scheduling fields.',
  properties: {
    title: { type: 'string', example: '今天的穿搭分享' },
    description: { type: 'string', example: '上衣是... 裤子是... 这套适合通勤。' },
    content: { type: 'string', example: '上衣是... 裤子是... 这套适合通勤。' },
    images: {
      type: 'array',
      items: { type: 'string' },
      example: ['/data/content/approved/note-001/01.jpg'],
    },
    video: { type: 'string', example: '/data/content/approved/note-001/video.mp4' },
    tags: { type: 'array', items: { type: 'string' }, example: ['穿搭', '通勤'] },
    basePath: { type: 'string', example: '/data/content/approved/note-001' },
    scheduleAt: { type: 'string', example: '2026-05-18T09:00:00+08:00' },
    visibility: { type: 'string', example: 'public' },
    isOriginal: { type: 'boolean', example: true },
    products: { type: 'array', items: {}, nullable: true },
  },
  additionalProperties: true,
};

const rootInfoExample = {
  name: 'Content Publish Platform API',
  version: '1.0.0',
  status: 'running',
};

const healthExample = {
  status: 'ok',
  timestamp: '2026-05-17T00:00:00.000Z',
};

const readinessExample = {
  status: 'ready',
  checks: {
    env: { status: 'ok' },
    database: { status: 'ok' },
    redis: { status: 'ok' },
    contentDir: { status: 'ok' },
    gateway: { status: 'ok' },
  },
  timestamp: '2026-05-17T00:00:00.000Z',
};

const contentExample = {
  id: 'content-001',
  title: '今天的穿搭分享',
  description: '上衣是... 裤子是... 这套适合通勤。',
  type: 'IMAGE',
  status: 'PENDING',
  basePath: '/data/content/inbox/note-001',
  images: ['/data/content/inbox/note-001/01.jpg', '/data/content/inbox/note-001/02.jpg'],
  video: null,
  mdFile: '/data/content/inbox/note-001/content.md',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  tags: ['穿搭', '通勤'],
  category: '日常',
  publishCount: 0,
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:00.000Z',
};

const accountExample = {
  id: 'account-001',
  platform: 'xiaohongshu',
  name: 'xhs-1',
  username: 'optional-user-name',
  groupId: 'group-001',
  status: 'ACTIVE',
  loginStatus: 'LOGGED_IN',
  dailyLimit: 10,
  todayPublished: 0,
  healthScore: 100,
  warningFlags: [],
  notes: '主账号',
  cookieUpdatedAt: '2026-05-17T00:00:00.000Z',
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:00.000Z',
};

const publishLogExample = {
  id: 'publish-log-001',
  contentId: 'content-001',
  accountId: 'account-001',
  jobId: 'job-001',
  platform: 'xiaohongshu',
  status: 'QUEUED',
  externalTaskId: null,
  publishedUrl: null,
  errorMessage: null,
  errorCode: null,
  callbackPayload: null,
  retryCount: 0,
  maxRetries: 3,
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:00.000Z',
};

const queuedJobExample = {
  success: true,
  data: { jobId: 'job-001', status: 'QUEUED' },
};

const genericPublishRequestSchema = objectSchema(
  {
    platform: platformSchema,
    accountId: { type: 'string' },
    accountName: {
      type: 'string',
      description: 'Optional routing hint for XHS MCP instance/account matching.',
    },
    action: {
      type: 'string',
      example: 'publish',
      description: 'Publisher action, e.g. publish or publish_video for XHS.',
    },
    payload: publishPayloadSchema,
  },
  ['platform', 'accountId', 'action']
);

const xhsPublishRequestSchema = objectSchema(
  {
    accountId: { type: 'string' },
    accountName: { type: 'string', description: 'Optional MCP instance/account hint.' },
    title: { type: 'string' },
    content: { type: 'string', description: 'XHS note body.' },
    images: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    scheduleAt: { type: 'string' },
    visibility: { type: 'string' },
    isOriginal: { type: 'boolean' },
    products: { type: 'array', items: {} },
  },
  ['accountId', 'title', 'content']
);

const xhsVideoPublishRequestSchema = objectSchema(
  {
    accountId: { type: 'string' },
    accountName: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    video: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    visibility: { type: 'string' },
    products: { type: 'array', items: {} },
  },
  ['accountId', 'title', 'content', 'video']
);

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Content Publish Platform API',
    version: '1.0.0',
    summary: 'Server-only API service for content review, account auth, and publishing.',
    description: [
      'This OpenAPI document is the primary contract for frontend implementation agents.',
      '',
      'Frontend design guidance:',
      '- Build the main IA around Contents, Accounts, Publish Status, XHS MCP, and Realtime progress.',
      '- The canonical content workflow is inbox scan → PENDING review → APPROVED publish → PUBLISHED/FAILED status.',
      '- Use status enums to gate UI actions instead of hard-coding route availability.',
      '- File endpoints return binary data and are intended for previews/downloads, not JSON clients.',
      '- `/api/xhs/*` is the direct XHS MCP convenience surface; `/api/publish` is the generic Publisher Framework surface.',
      '- `/api/media/*` and `/api/media/actions/*` are legacy/material-workflow APIs that are still mounted but not required for the service-only publishing MVP.',
      '',
      'Production access control:',
      '- Production management APIs under `/api/*` require `Authorization: Bearer <API_AUTH_TOKEN>` unless the route is a webhook callback.',
      '- Webhook callbacks use independent gateway callback tokens such as `CPP_FROM_GATEWAY_TOKEN` and are not authorized by `API_AUTH_TOKEN`.',
      '- `/docs` and `/docs/openapi.json` may be disabled in production when `EXPOSE_DOCS=false`.',
      '',
      'Narrative documentation lives in docs/API.md and is kept synchronized by apps/server/src/routes/api-doc.test.ts.',
    ].join('\n'),
  },
  servers: [
    {
      url: 'http://localhost:50000',
      description: 'Local Bun/Elysia API service. PORT controls the actual port.',
    },
  ],
  tags: [
    {
      name: 'Health',
      description: 'Service liveness and basic runtime metadata. Use for shell/ops smoke checks.',
      'x-ui': { nav: false },
    },
    {
      name: 'Contents',
      description:
        'Content ingestion and review workflow. Frontend should model this as a review queue with detail preview and publish action once approved.',
      'x-ui': {
        navLabel: '内容库',
        primaryViews: ['list', 'detail', 'review-panel', 'publish-panel'],
        stateMachine: 'PENDING -> APPROVED/REJECTED -> PUBLISHING -> PUBLISHED/FAILED',
      },
    },
    {
      name: 'Accounts',
      description:
        'Publishing account management, cookie import, login status checks, and account status toggles.',
      'x-ui': {
        navLabel: '账号管理',
        primaryViews: ['account-list', 'account-detail', 'cookie-import-dialog'],
      },
    },
    {
      name: 'PublishStatus',
      description:
        'Publish logs, statistics, queue job state, and retry controls. Use as the operational dashboard after publishing.',
      'x-ui': { navLabel: '发布状态', primaryViews: ['dashboard', 'history-table'] },
    },
    {
      name: 'Publish',
      description:
        'Generic Publisher Framework endpoints plus SSE progress stream for task-oriented clients.',
      'x-ui': { navLabel: '任务进度', primaryViews: ['progress-console'] },
    },
    {
      name: 'XHS',
      description:
        'Xiaohongshu MCP direct APIs for QR login, login status, image/text publish, and video publish.',
      'x-ui': { navLabel: '小红书', primaryViews: ['login-card', 'quick-publish-form'] },
    },
    {
      name: 'Media',
      description:
        'Legacy media library browser. Still mounted; not required for the service-only publishing MVP unless the UI needs asset browsing.',
      'x-ui': { navLabel: '素材库', legacy: true },
    },
    {
      name: 'MediaActions',
      description:
        'Legacy/OpenClaw media action workflow. Useful for image-to-image results; not on the critical XHS publishing path.',
      'x-ui': { navLabel: '素材动作', legacy: true },
    },
    {
      name: 'Webhooks',
      description:
        'Machine-to-machine callback endpoints. Hide from normal end-user navigation; expose only in integration settings.',
      'x-ui': { nav: false, integrationOnly: true },
    },
    {
      name: 'Realtime',
      description: 'WebSocket notifications for content and media action updates.',
      'x-ui': { nav: false, integrationOnly: true },
    },
  ],
  'x-frontend-agent': {
    intendedConsumer: 'ui-ux-pro-max or equivalent frontend design agent',
    designPriority: [
      'Content review and publish workflow',
      'Account/cookie/login health workflow',
      'Publish status dashboard and retry workflow',
      'XHS MCP login and quick publish workflow',
    ],
    mvpNavigation: ['内容库', '账号管理', '发布状态', '小红书'],
    optionalNavigation: ['素材库', '素材动作'],
    implementationNotes: [
      'Prefer optimistic refresh after mutations; most mutation responses include success/message/data.',
      'Binary preview URLs should be assigned directly to img/video src after encoding wildcard path segments.',
      'For XHS publishing from approved content, prefer POST /api/contents/{id}/publish over direct /api/xhs/publish so PublishLog and content archiving stay consistent.',
      'Use /api/publish/progress SSE for live task feedback and /ws for broad app notifications.',
    ],
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API_AUTH_TOKEN',
        description:
          'Production management API token. Send as Authorization: Bearer <API_AUTH_TOKEN> for protected /api/* routes except webhook callbacks.',
      },
      webhookBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'CPP_FROM_GATEWAY_TOKEN',
        description:
          'Machine-to-machine callback token for webhook routes. This is intentionally independent from API_AUTH_TOKEN.',
      },
    },
    schemas: {
      ApiEnvelope: {
        type: 'object',
        description:
          'Common response envelope. Some binary endpoints return raw bytes instead of this shape.',
        properties: {
          success: { type: 'boolean' },
          data: { nullable: true },
          error: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['success'],
      },
      ErrorEnvelope: {
        allOf: [ref('ApiEnvelope')],
        example: { success: false, error: 'Content not found' },
      },
      RootInfo: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['name', 'version', 'status'],
      },
      HealthCheck: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['status', 'timestamp'],
      },
      ReadinessCheck: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'warn', 'error'] },
          message: { type: 'string' },
        },
        required: ['status'],
      },
      ReadinessStatus: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ready', 'unready'] },
          checks: {
            type: 'object',
            additionalProperties: ref('ReadinessCheck'),
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['status', 'checks', 'timestamp'],
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer', minimum: 0 },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1 },
          totalPages: { type: 'integer', minimum: 0 },
          offset: { type: 'integer', minimum: 0 },
        },
      },
      Platform: platformSchema,
      ContentType: { type: 'string', enum: ['IMAGE', 'VIDEO', 'MIXED'] },
      ContentStatus: contentStatusSchema,
      AccountStatus: accountStatusSchema,
      LoginStatus: loginStatusSchema,
      PublishStatus: publishStatusSchema,
      AccountGroup: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          platform: platformSchema,
          name: { type: 'string', example: '默认分组' },
          description: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Account: {
        type: 'object',
        description:
          'Publishing account. Cookie payload is encrypted and intentionally not returned as plain cookies.',
        properties: {
          id: { type: 'string' },
          platform: platformSchema,
          name: { type: 'string' },
          username: { type: 'string', nullable: true },
          groupId: { type: 'string' },
          group: ref('AccountGroup'),
          encryptedCookies: {
            type: 'string',
            nullable: true,
            description: 'Encrypted cookie blob; frontend should not display raw value.',
          },
          cookieUpdatedAt: { type: 'string', format: 'date-time', nullable: true },
          cookieHealthScore: { type: 'integer', nullable: true, minimum: 0, maximum: 100 },
          lastCookieCheckAt: { type: 'string', format: 'date-time', nullable: true },
          cookieExpiryWarning: { type: 'boolean', nullable: true },
          cookieRefreshAttempts: { type: 'integer', nullable: true },
          cookieLastRefreshAt: { type: 'string', format: 'date-time', nullable: true },
          status: ref('AccountStatus'),
          loginStatus: ref('LoginStatus'),
          dailyLimit: { type: 'integer' },
          todayPublished: { type: 'integer' },
          lastPublishedAt: { type: 'string', format: 'date-time', nullable: true },
          healthScore: { type: 'integer', minimum: 0, maximum: 100 },
          warningFlags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        example: accountExample,
      },
      AccountDetail: {
        allOf: [
          ref('Account'),
          {
            type: 'object',
            properties: {
              publishLogs: { type: 'array', items: ref('PublishLog') },
              lastCheckLoginCallback: {
                nullable: true,
                description: 'Latest async check-login callback snapshot for this account.',
              },
            },
          },
        ],
      },
      CreateAccountRequest: objectSchema(
        {
          name: { type: 'string', example: 'xhs-1' },
          platform: platformSchema,
          groupId: { type: 'string', description: 'Optional existing account group id.' },
          username: { type: 'string' },
          remark: { type: 'string', description: 'Mapped to Account.notes.' },
        },
        ['name', 'platform']
      ),
      UpdateAccountRequest: objectSchema({
        name: { type: 'string' },
        platform: platformSchema,
        groupId: { type: 'string' },
        username: { type: 'string' },
        remark: { type: 'string' },
        status: accountStatusSchema,
      }),
      Cookie: cookieSchema,
      CookieImportRequest: objectSchema(
        {
          cookies: {
            oneOf: [{ type: 'array', items: ref('Cookie') }, { type: 'string' }],
            description: 'Either a cookie array or a JSON string containing that array.',
          },
          password: {
            type: 'string',
            description: 'Optional encryption password. Defaults to COOKIE_ENCRYPTION_KEY.',
          },
        },
        ['cookies']
      ),
      CookieImportResult: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      BatchCookieImportRequest: objectSchema(
        {
          imports: {
            type: 'array',
            items: objectSchema(
              {
                accountId: { type: 'string' },
                cookies: { oneOf: [{ type: 'array', items: ref('Cookie') }, { type: 'string' }] },
                password: { type: 'string' },
              },
              ['accountId', 'cookies']
            ),
          },
        },
        ['imports']
      ),
      Content: {
        type: 'object',
        description:
          'Content record created from CONTENT_DIR/inbox scan. Paths are server/container paths.',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          type: ref('ContentType'),
          status: ref('ContentStatus'),
          basePath: { type: 'string' },
          images: { type: 'array', items: { type: 'string' } },
          video: { type: 'string', nullable: true },
          mdFile: { type: 'string' },
          reviewedBy: { type: 'string', nullable: true },
          reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          reviewNote: { type: 'string', nullable: true },
          tags: { type: 'array', items: { type: 'string' } },
          category: { type: 'string', nullable: true },
          publishCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        example: contentExample,
      },
      ContentWithPreview: {
        allOf: [
          ref('Content'),
          {
            type: 'object',
            properties: {
              previewUrls: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Relative URLs for image previews. Render directly against the API origin.',
              },
              mdContent: { type: 'string', description: 'Raw markdown from content.md.' },
              publishLogs: { type: 'array', items: ref('PublishLog') },
            },
          },
        ],
      },
      ContentListResponse: {
        allOf: [
          envelope({ type: 'array', items: ref('Content') }),
          {
            type: 'object',
            properties: { pagination: ref('Pagination') },
          },
        ],
      },
      ReviewContentRequest: objectSchema({
        reviewedBy: { type: 'string' },
        note: { type: 'string' },
      }),
      PublishContentRequest: objectSchema(
        {
          platform: platformSchema,
          accountId: {
            type: 'string',
            description:
              'Optional. If omitted, the backend falls back to its default account slot.',
          },
        },
        ['platform']
      ),
      MoveToPublishedRequest: objectSchema({ platform: platformSchema }, ['platform']),
      PublishLog: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          contentId: { type: 'string' },
          accountId: { type: 'string' },
          jobId: { type: 'string', nullable: true },
          platform: platformSchema,
          status: ref('PublishStatus'),
          externalTaskId: { type: 'string', nullable: true },
          publishedUrl: { type: 'string', nullable: true },
          errorMessage: { type: 'string', nullable: true },
          errorCode: { type: 'string', nullable: true },
          callbackPayload: { type: 'object', nullable: true, additionalProperties: true },
          retryCount: { type: 'integer' },
          maxRetries: { type: 'integer' },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          account: ref('Account'),
          content: ref('Content'),
          jobState: { type: 'string', nullable: true, example: 'waiting' },
        },
        example: publishLogExample,
      },
      PublishHistoryResponse: {
        type: 'object',
        properties: {
          publishLogs: { type: 'array', items: ref('PublishLog') },
          pagination: ref('Pagination'),
        },
      },
      PublishStats: {
        type: 'object',
        properties: {
          today: { type: 'integer' },
          thisWeek: { type: 'integer' },
          thisMonth: { type: 'integer' },
          byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
          byPlatform: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },
      GenericPublishRequest: genericPublishRequestSchema,
      QueuedJob: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          status: { type: 'string', example: 'QUEUED' },
        },
      },
      QueueState: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          state: { type: 'string', example: 'waiting' },
        },
      },
      ProgressEvent: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['publish', 'auth'] },
          jobId: { type: 'string' },
          platform: { type: 'string' },
          instance: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'number', minimum: 0, maximum: 100 },
          message: { type: 'string' },
          data: { type: 'object', additionalProperties: true },
        },
      },
      ProgressEventStream: {
        type: 'string',
        description: 'Server-sent events. Each message is `data: <ProgressEvent JSON>\\n\\n`.',
      },
      XhsAuthInitResult: {
        type: 'object',
        properties: {
          type: { type: 'string', example: 'qrcode' },
          data: { type: 'string', description: 'QR code payload or data URL.' },
          expiresIn: { type: 'number' },
        },
      },
      XhsAuthStatus: {
        type: 'object',
        properties: {
          loggedIn: { type: 'boolean' },
          accountName: { type: 'string' },
          message: { type: 'string' },
        },
      },
      XhsPublishRequest: xhsPublishRequestSchema,
      XhsVideoPublishRequest: xhsVideoPublishRequestSchema,
      MediaRoot: {
        type: 'object',
        properties: { id: { type: 'string' }, label: { type: 'string' }, path: { type: 'string' } },
      },
      MediaFavorite: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rootId: { type: 'string' },
          relativePath: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string', enum: ['DATE', 'FOLDER'] },
          pinned: { type: 'boolean' },
          exists: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      MediaDateTreeYear: {
        type: 'object',
        properties: {
          year: { type: 'string' },
          label: { type: 'string' },
          path: { type: 'string' },
          months: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      MediaFolderNode: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relativePath: { type: 'string' },
          isDirectory: { type: 'boolean' },
        },
      },
      MediaFolderSummary: {
        type: 'object',
        properties: {
          rootId: { type: 'string' },
          path: { type: 'string' },
          folders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                relativePath: { type: 'string' },
                imageCount: { type: 'integer' },
                coverAssetKey: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      MediaItem: {
        type: 'object',
        properties: {
          assetKey: { type: 'string' },
          rootId: { type: 'string' },
          relativePath: { type: 'string' },
          filename: { type: 'string' },
          parentPath: { type: 'string' },
          size: { type: 'integer' },
          modifiedAt: { type: 'string', format: 'date-time' },
          mimeType: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      MediaItemsResponse: {
        type: 'object',
        properties: {
          items: { type: 'array', items: ref('MediaItem') },
          nextCursor: { type: 'string', nullable: true },
        },
      },
      MediaTags: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
        example: { style: ['lookbook'], scene: ['studio'] },
      },
      MediaActionDefinition: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['wx-work-post', 'wechat-article', 'image-to-image', 'image-recognition'],
          },
          label: { type: 'string' },
          description: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                type: { type: 'string', enum: ['text', 'textarea'] },
                required: { type: 'boolean' },
                placeholder: { type: 'string' },
              },
            },
          },
          dispatchMethod: { type: 'string', example: 'POST' },
          dispatchPathname: { type: 'string' },
        },
      },
      MediaActionSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          actionType: { type: 'string' },
          status: {
            type: 'string',
            enum: [
              'QUEUED',
              'DISPATCHING',
              'DISPATCHED',
              'RUNNING',
              'NEEDS_AUTH',
              'SUCCESS',
              'FAILED',
            ],
          },
          operator: { type: 'string' },
          assets: { type: 'array', items: { type: 'object', additionalProperties: true } },
          formData: { type: 'object', additionalProperties: true },
          context: { type: 'object', additionalProperties: true },
          externalTaskId: { type: 'string' },
          error: { type: 'string' },
          callbackPayload: { type: 'object', additionalProperties: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateMediaActionRequest: objectSchema(
        {
          actionType: { type: 'string' },
          operator: { type: 'string' },
          assets: {
            type: 'array',
            items: objectSchema({ rootId: { type: 'string' }, relativePath: { type: 'string' } }, [
              'rootId',
              'relativePath',
            ]),
          },
          formData: { type: 'object', additionalProperties: true },
          context: { type: 'object', additionalProperties: true },
        },
        ['actionType', 'assets']
      ),
      MediaActionUploadRoot: {
        type: 'object',
        properties: { id: { type: 'string' }, label: { type: 'string' }, path: { type: 'string' } },
      },
      MediaActionUploadItem: {
        type: 'object',
        properties: {
          filename: { type: 'string' },
          relativePath: { type: 'string' },
          parentPath: { type: 'string' },
          size: { type: 'integer' },
          modifiedAt: { type: 'string', format: 'date-time' },
          mimeType: { type: 'string' },
        },
      },
      MediaActionUploadItemsResponse: {
        type: 'object',
        properties: {
          items: { type: 'array', items: ref('MediaActionUploadItem') },
          nextCursor: { type: 'string', nullable: true },
        },
      },
      WebhookEnvelope: {
        type: 'object',
        properties: {
          version: { type: 'string', example: '1.0' },
          eventId: { type: 'string' },
          kind: { type: 'string', enum: ['publish', 'media-action', 'account'] },
          taskId: { type: 'string' },
          actionType: { type: 'string' },
          status: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          refs: { type: 'object', additionalProperties: true },
          target: { type: 'object', additionalProperties: true },
          result: { type: 'object', additionalProperties: true },
        },
      },
      WebSocketMessage: {
        type: 'object',
        description:
          'Realtime app message. Client ping receives pong; server broadcasts content/media events.',
        properties: {
          type: { type: 'string', example: 'content_updated' },
          data: { type: 'object', additionalProperties: true },
          timestamp: { type: 'number' },
        },
        additionalProperties: true,
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'API root information',
        description: 'Use as a lightweight smoke test that the API service is reachable.',
        operationId: 'getApiRoot',
        responses: { 200: directJsonResponse('API metadata', ref('RootInfo'), rootInfoExample) },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns current service health and server timestamp.',
        operationId: 'getHealth',
        responses: { 200: directJsonResponse('Health status', ref('HealthCheck'), healthExample) },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check',
        description:
          'Aggregates environment, database, Redis, content directory, and gateway readiness checks. Returns 503 when any required check reports error.',
        operationId: 'getReadiness',
        responses: {
          200: directJsonResponse(
            'Service is ready for traffic',
            ref('ReadinessStatus'),
            readinessExample
          ),
          503: directJsonResponse('Service is not ready for traffic', ref('ReadinessStatus'), {
            ...readinessExample,
            status: 'unready',
            checks: {
              ...readinessExample.checks,
              database: { status: 'error', message: 'database unreachable' },
            },
          }),
        },
      },
    },

    '/api/contents': {
      get: {
        tags: ['Contents'],
        summary: 'List contents',
        description:
          'List content records imported from CONTENT_DIR/inbox. Use this for review queue, status tabs, search, and pagination.',
        operationId: 'listContents',
        parameters: [
          queryParam('status', contentStatusSchema, 'Filter by content workflow status.'),
          queryParam(
            'type',
            { type: 'string', enum: ['IMAGE', 'VIDEO', 'MIXED'] },
            'Filter by media type.'
          ),
          queryParam('category', { type: 'string' }, 'Filter by category parsed from metadata.'),
          queryParam('search', { type: 'string' }, 'Search title, description, or tags.'),
          queryParam('page', { type: 'number', default: 1, minimum: 1 }, '1-based page number.'),
          queryParam('limit', { type: 'number', default: 20, minimum: 1 }, 'Page size.'),
        ],
        responses: {
          200: {
            description: 'Content list with pagination.',
            content: jsonContent(ref('ContentListResponse'), {
              success: true,
              data: [contentExample],
              pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
            }),
          },
        },
        'x-ui': {
          view: 'content-list',
          listColumns: ['title', 'type', 'status', 'category', 'tags', 'createdAt', 'publishCount'],
          filters: ['status', 'type', 'category', 'search'],
          primaryActions: ['scanInbox', 'openDetail'],
        },
      },
    },
    '/api/contents/{id}': {
      get: {
        tags: ['Contents'],
        summary: 'Get content detail',
        description:
          'Returns content metadata, preview URLs, markdown body, and recent publish logs for a detail/review page.',
        operationId: 'getContentDetail',
        parameters: [pathParam('id', 'Content id.')],
        responses: {
          200: jsonResponse('Content detail', ref('ContentWithPreview'), {
            success: true,
            data: {
              ...contentExample,
              previewUrls: ['/api/contents/content-001/files/01.jpg'],
              mdContent: '# 今天的穿搭分享\n\n上衣是...',
            },
          }),
        },
        'x-ui': {
          view: 'content-detail',
          sections: [
            'preview-gallery',
            'metadata',
            'markdown',
            'review-actions',
            'publish-actions',
          ],
        },
      },
    },
    '/api/contents/{id}/files/{filepath}': {
      get: {
        tags: ['Contents'],
        summary: 'Read a content file',
        description:
          'Wildcard file preview/download endpoint. Build URLs from Content.previewUrls or encode each path segment from a relative file path.',
        operationId: 'readContentFile',
        parameters: [
          pathParam('id', 'Content id.'),
          pathParam('filepath', 'Wildcard file path relative to content.basePath.'),
        ],
        responses: {
          200: binaryResponse('Content image/video/file bytes'),
          400: errorResponse('Invalid path'),
          403: errorResponse('Path traversal rejected'),
          404: errorResponse('Content or file not found'),
        },
      },
    },
    '/api/contents/{id}/approve': {
      post: {
        tags: ['Contents'],
        summary: 'Approve content',
        description:
          'Marks PENDING content as APPROVED and moves its directory from inbox to approved. Enable from PENDING only.',
        operationId: 'approveContent',
        parameters: [pathParam('id', 'Content id.')],
        requestBody: requestBody(ref('ReviewContentRequest'), {
          reviewedBy: 'editor',
          note: 'Ready to publish',
        }),
        responses: {
          200: jsonResponse('Approve result', ref('Content'), {
            success: true,
            data: contentExample,
            message: 'Content approved successfully',
          }),
        },
        'x-ui': { action: 'approve', visibleWhen: { status: 'PENDING' }, confirm: true },
      },
    },
    '/api/contents/{id}/reject': {
      post: {
        tags: ['Contents'],
        summary: 'Reject content',
        description:
          'Marks PENDING content as REJECTED. The file directory is not moved by this action.',
        operationId: 'rejectContent',
        parameters: [pathParam('id', 'Content id.')],
        requestBody: requestBody(ref('ReviewContentRequest'), {
          reviewedBy: 'editor',
          note: 'Needs rewrite',
        }),
        responses: { 200: jsonResponse('Reject result', ref('Content')) },
        'x-ui': { action: 'reject', visibleWhen: { status: 'PENDING' }, confirm: true },
      },
    },
    '/api/contents/scan-inbox': {
      post: {
        tags: ['Contents'],
        summary: 'Scan content inbox',
        description: `Scans \${CONTENT_DIR}/inbox for draft subdirectories containing markdown and media. Creates or refreshes PENDING content records.`,
        operationId: 'scanInbox',
        responses: {
          200: jsonResponse('Scan result', undefined, {
            success: true,
            message: 'Inbox scanned successfully',
          }),
        },
        'x-ui': { action: 'refresh-imports', placement: 'content-list-toolbar' },
      },
    },
    '/api/contents/{id}/publish': {
      post: {
        tags: ['Contents'],
        summary: 'Queue approved content for publishing',
        description:
          'Preferred publish path for UI when publishing reviewed content. Requires content APPROVED, active account, supported platform, and configured cookies. Creates PublishLog and queues BullMQ job.',
        operationId: 'publishApprovedContent',
        parameters: [pathParam('id', 'Content id.')],
        requestBody: requestBody(ref('PublishContentRequest'), {
          platform: 'xiaohongshu',
          accountId: 'account-001',
        }),
        responses: {
          200: jsonResponse('Publish log and queue job', ref('PublishLog'), {
            success: true,
            data: { ...publishLogExample, jobId: 'job-001' },
            message: 'Content queued for publishing',
          }),
        },
        'x-ui': {
          action: 'publish',
          visibleWhen: { status: 'APPROVED' },
          formFields: ['platform', 'accountId'],
          postSubmitNavigation: '/publish-status',
        },
      },
    },
    '/api/contents/{id}/move-to-published': {
      post: {
        tags: ['Contents'],
        summary: 'Move content to published',
        description: `Manual compensation endpoint. Moves the content directory to \${CONTENT_DIR}/published/{platform} and marks content PUBLISHED. Normal successful publish callbacks already do this.`,
        operationId: 'moveContentToPublished',
        parameters: [pathParam('id', 'Content id.')],
        requestBody: requestBody(ref('MoveToPublishedRequest'), { platform: 'xiaohongshu' }),
        responses: { 200: jsonResponse('Move result', ref('Content')) },
        'x-ui': { action: 'manual-compensation', danger: true, adminOnly: true },
      },
    },

    '/api/accounts': {
      get: {
        tags: ['Accounts'],
        summary: 'List accounts',
        description:
          'List publishing accounts with group data. Use for account table and publish account pickers.',
        operationId: 'listAccounts',
        parameters: [
          queryParam('platform', platformSchema, 'Filter by platform.'),
          queryParam('status', accountStatusSchema, 'Filter by account status.'),
        ],
        responses: {
          200: jsonResponse(
            'Account list',
            { type: 'array', items: ref('Account') },
            { success: true, data: [accountExample] }
          ),
        },
        'x-ui': {
          view: 'account-list',
          listColumns: [
            'name',
            'platform',
            'status',
            'loginStatus',
            'todayPublished',
            'cookieUpdatedAt',
          ],
          filters: ['platform', 'status'],
          primaryActions: ['createAccount', 'openDetail', 'importCookies'],
        },
      },
      post: {
        tags: ['Accounts'],
        summary: 'Create account',
        description:
          'Creates an account and auto-connects/creates a default platform group if groupId is omitted.',
        operationId: 'createAccount',
        requestBody: requestBody(ref('CreateAccountRequest'), {
          name: 'xhs-1',
          platform: 'xiaohongshu',
          username: 'optional',
          remark: '主账号',
        }),
        responses: { 200: jsonResponse('Created account', ref('Account')) },
        'x-ui': {
          form: 'account-create',
          fields: ['name', 'platform', 'groupId', 'username', 'remark'],
        },
      },
    },
    '/api/accounts/{id}': {
      get: {
        tags: ['Accounts'],
        summary: 'Get account detail',
        description:
          'Returns account detail, group, recent publish logs, and latest async check-login callback snapshot.',
        operationId: 'getAccountDetail',
        parameters: [pathParam('id', 'Account id.')],
        responses: { 200: jsonResponse('Account detail', ref('AccountDetail')) },
        'x-ui': {
          view: 'account-detail',
          sections: ['profile', 'cookie-status', 'publish-history'],
        },
      },
      put: {
        tags: ['Accounts'],
        summary: 'Update account',
        description: 'Partial update for account profile and status fields.',
        operationId: 'updateAccount',
        parameters: [pathParam('id', 'Account id.')],
        requestBody: requestBody(ref('UpdateAccountRequest'), { name: 'xhs-1', status: 'ACTIVE' }),
        responses: { 200: jsonResponse('Updated account', ref('Account')) },
      },
      delete: {
        tags: ['Accounts'],
        summary: 'Delete account',
        description:
          'Deletes account record. UI should confirm because publish history relations may constrain deletion.',
        operationId: 'deleteAccount',
        parameters: [pathParam('id', 'Account id.')],
        responses: {
          200: jsonResponse('Delete result', undefined, { success: true, message: '账号删除成功' }),
        },
        'x-ui': { danger: true, confirm: true },
      },
    },
    '/api/accounts/{id}/toggle-status': {
      post: {
        tags: ['Accounts'],
        summary: 'Toggle account status',
        description: 'Toggles ACTIVE/INACTIVE for quick enable/disable in account table.',
        operationId: 'toggleAccountStatus',
        parameters: [pathParam('id', 'Account id.')],
        responses: {
          200: jsonResponse(
            'Updated account status',
            objectSchema({ id: { type: 'string' }, status: accountStatusSchema })
          ),
        },
      },
    },
    '/api/accounts/{id}/cookies': {
      post: {
        tags: ['Accounts'],
        summary: 'Import encrypted account cookies',
        description:
          'Imports browser cookies, normalizes platform domains, encrypts them, and marks loginStatus LOGGED_IN. UI should accept paste-as-JSON and file import.',
        operationId: 'importAccountCookies',
        parameters: [pathParam('id', 'Account id.')],
        requestBody: requestBody(ref('CookieImportRequest'), {
          cookies: [{ name: 'a1', value: 'cookie-value', domain: '.xiaohongshu.com', path: '/' }],
          password: 'optional-password',
        }),
        responses: { 200: jsonResponse('Cookie import result', ref('CookieImportResult')) },
        'x-ui': { form: 'cookie-import', inputModes: ['json-paste', 'json-file'] },
      },
      delete: {
        tags: ['Accounts'],
        summary: 'Delete account cookies',
        description: 'Clears encrypted cookies and resets loginStatus to UNKNOWN.',
        operationId: 'deleteAccountCookies',
        parameters: [pathParam('id', 'Account id.')],
        responses: { 200: jsonResponse('Cookie delete result') },
        'x-ui': { danger: true, confirm: true },
      },
    },
    '/api/accounts/{id}/cookies/check-login': {
      post: {
        tags: ['Accounts'],
        summary: 'Request gateway check-login',
        description:
          'For Xiaohongshu, sends an async Gateway/MCP login check. Result arrives via webhook and is stored as account login state/callback snapshot.',
        operationId: 'requestAccountCheckLogin',
        parameters: [pathParam('id', 'Account id.')],
        responses: {
          200: jsonResponse(
            'Check-login request result',
            objectSchema({
              isLoggedIn: { type: 'boolean', nullable: true },
              message: { type: 'string' },
              verifiedAt: { type: 'string', format: 'date-time' },
              platform: platformSchema,
              verifyMethod: { type: 'string' },
            })
          ),
        },
        'x-ui': { action: 'check-login', placement: 'account-detail-cookie-card' },
      },
    },
    '/api/accounts/{id}/cookies/verify': {
      get: {
        tags: ['Accounts'],
        summary: 'Verify account cookies locally',
        description:
          'Playwright-based local cookie verification. Xiaohongshu currently asks clients to use POST /cookies/check-login instead.',
        operationId: 'verifyAccountCookiesLocally',
        parameters: [
          pathParam('id', 'Account id.'),
          queryParam('password', { type: 'string' }, 'Cookie decryption password.'),
        ],
        responses: { 200: jsonResponse('Cookie verification result') },
      },
    },
    '/api/accounts/cookies/batch-import': {
      post: {
        tags: ['Accounts'],
        summary: 'Batch import account cookies',
        description:
          'Bulk version of cookie import. UI can use for admin migration/import tooling.',
        operationId: 'batchImportAccountCookies',
        requestBody: requestBody(ref('BatchCookieImportRequest'), {
          imports: [
            {
              accountId: 'account-001',
              cookies: [{ name: 'a1', value: 'v', domain: '.xiaohongshu.com' }],
            },
          ],
        }),
        responses: { 200: jsonResponse('Batch import result') },
        'x-ui': { adminOnly: true },
      },
    },

    '/api/publish-status/content/{contentId}': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish logs for content',
        description:
          'Use inside content detail to show each account/platform attempt and queue state.',
        operationId: 'getPublishLogsForContent',
        parameters: [pathParam('contentId', 'Content id.')],
        responses: {
          200: jsonResponse(
            'Publish logs',
            objectSchema({
              contentId: { type: 'string' },
              publishLogs: { type: 'array', items: ref('PublishLog') },
            })
          ),
        },
      },
    },
    '/api/publish-status/account/all': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish history for all accounts',
        description: 'Main publish history table across all accounts and platforms.',
        operationId: 'getAllAccountPublishHistory',
        parameters: [
          queryParam('limit', { type: 'string', default: '20' }),
          queryParam('offset', { type: 'string', default: '0' }),
        ],
        responses: { 200: jsonResponse('Publish history', ref('PublishHistoryResponse')) },
        'x-ui': {
          view: 'publish-history',
          listColumns: [
            'content.title',
            'account.name',
            'platform',
            'status',
            'jobState',
            'createdAt',
          ],
        },
      },
    },
    '/api/publish-status/account/{accountId}': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish history for an account',
        description: 'Account-scoped publish history for account detail tabs.',
        operationId: 'getAccountPublishHistory',
        parameters: [
          pathParam('accountId', 'Account id.'),
          queryParam('limit'),
          queryParam('offset'),
        ],
        responses: { 200: jsonResponse('Publish history', ref('PublishHistoryResponse')) },
      },
    },
    '/api/publish-status/stats': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish statistics',
        description: 'Dashboard counters grouped by time window, status, and platform.',
        operationId: 'getPublishStats',
        responses: { 200: jsonResponse('Publish stats', ref('PublishStats')) },
        'x-ui': {
          view: 'publish-dashboard',
          widgets: ['today', 'thisWeek', 'thisMonth', 'byStatus', 'byPlatform'],
        },
      },
    },
    '/api/publish-status/{id}/retry': {
      post: {
        tags: ['PublishStatus'],
        summary: 'Retry a failed publish log',
        description:
          'Only FAILED publish logs can be retried. Resets log to QUEUED and stores a new queue jobId.',
        operationId: 'retryPublishLog',
        parameters: [pathParam('id', 'PublishLog id.')],
        responses: {
          200: jsonResponse('Retry result', ref('QueuedJob'), {
            success: true,
            data: { jobId: 'job-retry-001' },
            message: 'Publish job queued for retry',
          }),
        },
        'x-ui': { action: 'retry', visibleWhen: { status: 'FAILED' }, confirm: true },
      },
    },

    '/api/publish': {
      post: {
        tags: ['Publish'],
        summary: 'Create generic publish job',
        description:
          'Low-level Publisher Framework entrypoint. For reviewed content, UI should usually prefer /api/contents/{id}/publish so Content and PublishLog stay linked.',
        operationId: 'createGenericPublishJob',
        requestBody: requestBody(genericPublishRequestSchema, {
          platform: 'xiaohongshu',
          accountId: 'account-001',
          accountName: 'xhs-1',
          action: 'publish',
          payload: { title: '标题', description: '正文', images: ['/data/01.jpg'], tags: ['穿搭'] },
        }),
        responses: {
          200: jsonResponse('Queued job', ref('QueuedJob'), queuedJobExample),
          400: errorResponse('Missing routing fields', {
            success: false,
            error: 'platform, accountId, action required',
          }),
        },
        'x-ui': { advanced: true, form: 'generic-publish-job' },
      },
    },
    '/api/publish/progress': {
      get: {
        tags: ['Publish'],
        summary: 'Server-sent publish progress stream',
        description:
          'SSE stream for live task progress. Render as a console/timeline and reconnect on network drop.',
        operationId: 'streamPublishProgress',
        responses: { 200: { description: 'SSE progress stream', content: textEventStreamContent } },
        'x-ui': { realtime: true, transport: 'sse', eventSchema: 'ProgressEvent' },
      },
    },
    '/api/publish/{jobId}': {
      get: {
        tags: ['Publish'],
        summary: 'Get generic publish job state',
        description: 'Returns BullMQ state for a queued generic publish job.',
        operationId: 'getPublishJobState',
        parameters: [pathParam('jobId', 'Queue job id.')],
        responses: {
          200: jsonResponse('Queue state', ref('QueueState')),
          404: errorResponse('Job not found'),
        },
      },
    },

    '/api/xhs/login/qrcode': {
      get: {
        tags: ['XHS'],
        summary: 'Get XHS MCP login QR code',
        description:
          'Gets a QR code from the selected registered XHS MCP instance and emits auth qr_ready progress.',
        operationId: 'getXhsLoginQrCode',
        parameters: [
          queryParam('instance', { type: 'string', default: 'xhs-1' }, 'XHS MCP instance name.'),
        ],
        responses: {
          200: jsonResponse('QR code auth init result', ref('XhsAuthInitResult')),
          404: errorResponse('MCP instance not found'),
        },
        'x-ui': { view: 'xhs-login-card', action: 'show-qr-code' },
      },
    },
    '/api/xhs/login/status': {
      get: {
        tags: ['XHS'],
        summary: 'Check XHS MCP login status',
        description: 'Checks whether the selected MCP instance is logged in.',
        operationId: 'getXhsLoginStatus',
        parameters: [
          queryParam('instance', { type: 'string', default: 'xhs-1' }, 'XHS MCP instance name.'),
        ],
        responses: {
          200: jsonResponse('Auth status', ref('XhsAuthStatus')),
          404: errorResponse('MCP instance not found'),
        },
      },
    },
    '/api/xhs/login/refresh': {
      post: {
        tags: ['XHS'],
        summary: 'Refresh XHS MCP login',
        description: 'Deletes MCP cookies and starts a fresh QR login flow.',
        operationId: 'refreshXhsLogin',
        parameters: [
          queryParam('instance', { type: 'string', default: 'xhs-1' }, 'XHS MCP instance name.'),
        ],
        responses: {
          200: jsonResponse('Auth init result', ref('XhsAuthInitResult')),
          404: errorResponse('MCP instance not found'),
        },
        'x-ui': { action: 'refresh-login', confirm: true },
      },
    },
    '/api/xhs/publish': {
      post: {
        tags: ['XHS'],
        summary: 'Queue XHS image/text publish job',
        description:
          'Direct XHS image/text quick publish. It queues a job but uses accountId as contentId; for reviewed content UX prefer /api/contents/{id}/publish.',
        operationId: 'queueXhsImageTextPublish',
        requestBody: requestBody(xhsPublishRequestSchema, {
          accountId: 'account-001',
          accountName: 'xhs-1',
          title: '今天的穿搭分享',
          content: '上衣是... 裤子是... 这套适合通勤。',
          images: ['/data/content/approved/note-001/01.jpg'],
          tags: ['穿搭', '通勤'],
          isOriginal: true,
        }),
        responses: {
          200: jsonResponse('Queued job', ref('QueuedJob'), queuedJobExample),
          400: errorResponse('Missing required fields', {
            success: false,
            error: 'accountId, title, content required',
          }),
        },
        'x-ui': { form: 'xhs-quick-publish', advanced: true },
      },
    },
    '/api/xhs/publish/video': {
      post: {
        tags: ['XHS'],
        summary: 'Queue XHS video publish job',
        description:
          'Direct XHS video quick publish. video must be a path accessible by the server/MCP runtime.',
        operationId: 'queueXhsVideoPublish',
        requestBody: requestBody(xhsVideoPublishRequestSchema, {
          accountId: 'account-001',
          accountName: 'xhs-1',
          title: '视频标题',
          content: '视频正文',
          video: '/data/content/approved/video-note/video.mp4',
          tags: ['穿搭'],
        }),
        responses: {
          200: jsonResponse('Queued job', ref('QueuedJob'), queuedJobExample),
          400: errorResponse('Missing required fields', {
            success: false,
            error: 'accountId, title, content, video required',
          }),
        },
      },
    },

    '/api/media/roots': {
      get: {
        tags: ['Media'],
        summary: 'List media roots',
        description:
          'Returns configured media roots from MEDIA_ROOT_LIST. Legacy/optional for current service-only MVP.',
        operationId: 'listMediaRoots',
        responses: { 200: jsonResponse('Media roots', { type: 'array', items: ref('MediaRoot') }) },
      },
    },
    '/api/media/favorites': {
      get: {
        tags: ['Media'],
        summary: 'List media favorites',
        operationId: 'listMediaFavorites',
        responses: {
          200: jsonResponse('Media favorites', { type: 'array', items: ref('MediaFavorite') }),
        },
      },
      post: {
        tags: ['Media'],
        summary: 'Add media favorite',
        operationId: 'createMediaFavorite',
        requestBody: requestBody(
          objectSchema(
            {
              rootId: { type: 'string' },
              relativePath: { type: 'string' },
              label: { type: 'string' },
              pinned: { type: 'boolean' },
            },
            ['rootId', 'relativePath']
          ),
          { rootId: 'dapai', relativePath: '2026/04/09/A款', label: 'A款', pinned: true }
        ),
        responses: { 200: jsonResponse('Created favorite', ref('MediaFavorite')) },
      },
    },
    '/api/media/favorites/{id}': {
      patch: {
        tags: ['Media'],
        summary: 'Update media favorite',
        operationId: 'updateMediaFavorite',
        parameters: [pathParam('id', 'Favorite id.')],
        requestBody: requestBody(
          objectSchema({ label: { type: 'string' }, pinned: { type: 'boolean' } }),
          { label: '新标签', pinned: false }
        ),
        responses: { 200: jsonResponse('Updated favorite', ref('MediaFavorite')) },
      },
      delete: {
        tags: ['Media'],
        summary: 'Delete media favorite',
        operationId: 'deleteMediaFavorite',
        parameters: [pathParam('id', 'Favorite id.')],
        responses: { 200: jsonResponse('Delete result', objectSchema({ id: { type: 'string' } })) },
      },
    },
    '/api/media/date-tree': {
      get: {
        tags: ['Media'],
        summary: 'Get media date tree',
        operationId: 'getMediaDateTree',
        parameters: [queryParam('rootId', { type: 'string' }, 'Media root id.')],
        responses: {
          200: jsonResponse('Date tree', { type: 'array', items: ref('MediaDateTreeYear') }),
        },
      },
    },
    '/api/media/folder-tree': {
      get: {
        tags: ['Media'],
        summary: 'Get media folder tree',
        operationId: 'getMediaFolderTree',
        parameters: [queryParam('rootId'), queryParam('path')],
        responses: {
          200: jsonResponse('Folder tree', { type: 'array', items: ref('MediaFolderNode') }),
        },
      },
    },
    '/api/media/folder-summary': {
      get: {
        tags: ['Media'],
        summary: 'Get media folder summary',
        operationId: 'getMediaFolderSummary',
        parameters: [queryParam('rootId'), queryParam('path')],
        responses: { 200: jsonResponse('Folder summary', ref('MediaFolderSummary')) },
      },
    },
    '/api/media/items': {
      get: {
        tags: ['Media'],
        summary: 'List media items',
        operationId: 'listMediaItems',
        parameters: [
          queryParam('rootId'),
          queryParam('path'),
          queryParam('recursive', { type: 'boolean' }),
          queryParam('limit', { type: 'number', default: 120 }),
          queryParam('cursor'),
        ],
        responses: { 200: jsonResponse('Media items', ref('MediaItemsResponse')) },
      },
    },
    '/api/media/tags': {
      get: {
        tags: ['Media'],
        summary: 'Get media folder tags',
        operationId: 'getMediaTags',
        parameters: [queryParam('rootId'), queryParam('path')],
        responses: { 200: jsonResponse('Media tags', ref('MediaTags')) },
      },
      post: {
        tags: ['Media'],
        summary: 'Set media folder tags',
        operationId: 'setMediaTags',
        requestBody: requestBody(
          objectSchema(
            { rootId: { type: 'string' }, path: { type: 'string' }, tags: ref('MediaTags') },
            ['rootId', 'path', 'tags']
          ),
          { rootId: 'dapai', path: '2026/04/09/A款', tags: { style: ['lookbook'] } }
        ),
        responses: { 200: jsonResponse('Set tags result') },
      },
    },
    '/api/media/thumb/{assetKey}': {
      get: {
        tags: ['Media'],
        summary: 'Read media thumbnail',
        operationId: 'readMediaThumbnail',
        parameters: [pathParam('assetKey', 'Encoded media asset key.')],
        responses: { 200: binaryResponse('Thumbnail') },
      },
    },
    '/api/media/file/{assetKey}': {
      get: {
        tags: ['Media'],
        summary: 'Read media file',
        operationId: 'readMediaFile',
        parameters: [pathParam('assetKey', 'Encoded media asset key.')],
        responses: { 200: binaryResponse('Media file') },
      },
    },

    '/api/media/actions/definitions': {
      get: {
        tags: ['MediaActions'],
        summary: 'List media action definitions',
        operationId: 'listMediaActionDefinitions',
        responses: {
          200: jsonResponse('Action definitions', {
            type: 'array',
            items: ref('MediaActionDefinition'),
          }),
        },
      },
    },
    '/api/media/actions': {
      get: {
        tags: ['MediaActions'],
        summary: 'List recent media actions',
        operationId: 'listMediaActions',
        parameters: [queryParam('limit', { type: 'number', default: 20 })],
        responses: {
          200: jsonResponse('Recent media actions', {
            type: 'array',
            items: ref('MediaActionSummary'),
          }),
        },
      },
      post: {
        tags: ['MediaActions'],
        summary: 'Submit media action',
        operationId: 'createMediaAction',
        requestBody: requestBody(ref('CreateMediaActionRequest'), {
          actionType: 'image-to-image',
          operator: 'user',
          assets: [{ rootId: 'dapai', relativePath: '2026/04/09/A款/1.png' }],
          formData: { mode: 'lookbook' },
        }),
        responses: { 200: jsonResponse('Created media action', ref('MediaActionSummary')) },
      },
    },
    '/api/media/actions/{id}': {
      get: {
        tags: ['MediaActions'],
        summary: 'Get media action detail',
        operationId: 'getMediaAction',
        parameters: [pathParam('id', 'Media action id.')],
        responses: {
          200: jsonResponse('Media action', ref('MediaActionSummary')),
          404: errorResponse('Media action not found'),
        },
      },
      delete: {
        tags: ['MediaActions'],
        summary: 'Delete media action',
        operationId: 'deleteMediaAction',
        parameters: [pathParam('id', 'Media action id.')],
        responses: {
          200: jsonResponse('Delete result'),
          404: errorResponse('Media action not found'),
        },
      },
    },
    '/api/media/actions/{id}/retry': {
      post: {
        tags: ['MediaActions'],
        summary: 'Retry media action',
        operationId: 'retryMediaAction',
        parameters: [pathParam('id', 'Media action id.')],
        responses: { 200: jsonResponse('Retried media action', ref('MediaActionSummary')) },
      },
    },
    '/api/media/actions/{id}/uploads/{filepath}': {
      get: {
        tags: ['MediaActions'],
        summary: 'Read uploaded result for a media action',
        operationId: 'readMediaActionUploadFile',
        parameters: [
          pathParam('id', 'Media action id.'),
          pathParam('filepath', 'Wildcard upload file path.'),
        ],
        responses: {
          200: binaryResponse('Upload file'),
          404: errorResponse('Upload file not found'),
        },
      },
    },
    '/api/media/actions/uploads/roots': {
      get: {
        tags: ['MediaActions'],
        summary: 'List upload browser roots',
        operationId: 'listMediaActionUploadRoots',
        responses: {
          200: jsonResponse('Upload roots', { type: 'array', items: ref('MediaActionUploadRoot') }),
        },
      },
    },
    '/api/media/actions/uploads/tree': {
      get: {
        tags: ['MediaActions'],
        summary: 'Get upload result tree',
        operationId: 'getMediaActionUploadTree',
        parameters: [queryParam('provider'), queryParam('path')],
        responses: {
          200: jsonResponse('Upload result tree', {
            type: 'array',
            items: ref('MediaDateTreeYear'),
          }),
        },
      },
    },
    '/api/media/actions/uploads/items': {
      get: {
        tags: ['MediaActions'],
        summary: 'List upload result items',
        operationId: 'listMediaActionUploadItems',
        parameters: [
          queryParam('provider'),
          queryParam('path'),
          queryParam('recursive', { type: 'boolean' }),
          queryParam('limit'),
          queryParam('cursor'),
        ],
        responses: {
          200: jsonResponse('Upload result items', ref('MediaActionUploadItemsResponse')),
        },
      },
    },
    '/api/media/actions/uploads/{provider}/{filepath}': {
      get: {
        tags: ['MediaActions'],
        summary: 'Read upload browser file',
        operationId: 'readUploadBrowserFile',
        parameters: [
          pathParam('provider', 'Upload provider, e.g. openclaw.'),
          pathParam('filepath', 'Wildcard upload file path.'),
        ],
        responses: {
          200: binaryResponse('Upload file'),
          404: errorResponse('Upload file not found'),
        },
      },
      delete: {
        tags: ['MediaActions'],
        summary: 'Delete upload browser file',
        operationId: 'deleteUploadBrowserFile',
        parameters: [
          pathParam('provider', 'Upload provider, e.g. openclaw.'),
          pathParam('filepath', 'Wildcard upload file path.'),
        ],
        responses: { 200: jsonResponse('Delete result'), 400: errorResponse('Delete failed') },
      },
    },

    '/api/webhook/{platform}/publish-result': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive publish result callback',
        description:
          'Gateway/OpenClaw callback for publish results. Integration-only endpoint; normal frontend should read PublishStatus instead.',
        operationId: 'receivePublishResultWebhook',
        security: [{ webhookBearerAuth: [] }],
        parameters: [pathParam('platform', 'Platform short name or full name.')],
        requestBody: requestBody(ref('WebhookEnvelope'), {
          version: '1.0',
          eventId: 'evt-001',
          kind: 'publish',
          taskId: 'gw-task-001',
          actionType: 'xhs.publish',
          status: 'success',
          refs: {
            publishLogId: 'publish-log-001',
            contentId: 'content-001',
            accountId: 'account-001',
          },
          target: { platform: 'xiaohongshu' },
          result: { url: 'https://www.xiaohongshu.com/explore/123' },
        }),
        responses: { 200: jsonResponse('Callback result'), 401: errorResponse('Unauthorized') },
      },
    },
    '/api/webhook/media-actions/{actionType}/result': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive media action result callback',
        description:
          'Media action callback. Supports JSON envelope and multipart uploads containing generated files.',
        operationId: 'receiveMediaActionResultWebhook',
        security: [{ webhookBearerAuth: [] }],
        parameters: [pathParam('actionType', 'Media action type, e.g. image-to-image.')],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: ref('WebhookEnvelope') },
            'multipart/form-data': {
              schema: objectSchema(
                {
                  payload: { type: 'string' },
                  files: { type: 'array', items: { type: 'string', format: 'binary' } },
                },
                ['payload']
              ),
            },
          },
        },
        responses: { 200: jsonResponse('Callback result'), 401: errorResponse('Unauthorized') },
      },
    },
    '/api/webhook/{platform}/check-login-result': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive check-login result callback',
        description:
          'Gateway callback for account login checks. Updates Account.loginStatus and stores latest callback snapshot.',
        operationId: 'receiveCheckLoginResultWebhook',
        security: [{ webhookBearerAuth: [] }],
        parameters: [pathParam('platform', 'Platform short name or full name.')],
        requestBody: requestBody(ref('WebhookEnvelope'), {
          version: '1.0',
          eventId: 'evt-login-001',
          kind: 'account',
          taskId: 'check-task-001',
          actionType: 'xiaohongshu.check-login',
          status: 'success',
          refs: { accountId: 'account-001' },
          result: { extra: { loggedIn: true, username: 'xhs-1' } },
        }),
        responses: { 200: jsonResponse('Callback result'), 401: errorResponse('Unauthorized') },
      },
    },

    '/ws': {
      get: {
        tags: ['Realtime'],
        summary: 'WebSocket endpoint for realtime frontend notifications',
        description:
          'Use WebSocket upgrade. Client ping messages receive pong responses. Server broadcasts content updates and media action terminal states.',
        operationId: 'connectRealtimeWebSocket',
        responses: {
          101: {
            description: 'WebSocket upgrade. Message schema: #/components/schemas/WebSocketMessage',
          },
        },
        'x-ui': { realtime: true, transport: 'websocket', messageSchema: 'WebSocketMessage' },
      },
    },
  },
} as const;

type MutableOpenApiOperation = {
  description?: string;
  security?: Array<Record<string, string[]>>;
};

const managementAuthNote =
  'Production auth: send Authorization: Bearer <API_AUTH_TOKEN>. Webhook callback routes use separate callback tokens.';

for (const [path, methods] of Object.entries(openApiDocument.paths) as Array<
  [string, Record<string, MutableOpenApiOperation>]
>) {
  if (!path.startsWith('/api/') || path.startsWith('/api/webhook/')) {
    continue;
  }

  for (const operation of Object.values(methods)) {
    operation.security = [{ bearerAuth: [] }];
    operation.description = operation.description
      ? `${operation.description}

${managementAuthNote}`
      : managementAuthNote;
  }
}

const swaggerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Content Publish Platform API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
    });
  </script>
</body>
</html>`;

export function setupApiDocRoutes() {
  return new Elysia()
    .get('/docs/openapi.json', ({ set }) => {
      set.headers['Cache-Control'] = 'no-store';
      return openApiDocument;
    })
    .get('/docs', ({ set }) => {
      set.headers['Content-Type'] = 'text/html; charset=utf-8';
      return new Response(swaggerHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    });
}
