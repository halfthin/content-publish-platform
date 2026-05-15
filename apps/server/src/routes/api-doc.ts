import { Elysia } from 'elysia';

const jsonContent = {
  'application/json': {
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {},
        error: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

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
    schema: {
      type: 'string',
      example: 'data: {"type":"publish","platform":"system","status":"connected"}\n\n',
    },
  },
};

function jsonResponse(description = 'JSON response') {
  return {
    description,
    content: jsonContent,
  };
}

function binaryResponse(description = 'Binary file response') {
  return {
    description,
    content: binaryContent,
  };
}

function requestBody(properties: Record<string, unknown>, required: string[] = []) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties,
          required,
        },
      },
    },
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

function queryParam(name: string, schema: Record<string, unknown> = { type: 'string' }) {
  return {
    name,
    in: 'query',
    required: false,
    schema,
  };
}

const platformSchema = {
  type: 'string',
  enum: ['xiaohongshu', 'weibo', 'douyin', 'bilibili', 'wechat'],
};

const cookieSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    value: { type: 'string' },
    domain: { type: 'string' },
    path: { type: 'string' },
  },
  required: ['name', 'value'],
  additionalProperties: true,
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Content Publish Platform API',
    version: '1.0.0',
    description:
      'Synchronized OpenAPI surface for the Bun/Elysia API. The narrative version lives in docs/API.md.',
  },
  servers: [{ url: 'http://localhost:50000' }],
  tags: [
    { name: 'Health' },
    { name: 'Contents' },
    { name: 'Accounts' },
    { name: 'PublishStatus' },
    { name: 'Publish' },
    { name: 'XHS' },
    { name: 'Media' },
    { name: 'MediaActions' },
    { name: 'Webhooks' },
    { name: 'Realtime' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
    schemas: {
      ApiEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {},
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      Platform: platformSchema,
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'API root information',
        responses: { 200: jsonResponse('API metadata') },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: { 200: jsonResponse('Health status') },
      },
    },

    '/api/contents': {
      get: {
        tags: ['Contents'],
        summary: 'List contents',
        parameters: [
          queryParam('status'),
          queryParam('type'),
          queryParam('category'),
          queryParam('search'),
          queryParam('page', { type: 'number', default: 1 }),
          queryParam('limit', { type: 'number', default: 20 }),
        ],
        responses: { 200: jsonResponse('Content list') },
      },
    },
    '/api/contents/{id}': {
      get: {
        tags: ['Contents'],
        summary: 'Get content detail',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Content detail') },
      },
    },
    '/api/contents/{id}/files/{filepath}': {
      get: {
        tags: ['Contents'],
        summary: 'Read a content file',
        parameters: [pathParam('id'), pathParam('filepath', 'Wildcard file path')],
        responses: {
          200: binaryResponse('Content file'),
          400: jsonResponse('Invalid path'),
          403: jsonResponse('Path traversal rejected'),
          404: jsonResponse('Content or file not found'),
        },
      },
    },
    '/api/contents/{id}/approve': {
      post: {
        tags: ['Contents'],
        summary: 'Approve content',
        parameters: [pathParam('id')],
        requestBody: requestBody({ reviewedBy: { type: 'string' }, note: { type: 'string' } }, [
          'reviewedBy',
        ]),
        responses: { 200: jsonResponse('Approve result') },
      },
    },
    '/api/contents/{id}/reject': {
      post: {
        tags: ['Contents'],
        summary: 'Reject content',
        parameters: [pathParam('id')],
        requestBody: requestBody({ reviewedBy: { type: 'string' }, note: { type: 'string' } }, [
          'reviewedBy',
        ]),
        responses: { 200: jsonResponse('Reject result') },
      },
    },
    '/api/contents/scan-inbox': {
      post: {
        tags: ['Contents'],
        summary: 'Scan content inbox',
        responses: { 200: jsonResponse('Scan result') },
      },
    },
    '/api/contents/{id}/publish': {
      post: {
        tags: ['Contents'],
        summary: 'Queue approved content for publishing',
        parameters: [pathParam('id')],
        requestBody: requestBody({ platform: platformSchema, accountId: { type: 'string' } }, [
          'platform',
          'accountId',
        ]),
        responses: { 200: jsonResponse('Publish log and queue job') },
      },
    },
    '/api/contents/{id}/move-to-published': {
      post: {
        tags: ['Contents'],
        summary: 'Move content to published',
        parameters: [pathParam('id')],
        requestBody: requestBody({ platform: platformSchema }, ['platform']),
        responses: { 200: jsonResponse('Move result') },
      },
    },

    '/api/accounts': {
      get: {
        tags: ['Accounts'],
        summary: 'List accounts',
        parameters: [queryParam('platform'), queryParam('status')],
        responses: { 200: jsonResponse('Account list') },
      },
      post: {
        tags: ['Accounts'],
        summary: 'Create account',
        requestBody: requestBody(
          {
            name: { type: 'string' },
            platform: platformSchema,
            groupId: { type: 'string' },
            username: { type: 'string' },
            remark: { type: 'string' },
          },
          ['name', 'platform']
        ),
        responses: { 200: jsonResponse('Created account') },
      },
    },
    '/api/accounts/{id}': {
      get: {
        tags: ['Accounts'],
        summary: 'Get account detail',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Account detail') },
      },
      put: {
        tags: ['Accounts'],
        summary: 'Update account',
        parameters: [pathParam('id')],
        requestBody: requestBody({
          name: { type: 'string' },
          platform: platformSchema,
          groupId: { type: 'string' },
          username: { type: 'string' },
          remark: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
        }),
        responses: { 200: jsonResponse('Updated account') },
      },
      delete: {
        tags: ['Accounts'],
        summary: 'Delete account',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Delete result') },
      },
    },
    '/api/accounts/{id}/toggle-status': {
      post: {
        tags: ['Accounts'],
        summary: 'Toggle account status',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Updated account status') },
      },
    },
    '/api/accounts/{id}/cookies': {
      post: {
        tags: ['Accounts'],
        summary: 'Import encrypted account cookies',
        parameters: [pathParam('id')],
        requestBody: requestBody({
          cookies: {
            oneOf: [{ type: 'array', items: cookieSchema }, { type: 'string' }],
          },
          password: { type: 'string' },
        }),
        responses: { 200: jsonResponse('Cookie import result') },
      },
      delete: {
        tags: ['Accounts'],
        summary: 'Delete account cookies',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Cookie delete result') },
      },
    },
    '/api/accounts/{id}/cookies/check-login': {
      post: {
        tags: ['Accounts'],
        summary: 'Request gateway check-login',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Check-login request result') },
      },
    },
    '/api/accounts/{id}/cookies/verify': {
      get: {
        tags: ['Accounts'],
        summary: 'Verify account cookies locally',
        parameters: [pathParam('id'), queryParam('password')],
        responses: { 200: jsonResponse('Cookie verification result') },
      },
    },
    '/api/accounts/cookies/batch-import': {
      post: {
        tags: ['Accounts'],
        summary: 'Batch import account cookies',
        requestBody: requestBody(
          {
            imports: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  cookies: { type: 'array', items: cookieSchema },
                  password: { type: 'string' },
                },
                required: ['accountId', 'cookies'],
              },
            },
          },
          ['imports']
        ),
        responses: { 200: jsonResponse('Batch import result') },
      },
    },

    '/api/publish-status/content/{contentId}': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish logs for content',
        parameters: [pathParam('contentId')],
        responses: { 200: jsonResponse('Publish logs') },
      },
    },
    '/api/publish-status/account/all': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish history for all accounts',
        parameters: [queryParam('limit', { type: 'string', default: '20' }), queryParam('offset')],
        responses: { 200: jsonResponse('Publish history') },
      },
    },
    '/api/publish-status/account/{accountId}': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish history for an account',
        parameters: [pathParam('accountId'), queryParam('limit'), queryParam('offset')],
        responses: { 200: jsonResponse('Publish history') },
      },
    },
    '/api/publish-status/stats': {
      get: {
        tags: ['PublishStatus'],
        summary: 'Get publish statistics',
        responses: { 200: jsonResponse('Publish stats') },
      },
    },
    '/api/publish-status/{id}/retry': {
      post: {
        tags: ['PublishStatus'],
        summary: 'Retry a failed publish log',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse('Retry result') },
      },
    },

    '/api/publish': {
      post: {
        tags: ['Publish'],
        summary: 'Create generic publish job',
        requestBody: requestBody(
          {
            platform: platformSchema,
            accountId: { type: 'string' },
            accountName: { type: 'string' },
            action: { type: 'string' },
            payload: { type: 'object', additionalProperties: true },
          },
          ['platform', 'accountId', 'action']
        ),
        responses: {
          200: jsonResponse('Queued job'),
          400: jsonResponse('Missing routing fields'),
        },
      },
    },
    '/api/publish/progress': {
      get: {
        tags: ['Publish'],
        summary: 'Server-sent publish progress stream',
        responses: {
          200: {
            description: 'SSE progress stream',
            content: textEventStreamContent,
          },
        },
      },
    },
    '/api/publish/{jobId}': {
      get: {
        tags: ['Publish'],
        summary: 'Get generic publish job state',
        parameters: [pathParam('jobId')],
        responses: {
          200: jsonResponse('Queue state'),
          404: jsonResponse('Job not found'),
        },
      },
    },

    '/api/xhs/login/qrcode': {
      get: {
        tags: ['XHS'],
        summary: 'Get XHS MCP login QR code',
        parameters: [queryParam('instance', { type: 'string', default: 'xhs-1' })],
        responses: {
          200: jsonResponse('QR code auth init result'),
          404: jsonResponse('MCP instance not found'),
        },
      },
    },
    '/api/xhs/login/status': {
      get: {
        tags: ['XHS'],
        summary: 'Check XHS MCP login status',
        parameters: [queryParam('instance', { type: 'string', default: 'xhs-1' })],
        responses: {
          200: jsonResponse('Auth status'),
          404: jsonResponse('MCP instance not found'),
        },
      },
    },
    '/api/xhs/login/refresh': {
      post: {
        tags: ['XHS'],
        summary: 'Refresh XHS MCP login',
        parameters: [queryParam('instance', { type: 'string', default: 'xhs-1' })],
        responses: {
          200: jsonResponse('Auth init result'),
          404: jsonResponse('MCP instance not found'),
        },
      },
    },
    '/api/xhs/publish': {
      post: {
        tags: ['XHS'],
        summary: 'Queue XHS image/text publish job',
        requestBody: requestBody(
          {
            accountId: { type: 'string' },
            accountName: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            images: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            scheduleAt: { type: 'string' },
            visibility: { type: 'string' },
            isOriginal: { type: 'boolean' },
            products: { type: 'array', items: {} },
          },
          ['accountId', 'title', 'content']
        ),
        responses: {
          200: jsonResponse('Queued job'),
          400: jsonResponse('Missing required fields'),
        },
      },
    },
    '/api/xhs/publish/video': {
      post: {
        tags: ['XHS'],
        summary: 'Queue XHS video publish job',
        requestBody: requestBody(
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
        ),
        responses: {
          200: jsonResponse('Queued job'),
          400: jsonResponse('Missing required fields'),
        },
      },
    },

    '/api/media/roots': {
      get: { tags: ['Media'], summary: 'List media roots', responses: { 200: jsonResponse() } },
    },
    '/api/media/favorites': {
      get: { tags: ['Media'], summary: 'List media favorites', responses: { 200: jsonResponse() } },
      post: {
        tags: ['Media'],
        summary: 'Add media favorite',
        requestBody: requestBody(
          {
            rootId: { type: 'string' },
            relativePath: { type: 'string' },
            label: { type: 'string' },
            pinned: { type: 'boolean' },
          },
          ['rootId', 'relativePath']
        ),
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/favorites/{id}': {
      patch: {
        tags: ['Media'],
        summary: 'Update media favorite',
        parameters: [pathParam('id')],
        requestBody: requestBody({ label: { type: 'string' }, pinned: { type: 'boolean' } }),
        responses: { 200: jsonResponse() },
      },
      delete: {
        tags: ['Media'],
        summary: 'Delete media favorite',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/date-tree': {
      get: {
        tags: ['Media'],
        summary: 'Get media date tree',
        parameters: [queryParam('rootId')],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/folder-tree': {
      get: {
        tags: ['Media'],
        summary: 'Get media folder tree',
        parameters: [queryParam('rootId'), queryParam('path')],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/folder-summary': {
      get: {
        tags: ['Media'],
        summary: 'Get media folder summary',
        parameters: [queryParam('rootId'), queryParam('path')],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/items': {
      get: {
        tags: ['Media'],
        summary: 'List media items',
        parameters: [
          queryParam('rootId'),
          queryParam('path'),
          queryParam('recursive'),
          queryParam('limit'),
          queryParam('cursor'),
        ],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/tags': {
      get: {
        tags: ['Media'],
        summary: 'Get media folder tags',
        parameters: [queryParam('rootId'), queryParam('path')],
        responses: { 200: jsonResponse() },
      },
      post: {
        tags: ['Media'],
        summary: 'Set media folder tags',
        requestBody: requestBody(
          {
            rootId: { type: 'string' },
            path: { type: 'string' },
            tags: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
            },
          },
          ['rootId', 'path', 'tags']
        ),
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/thumb/{assetKey}': {
      get: {
        tags: ['Media'],
        summary: 'Read media thumbnail',
        parameters: [pathParam('assetKey')],
        responses: { 200: binaryResponse('Thumbnail') },
      },
    },
    '/api/media/file/{assetKey}': {
      get: {
        tags: ['Media'],
        summary: 'Read media file',
        parameters: [pathParam('assetKey')],
        responses: { 200: binaryResponse('Media file') },
      },
    },

    '/api/media/actions/definitions': {
      get: {
        tags: ['MediaActions'],
        summary: 'List media action definitions',
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/actions': {
      get: {
        tags: ['MediaActions'],
        summary: 'List recent media actions',
        parameters: [queryParam('limit', { type: 'number', default: 20 })],
        responses: { 200: jsonResponse() },
      },
      post: {
        tags: ['MediaActions'],
        summary: 'Submit media action',
        requestBody: requestBody(
          {
            actionType: { type: 'string' },
            operator: { type: 'string' },
            assets: {
              type: 'array',
              items: {
                type: 'object',
                properties: { rootId: { type: 'string' }, relativePath: { type: 'string' } },
                required: ['rootId', 'relativePath'],
              },
            },
            formData: { type: 'object', additionalProperties: true },
            context: { type: 'object', additionalProperties: true },
          },
          ['actionType', 'assets']
        ),
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/actions/{id}': {
      get: {
        tags: ['MediaActions'],
        summary: 'Get media action detail',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse(), 404: jsonResponse('Media action not found') },
      },
      delete: {
        tags: ['MediaActions'],
        summary: 'Delete media action',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse(), 404: jsonResponse('Media action not found') },
      },
    },
    '/api/media/actions/{id}/retry': {
      post: {
        tags: ['MediaActions'],
        summary: 'Retry media action',
        parameters: [pathParam('id')],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/actions/{id}/uploads/{filepath}': {
      get: {
        tags: ['MediaActions'],
        summary: 'Read uploaded result for a media action',
        parameters: [pathParam('id'), pathParam('filepath', 'Wildcard file path')],
        responses: {
          200: binaryResponse('Upload file'),
          404: jsonResponse('Upload file not found'),
        },
      },
    },
    '/api/media/actions/uploads/roots': {
      get: {
        tags: ['MediaActions'],
        summary: 'List upload browser roots',
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/actions/uploads/tree': {
      get: {
        tags: ['MediaActions'],
        summary: 'Get upload result tree',
        parameters: [queryParam('provider'), queryParam('path')],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/actions/uploads/items': {
      get: {
        tags: ['MediaActions'],
        summary: 'List upload result items',
        parameters: [
          queryParam('provider'),
          queryParam('path'),
          queryParam('recursive'),
          queryParam('limit'),
          queryParam('cursor'),
        ],
        responses: { 200: jsonResponse() },
      },
    },
    '/api/media/actions/uploads/{provider}/{filepath}': {
      get: {
        tags: ['MediaActions'],
        summary: 'Read upload browser file',
        parameters: [pathParam('provider'), pathParam('filepath', 'Wildcard file path')],
        responses: {
          200: binaryResponse('Upload file'),
          404: jsonResponse('Upload file not found'),
        },
      },
      delete: {
        tags: ['MediaActions'],
        summary: 'Delete upload browser file',
        parameters: [pathParam('provider'), pathParam('filepath', 'Wildcard file path')],
        responses: { 200: jsonResponse('Delete result'), 400: jsonResponse('Delete failed') },
      },
    },

    '/api/webhook/{platform}/publish-result': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive publish result callback',
        security: [{ bearerAuth: [] }],
        parameters: [pathParam('platform')],
        requestBody: requestBody({
          version: { type: 'string' },
          eventId: { type: 'string' },
          kind: { type: 'string' },
          taskId: { type: 'string' },
          actionType: { type: 'string' },
          status: { type: 'string' },
          refs: { type: 'object', additionalProperties: true },
          target: { type: 'object', additionalProperties: true },
          result: { type: 'object', additionalProperties: true },
        }),
        responses: { 200: jsonResponse('Callback result'), 401: jsonResponse('Unauthorized') },
      },
    },
    '/api/webhook/media-actions/{actionType}/result': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive media action result callback',
        security: [{ bearerAuth: [] }],
        parameters: [pathParam('actionType')],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', additionalProperties: true } },
            'multipart/form-data': { schema: { type: 'object', additionalProperties: true } },
          },
        },
        responses: { 200: jsonResponse('Callback result'), 401: jsonResponse('Unauthorized') },
      },
    },
    '/api/webhook/{platform}/check-login-result': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive check-login result callback',
        security: [{ bearerAuth: [] }],
        parameters: [pathParam('platform')],
        requestBody: requestBody({
          version: { type: 'string' },
          eventId: { type: 'string' },
          kind: { type: 'string' },
          taskId: { type: 'string' },
          actionType: { type: 'string' },
          status: { type: 'string' },
          refs: { type: 'object', additionalProperties: true },
          result: { type: 'object', additionalProperties: true },
        }),
        responses: { 200: jsonResponse('Callback result'), 401: jsonResponse('Unauthorized') },
      },
    },

    '/ws': {
      get: {
        tags: ['Realtime'],
        summary: 'WebSocket endpoint for realtime frontend notifications',
        description: 'Use WebSocket upgrade. Client ping messages receive pong responses.',
        responses: { 101: { description: 'WebSocket upgrade' } },
      },
    },
  },
} as const;

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
      url: '/api-doc/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
    });
  </script>
</body>
</html>`;

export function setupApiDocRoutes() {
  return new Elysia()
    .get('/api-doc/openapi.json', ({ set }) => {
      set.headers['Cache-Control'] = 'no-store';
      return openApiDocument;
    })
    .get('/api-doc', ({ set }) => {
      set.headers['Content-Type'] = 'text/html; charset=utf-8';
      return new Response(swaggerHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    });
}
