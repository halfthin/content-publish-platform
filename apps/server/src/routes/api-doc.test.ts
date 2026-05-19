import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { setupRoutes } from './index';

function normalizeDocumentedEndpoint(method: string, rawPath: string) {
  const withoutQuery = rawPath.split('?')[0];
  const normalizedPath = withoutQuery
    .replace(/\*([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');

  return {
    method: method === 'WS' ? 'get' : method.toLowerCase(),
    path: normalizedPath,
  };
}

describe('api documentation routes', () => {
  const app = new Elysia().use(setupRoutes());

  it('serves an OpenAPI document for Swagger UI', async () => {
    const res = await app.handle(new Request('http://localhost/docs/openapi.json'));
    const spec = await res.json();

    expect(res.status).toBe(200);
    expect(spec.openapi).toStartWith('3.');
    expect(spec.info.title).toBe('Content Publish Platform API');
    expect(spec.paths['/ready'].get).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.info.description).toContain('EXPOSE_DOCS');
    expect(spec.info.description).toContain('RUN_REAL_XHS_TESTS');
    expect(
      spec.paths['/api/publish'].post.requestBody.content['application/json'].schema
    ).toMatchObject({
      required: ['platform', 'accountId', 'action'],
      properties: {
        accountName: { type: 'string' },
        action: { type: 'string' },
        payload: { type: 'object', additionalProperties: true },
      },
    });
    expect(
      spec.paths['/api/xhs/publish'].post.requestBody.content['application/json'].schema.properties
    ).toMatchObject({
      accountName: { type: 'string' },
      scheduleAt: { type: 'string' },
      visibility: { type: 'string' },
      isOriginal: { type: 'boolean' },
    });
    expect(spec.paths['/api/xhs/login/status'].get.responses['404']).toBeDefined();
  });

  it('exposes frontend-agent UI guidance in the OpenAPI contract', async () => {
    const res = await app.handle(new Request('http://localhost/docs/openapi.json'));
    const spec = await res.json();

    expect(res.status).toBe(200);
    expect(spec['x-frontend-agent'].intendedConsumer).toContain('frontend design agent');
    expect(spec['x-frontend-agent'].mvpNavigation).toEqual([
      '内容库',
      '账号管理',
      '发布状态',
      '小红书',
    ]);

    const contentsTag = spec.tags.find((tag: { name: string }) => tag.name === 'Contents');
    expect(contentsTag['x-ui'].navLabel).toBe('内容库');
    expect(contentsTag['x-ui'].stateMachine).toContain('PENDING');

    expect(spec.paths['/api/contents'].get['x-ui']).toMatchObject({
      view: 'content-list',
      primaryActions: ['scanInbox', 'openDetail'],
    });
    expect(spec.paths['/api/contents/{id}/publish'].post['x-ui']).toMatchObject({
      action: 'publish',
      visibleWhen: { status: 'APPROVED' },
    });
  });

  it('serves a Swagger UI page wired to the OpenAPI document', async () => {
    const res = await app.handle(new Request('http://localhost/docs'));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('/docs/openapi.json');
  });

  it('keeps documented HTTP endpoints represented in OpenAPI paths', async () => {
    const markdown = await Bun.file('../../docs/API.md').text();
    const documentedEndpoints = Array.from(
      markdown.matchAll(/^### (GET|POST|PUT|PATCH|DELETE|WS) `([^`]+)`/gm)
    ).map((match) => normalizeDocumentedEndpoint(match[1], match[2]));

    const res = await app.handle(new Request('http://localhost/docs/openapi.json'));
    const spec = await res.json();

    expect(documentedEndpoints.length).toBeGreaterThan(50);
    for (const endpoint of documentedEndpoints) {
      expect(spec.paths[endpoint.path]?.[endpoint.method]).toBeDefined();
    }
  });
});
