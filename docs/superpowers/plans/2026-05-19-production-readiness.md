# 生产就绪实施计划

> **给 agent 工作者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪进度。

**目标：** 将 `apps/server` API 服务推进到具备生产上线门禁：配置校验、管理鉴权、readiness、smoke、发布闭环测试、真实 XHS 测试门禁、Docker 与 runbook 全部可验证。

**架构：** 采用分层交付：先集中配置 schema，再把 `/health` 与 `/ready` 从通用路由中拆出，随后在路由入口添加生产管理鉴权和 docs 暴露开关。发布闭环通过默认 mock 测试验证状态流转，真实第三方发布只通过显式门禁运行。

**技术栈：** Bun, Elysia, TypeScript, Prisma, BullMQ/Redis, Biome, Bash smoke 脚本, OpenAPI `/docs`.

---

## 文件结构与职责

- 新建： `apps/server/src/config/env.ts` — 统一环境变量读取、生产必填校验、弱密钥拦截、URL/JSON 校验。
- 新建： `apps/server/src/config/env.test.ts` — env schema 单元测试，覆盖 dev/test 宽松与 production 严格行为。
- 新建： `apps/server/src/middleware/auth.ts` — Elysia 管理 API Bearer Token 鉴权、public route 与 webhook route 分流、docs 开关。
- 新建： `apps/server/src/middleware/auth.test.ts` — 管理鉴权、docs 开关、webhook 独立鉴权单元测试。
- 新建： `apps/server/src/routes/health.ts` — `/health` liveness 与 `/ready` readiness 路由。
- 新建： `apps/server/src/routes/health.test.ts` — readiness 注入式检查测试。
- 修改： `apps/server/src/routes/index.ts` — 使用 health route、鉴权 middleware，并保持既有业务路由挂载顺序。
- 修改： `apps/server/src/index.ts` — 启动早期加载 env 并在 production 执行配置校验。
- 修改： `apps/server/src/routes/api-doc.ts` — OpenAPI 增补管理鉴权、`/ready`、docs 暴露说明。
- 修改： `apps/server/src/routes/api-doc.test.ts` — 同步验证 `/ready` 和安全文档。
- 新建： `apps/server/src/routes/publish-flow.test.ts` — 默认无副作用发布闭环测试。
- 新建： `tests/real-xhs-smoke.test.ts` — 真实 XHS 发布门禁测试，默认 skip。
- 新建： `scripts/smoke-api.sh` — 部署后 smoke 验证脚本。
- 修改： `.env.example` — 根目录生产变量样例与端口对齐。
- 修改： `apps/server/.env.example` — server env 样例与生产必填变量对齐。
- 修改： `docker/docker-compose.yml` — server-only API 端口、env、volume、network 对齐。
- 新建： `docs/PRODUCTION_READINESS.md` — 生产 runbook、checklist、验证状态。
- 修改： `docs/API.md` — 更新鉴权、`/ready`、测试门禁、当前验证状态。

---

### 任务 1：环境变量 schema 与生产配置校验

**文件：**
- 新建： `apps/server/src/config/env.ts`
- 新建： `apps/server/src/config/env.test.ts`
- 修改： `apps/server/src/index.ts`
- 修改： `.env.example`
- 修改： `apps/server/.env.example`

- [ ] **步骤 1：写失败测试：production 缺必填变量时返回错误**

创建 `apps/server/src/config/env.test.ts`，写入以下初始测试代码块：

```ts
import { describe, expect, it } from 'bun:test';
import { validateEnv } from './env';

describe('env config validation', () => {
  it('rejects production config when required variables are missing', () => {
    const result = validateEnv({ NODE_ENV: 'production' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('DATABASE_URL is required in production');
    expect(result.errors).toContain('REDIS_URL is required in production');
    expect(result.errors).toContain('API_AUTH_TOKEN is required in production');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
cd apps/server && bun test src/config/env.test.ts
```

预期：失败，错误为 `./env` / `validateEnv` 导入或导出缺失。

- [ ] **步骤 3：实现最小 env schema**

创建 `apps/server/src/config/env.ts`：

```ts
type EnvInput = Record<string, string | undefined>;

export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const PRODUCTION_REQUIRED_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'COOKIE_ENCRYPTION_KEY',
  'COOKIE_ENCRYPTION_SALT',
  'API_AUTH_TOKEN',
  'CPP_TO_GATEWAY_TOKEN',
  'CPP_FROM_GATEWAY_TOKEN',
  'API_BASE_URL',
  'CONTENT_DIR',
] as const;

const WEAK_SECRET_VALUES = new Set([
  '',
  'change-me',
  'your-gateway-token',
  'your-callback-token',
  'your-32-char-secret-key-here!!!',
  'dev-key-change-in-production-32chars!!',
  'dev-salt',
]);

function runtimeOf(env: EnvInput): RuntimeEnvironment {
  if (env.NODE_ENV === 'production') return 'production';
  if (env.NODE_ENV === 'test') return 'test';
  return 'development';
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isWeakSecret(value: string | undefined): boolean {
  if (!isPresent(value)) return true;
  return WEAK_SECRET_VALUES.has(value) || value.length < 24;
}

function isValidUrl(value: string | undefined): boolean {
  if (!isPresent(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidXhsInstances(value: string | undefined): boolean {
  if (!isPresent(value)) return true;
  try {
    const parsed = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof item.name === 'string' &&
          item.name.length > 0 &&
          typeof item.url === 'string' &&
          isValidUrl(item.url)
      )
    );
  } catch {
    return false;
  }
}

export function validateEnv(env: EnvInput = process.env): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const runtime = runtimeOf(env);

  if (runtime === 'production') {
    for (const key of PRODUCTION_REQUIRED_KEYS) {
      if (!isPresent(env[key])) {
        errors.push(`${key} is required in production`);
      }
    }

    for (const key of [
      'COOKIE_ENCRYPTION_KEY',
      'COOKIE_ENCRYPTION_SALT',
      'API_AUTH_TOKEN',
      'CPP_TO_GATEWAY_TOKEN',
      'CPP_FROM_GATEWAY_TOKEN',
    ]) {
      if (isWeakSecret(env[key])) {
        errors.push(`${key} must be a non-placeholder secret in production`);
      }
    }

    for (const key of ['DATABASE_URL', 'REDIS_URL', 'API_BASE_URL', 'OPENCLAW_GATEWAY_URL']) {
      if (isPresent(env[key]) && !isValidUrl(env[key])) {
        errors.push(`${key} must be a valid URL`);
      }
    }
  }

  if (!isValidXhsInstances(env.XHS_MCP_INSTANCES)) {
    errors.push('XHS_MCP_INSTANCES must be a JSON array of { name, url } objects');
  }

  if (runtime !== 'production' && isWeakSecret(env.COOKIE_ENCRYPTION_KEY)) {
    warnings.push('COOKIE_ENCRYPTION_KEY is weak; use a strong value before production');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function assertValidProductionEnv(env: EnvInput = process.env): void {
  const result = validateEnv(env);
  if (!result.valid) {
    throw new Error(`Invalid production environment:\n${result.errors.join('\n')}`);
  }
}
```

- [ ] **步骤 4：运行 env 测试确认通过**

运行：

```bash
cd apps/server && bun test src/config/env.test.ts
```

预期：通过，1 个测试，0 个失败。

- [ ] **步骤 5：增加弱密钥、URL、XHS JSON 测试**

追加到 `apps/server/src/config/env.test.ts`：

```ts
  it('rejects weak production secrets', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
      REDIS_URL: 'redis://localhost:6379/0',
      COOKIE_ENCRYPTION_KEY: 'change-me',
      COOKIE_ENCRYPTION_SALT: 'dev-salt',
      API_AUTH_TOKEN: 'short',
      CPP_TO_GATEWAY_TOKEN: 'your-gateway-token',
      CPP_FROM_GATEWAY_TOKEN: 'your-callback-token',
      API_BASE_URL: 'http://localhost:50000',
      CONTENT_DIR: './content',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'COOKIE_ENCRYPTION_KEY must be a non-placeholder secret in production'
    );
    expect(result.errors).toContain(
      'API_AUTH_TOKEN must be a non-placeholder secret in production'
    );
  });

  it('accepts complete production config with strong secrets', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@db:5432/app',
      REDIS_URL: 'redis://redis:6379/0',
      COOKIE_ENCRYPTION_KEY: 'prod-cookie-key-32-characters-minimum',
      COOKIE_ENCRYPTION_SALT: 'prod-cookie-salt-32-characters-minimum',
      API_AUTH_TOKEN: 'prod-api-auth-token-32-characters-minimum',
      CPP_TO_GATEWAY_TOKEN: 'prod-to-gateway-token-32-characters-minimum',
      CPP_FROM_GATEWAY_TOKEN: 'prod-from-gateway-token-32-characters-minimum',
      API_BASE_URL: 'https://api.example.com',
      CONTENT_DIR: '/data/content',
      XHS_MCP_INSTANCES: '[{"name":"xhs-1","url":"http://xhs-mcp:5601"}]',
    });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('rejects malformed XHS_MCP_INSTANCES JSON', () => {
    const result = validateEnv({ NODE_ENV: 'development', XHS_MCP_INSTANCES: 'not-json' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'XHS_MCP_INSTANCES must be a JSON array of { name, url } objects'
    );
  });
```

- [ ] **步骤 6：运行 env 测试确认新增场景通过**

运行：

```bash
cd apps/server && bun test src/config/env.test.ts
```

预期：通过，4 个测试，0 个失败。

- [ ] **步骤 7：在启动入口接入 production env 校验**

在 env 加载附近修改 `apps/server/src/index.ts`：

```ts
import { assertValidProductionEnv } from './config/env';
```

After `config({ path: '.env', override: true });`, add:

```ts
if (process.env.NODE_ENV === 'production') {
  assertValidProductionEnv();
}
```

- [ ] **步骤 8：更新 env example**

Update both `.env.example` and `apps/server/.env.example` so they include these keys with non-secret placeholder names that clearly require replacement:

```env
API_AUTH_TOKEN="replace-with-production-api-auth-token"
EXPOSE_DOCS=false
API_BASE_URL="http://localhost:50000"
CPP_TO_GATEWAY_TOKEN="replace-with-production-to-gateway-token"
CPP_FROM_GATEWAY_TOKEN="replace-with-production-from-gateway-token"
XHS_MCP_INSTANCES=[]
RUN_REAL_XHS_TESTS=false
```

Also ensure root `API_BASE_URL` is `http://localhost:50000`, not `http://localhost:3000`.

- [ ] **步骤 9：运行检查和目标测试**

运行：

```bash
cd apps/server && bun run check
cd apps/server && bun test src/config/env.test.ts
```

预期：`bun run check` 退出码为 0；env 测试通过，4 个测试，0 个失败。

- [ ] **步骤 10：提交任务 1**

运行：

```bash
git add apps/server/src/config/env.ts apps/server/src/config/env.test.ts apps/server/src/index.ts .env.example apps/server/.env.example
git commit -m "feat: validate production environment" \
  -m "Add a production env validation boundary so the API 服务 fails fast on missing required configuration or weak secrets." \
  -m "Constraint: Production startup must not silently use placeholder secrets or missing infrastructure URLs." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Tested: cd apps/server && bun test src/config/env.test.ts" \
  -m "Not-tested: Full deployment startup with real production secrets."
```

---

### 任务 2：拆分 `/health` 与 `/ready`

**文件：**
- 新建： `apps/server/src/routes/health.ts`
- 新建： `apps/server/src/routes/health.test.ts`
- 修改： `apps/server/src/routes/index.ts`
- 修改： `apps/server/src/routes/api-doc.ts`
- 修改： `apps/server/src/routes/api-doc.test.ts`

- [ ] **步骤 1：写失败测试：health 公开、ready 聚合检查结果**

创建 `apps/server/src/routes/health.test.ts`：

```ts
import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { setupHealthRoutes } from './health';

describe('health routes', () => {
  it('GET /health returns liveness status', async () => {
    const app = new Elysia().use(setupHealthRoutes());

    const res = await app.handle(new Request('http://localhost/health'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(typeof data.timestamp).toBe('string');
  });

  it('GET /ready returns ready when all checks pass', async () => {
    const app = new Elysia().use(
      setupHealthRoutes({
        checks: {
          env: async () => ({ status: 'ok' }),
          database: async () => ({ status: 'ok' }),
          redis: async () => ({ status: 'ok' }),
          contentDir: async () => ({ status: 'ok' }),
          gateway: async () => ({ status: 'ok' }),
        },
      })
    );

    const res = await app.handle(new Request('http://localhost/ready'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      status: 'ready',
      checks: {
        env: { status: 'ok' },
        database: { status: 'ok' },
        redis: { status: 'ok' },
        contentDir: { status: 'ok' },
        gateway: { status: 'ok' },
      },
    });
  });

  it('GET /ready returns 503 when one check fails', async () => {
    const app = new Elysia().use(
      setupHealthRoutes({
        checks: {
          env: async () => ({ status: 'ok' }),
          database: async () => ({ status: 'error', message: 'database unreachable' }),
          redis: async () => ({ status: 'ok' }),
          contentDir: async () => ({ status: 'ok' }),
          gateway: async () => ({ status: 'ok' }),
        },
      })
    );

    const res = await app.handle(new Request('http://localhost/ready'));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.status).toBe('unready');
    expect(data.checks.database).toEqual({ status: 'error', message: 'database unreachable' });
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
cd apps/server && bun test src/routes/health.test.ts
```

预期：失败，因为 `./health` 缺失。

- [ ] **步骤 3：实现 health route 和可注入 readiness checks**

创建 `apps/server/src/routes/health.ts`：

```ts
import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Elysia } from 'elysia';
import { validateEnv } from '../config/env';
import { prisma } from '../config/prisma';
import { getRedisClient } from '../config/redis';

type CheckStatus = 'ok' | 'warn' | 'error';

export interface ReadinessCheckResult {
  status: CheckStatus;
  message?: string;
}

export type ReadinessCheck = () => Promise<ReadinessCheckResult>;

export interface HealthRouteOptions {
  checks?: Record<string, ReadinessCheck>;
}

async function envCheck(): Promise<ReadinessCheckResult> {
  const result = validateEnv();
  if (!result.valid) {
    return { status: 'error', message: result.errors.join('; ') };
  }
  return result.warnings.length > 0
    ? { status: 'warn', message: result.warnings.join('; ') }
    : { status: 'ok' };
}

async function databaseCheck(): Promise<ReadinessCheckResult> {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok' };
}

async function redisCheck(): Promise<ReadinessCheckResult> {
  const redis = getRedisClient();
  const pong = await redis.ping();
  return pong === 'PONG' ? { status: 'ok' } : { status: 'error', message: `Unexpected ${pong}` };
}

async function contentDirCheck(): Promise<ReadinessCheckResult> {
  const root = resolve(process.cwd(), process.env.CONTENT_DIR || './content');
  await mkdir(join(root, 'inbox'), { recursive: true });
  await mkdir(join(root, 'approved'), { recursive: true });
  await mkdir(join(root, 'published'), { recursive: true });
  await access(root);
  return { status: 'ok' };
}

async function gatewayCheck(): Promise<ReadinessCheckResult> {
  if (process.env.PUBLISH_MODE === 'local') {
    return { status: 'warn', message: 'PUBLISH_MODE=local' };
  }
  if (!process.env.OPENCLAW_GATEWAY_URL) {
    return { status: 'warn', message: 'OPENCLAW_GATEWAY_URL is not configured' };
  }
  return { status: 'ok' };
}

const defaultChecks: Record<string, ReadinessCheck> = {
  env: envCheck,
  database: databaseCheck,
  redis: redisCheck,
  contentDir: contentDirCheck,
  gateway: gatewayCheck,
};

export function setupHealthRoutes(options: HealthRouteOptions = {}) {
  const checks = options.checks || defaultChecks;

  return new Elysia()
    .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
    .get('/ready', async ({ set }) => {
      const entries = await Promise.all(
        Object.entries(checks).map(async ([name, check]) => {
          try {
            return [name, await check()] as const;
          } catch (error) {
            return [name, { status: 'error', message: String(error) }] as const;
          }
        })
      );
      const results = Object.fromEntries(entries);
      const hasError = entries.some(([, result]) => result.status === 'error');

      if (hasError) {
        set.status = 503;
      }

      return {
        status: hasError ? 'unready' : 'ready',
        checks: results,
        timestamp: new Date().toISOString(),
      };
    });
}
```

- [ ] **步骤 4：更新 route index 使用 health route**

修改 `apps/server/src/routes/index.ts`：

```ts
import { setupHealthRoutes } from './health';
```

Replace the inline `.get('/health', ...)` block with:

```ts
      .use(setupHealthRoutes())
```

保持根路径 `/` 路由不变。

- [ ] **步骤 5：更新 OpenAPI 文档与测试**

在 `apps/server/src/routes/api-doc.ts` 中，把 `/ready` 加入 Health paths，并包含 `status`、`checks`、`timestamp` schema 字段。

在 `apps/server/src/routes/api-doc.test.ts` 中加入：

```ts
expect(spec.paths['/ready'].get).toBeDefined();
```

inside `serves an OpenAPI document for Swagger UI`.

- [ ] **步骤 6：运行 health 和 api-doc 测试**

运行：

```bash
cd apps/server && bun test src/routes/health.test.ts src/routes/api-doc.test.ts
```

预期：health 测试和 api-doc 测试通过，0 个失败。

- [ ] **步骤 7：运行 check**

运行：

```bash
cd apps/server && bun run check
```

预期： exit 0.

- [ ] **步骤 8：提交任务 2**

运行：

```bash
git add apps/server/src/routes/health.ts apps/server/src/routes/health.test.ts apps/server/src/routes/index.ts apps/server/src/routes/api-doc.ts apps/server/src/routes/api-doc.test.ts
git commit -m "feat: add readiness checks" \
  -m "Split liveness from readiness so deployments can 门禁 traffic on configuration and dependency health." \
  -m "Constraint: /health remains lightweight while /ready may inspect DB, Redis, content storage, and configuration." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: cd apps/server && bun test src/routes/health.test.ts src/routes/api-doc.test.ts" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Not-tested: Readiness against production DB/Redis endpoints."
```

---

### 任务 3：管理 API 鉴权与 docs 暴露开关

**文件：**
- 新建： `apps/server/src/middleware/auth.ts`
- 新建： `apps/server/src/middleware/auth.test.ts`
- 修改： `apps/server/src/routes/index.ts`
- 修改： `apps/server/src/routes/api-doc.ts`
- 修改： `apps/server/src/routes/api-doc.test.ts`

- [ ] **步骤 1：写失败测试：production 下 `/api/*` 需要管理 token**

创建 `apps/server/src/middleware/auth.test.ts`：

```ts
import { afterEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { setupAuthMiddleware } from './auth';

describe('鉴权 middleware', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createApp() {
    return new Elysia()
      .use(setupAuthMiddleware())
      .get('/health', () => ({ status: 'ok' }))
      .get('/ready', () => ({ status: 'ready' }))
      .get('/docs', () => 'docs')
      .get('/api/accounts', () => ({ success: true }))
      .post('/api/webhook/xhs/publish-result', () => ({ success: true }));
  }

  it('allows health without token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(new Request('http://localhost/health'));

    expect(res.status).toBe(200);
  });

  it('rejects protected api routes without token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(new Request('http://localhost/api/accounts'));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('allows protected api routes with correct bearer token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(
      new Request('http://localhost/api/accounts', {
        headers: { Authorization: 'Bearer prod-api-auth-token-32-characters-minimum' },
      })
    );

    expect(res.status).toBe(200);
  });

  it('does not apply management token to webhook routes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';

    const res = await createApp().handle(
      new Request('http://localhost/api/webhook/xhs/publish-result', { method: 'POST' })
    );

    expect(res.status).toBe(200);
  });

  it('hides docs when EXPOSE_DOCS is false in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_AUTH_TOKEN = 'prod-api-auth-token-32-characters-minimum';
    process.env.EXPOSE_DOCS = 'false';

    const res = await createApp().handle(new Request('http://localhost/docs'));

    expect(res.status).toBe(404);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
cd apps/server && bun test src/middleware/auth.test.ts
```

预期：失败，因为 `./auth` 缺失。

- [ ] **步骤 3：实现管理鉴权 middleware**

创建 `apps/server/src/middleware/auth.ts`：

```ts
import { Elysia } from 'elysia';
import { createLogger } from '../config/logger';

const logger = createLogger('auth');

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function docsExposed(): boolean {
  return process.env.EXPOSE_DOCS === 'true';
}

function isDocsPath(path: string): boolean {
  return path === '/docs' || path === '/docs/openapi.json';
}

function isPublicPath(path: string): boolean {
  return path === '/' || path === '/health' || path === '/ready' || path === '/ws';
}

function isWebhookPath(path: string): boolean {
  return path.startsWith('/api/webhook/');
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function isAuthorized(header: string | undefined): boolean {
  const expected = process.env.API_AUTH_TOKEN;
  if (!expected) return false;
  return extractBearerToken(header) === expected;
}

export function setupAuthMiddleware() {
  return new Elysia().onBeforeHandle(({ path, headers, set }) => {
    if (!isProduction()) {
      return;
    }

    if (isPublicPath(path)) {
      return;
    }

    if (isWebhookPath(path)) {
      return;
    }

    if (isDocsPath(path) && !docsExposed()) {
      set.status = 404;
      return 'Not Found';
    }

    if (isDocsPath(path) && docsExposed()) {
      return;
    }

    if (!path.startsWith('/api/')) {
      return;
    }

    if (!isAuthorized(headers.authorization)) {
      logger.warn('Unauthorized management API request', { path, reason: 'missing-or-invalid' });
      set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }
  });
}
```

- [ ] **步骤 4：运行 auth 测试确认通过**

运行：

```bash
cd apps/server && bun test src/middleware/auth.test.ts
```

预期：通过，5 个测试，0 个失败。

- [ ] **步骤 5：将 middleware 接入主路由**

修改 `apps/server/src/routes/index.ts`：

```ts
import { setupAuthMiddleware } from '../middleware/auth';
```

在 CORS `.use(...)` 之后、公开路由/业务路由之前加入：

```ts
      .use(setupAuthMiddleware())
```

- [ ] **步骤 6：更新 OpenAPI 安全文档**

在 `apps/server/src/routes/api-doc.ts` 中：

- Add or confirm `components.securitySchemes.bearerAuth` describes `API_AUTH_TOKEN` for management APIs.
- 为受保护的 `/api/*` 路由添加 operation description，说明生产环境需要 `Authorization: Bearer <API_AUTH_TOKEN>`。
- Add docs tag note: `/docs` may be disabled when `EXPOSE_DOCS=false`.

在 `apps/server/src/routes/api-doc.test.ts` 中加入断言：

```ts
expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
expect(spec.info.description).toContain('EXPOSE_DOCS');
```

- [ ] **步骤 7：运行路由测试**

运行：

```bash
cd apps/server && bun test src/middleware/auth.test.ts src/routes/api-doc.test.ts
```

预期：通过，0 个失败。

- [ ] **步骤 8：运行 check**

运行：

```bash
cd apps/server && bun run check
```

预期： exit 0.

- [ ] **步骤 9：提交任务 3**

运行：

```bash
git add apps/server/src/middleware/auth.ts apps/server/src/middleware/auth.test.ts apps/server/src/routes/index.ts apps/server/src/routes/api-doc.ts apps/server/src/routes/api-doc.test.ts
git commit -m "feat: protect production management APIs" \
  -m "Add a production-only management API bearer-token boundary while leaving health and webhook routes on their own access rules." \
  -m "Constraint: Webhook callback auth must remain independent from management API auth." \
  -m "Confidence: high" \
  -m "Scope-risk: moderate" \
  -m "Tested: cd apps/server && bun test src/middleware/auth.test.ts src/routes/api-doc.test.ts" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Not-tested: Reverse-proxy auth/header behavior in production infrastructure."
```

---

### 任务 4：Smoke 脚本与 Docker 配置对齐

**文件：**
- 新建： `scripts/smoke-api.sh`
- 修改： `docker/docker-compose.yml`
- 修改： `package.json`

- [ ] **步骤 1：写 smoke 脚本**

创建 `scripts/smoke-api.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${API_BASE_URL:-http://localhost:50000}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:-}"
EXPECT_DOCS="${EXPOSE_DOCS:-true}"

fail() {
  echo "✗ $1" >&2
  exit 1
}

pass() {
  echo "✓ $1"
}

request() {
  local method="$1"
  local path="$2"
  local extra_args=()
  if [[ -n "${API_AUTH_TOKEN}" ]]; then
    extra_args+=("-H" "Authorization: Bearer ${API_AUTH_TOKEN}")
  fi
  curl -fsS -X "${method}" "${extra_args[@]}" "${BASE_URL}${path}"
}

health_json="$(curl -fsS "${BASE_URL}/health")" || fail "/health failed"
echo "${health_json}" | grep -q '"status":"ok"\|"status": "ok"' || fail "/health did not return ok"
pass "/health ok"

ready_status="$(curl -sS -o /tmp/cpp-ready.json -w '%{http_code}' "${BASE_URL}/ready")"
if [[ "${ready_status}" != "200" ]]; then
  cat /tmp/cpp-ready.json >&2
  fail "/ready returned ${ready_status}"
fi
pass "/ready ok"

if [[ "${EXPECT_DOCS}" == "true" ]]; then
  curl -fsS "${BASE_URL}/docs/openapi.json" >/tmp/cpp-openapi.json || fail "/docs/openapi.json failed"
  pass "/docs/openapi.json available"
else
  docs_status="$(curl -sS -o /tmp/cpp-docs.json -w '%{http_code}' "${BASE_URL}/docs/openapi.json")"
  [[ "${docs_status}" == "404" ]] || fail "docs expected 404, got ${docs_status}"
  pass "docs disabled"
fi

if [[ -z "${API_AUTH_TOKEN}" ]]; then
  protected_status="$(curl -sS -o /tmp/cpp-protected.json -w '%{http_code}' "${BASE_URL}/api/accounts")"
  [[ "${protected_status}" == "401" || "${protected_status}" == "200" ]] || fail "unexpected /api/accounts status ${protected_status}"
  pass "/api/accounts protected status ${protected_status}"
else
  request GET /api/accounts >/tmp/cpp-accounts.json || fail "/api/accounts with auth failed"
  pass "/api/accounts with auth ok"
fi

curl -fsS --max-time 3 "${BASE_URL}/api/publish/progress" >/tmp/cpp-sse.txt || true
pass "SSE smoke attempted"
```

- [ ] **步骤 2：赋予 smoke 脚本执行权限**

运行：

```bash
chmod +x scripts/smoke-api.sh
```

- [ ] **步骤 3：更新 package script**

Modify root `package.json` scripts:

```json
"smoke:api": "bash scripts/smoke-api.sh"
```

- [ ] **步骤 4：对齐 server-only API 的 Docker compose 配置**

修改 `docker/docker-compose.yml`，使服务使用 `PORT=50000`、映射 `50000:50000`，并显式使用 content volume：

```yaml
services:
  server:
    build:
      context: ..
      dockerfile: docker/Dockerfile.server
    container_name: content-publish-server
    env_file:
      - .env.docker
    environment:
      NODE_ENV: production
      PORT: 50000
    ports:
      - "50000:50000"
    volumes:
      - ../content:/app/content
    networks:
      - web_net
```

Keep `extra_hosts` if Gateway/MCP access requires host networking.

- [ ] **步骤 5：检查 shell 语法**

运行：

```bash
bash -n scripts/smoke-api.sh
```

预期： exit 0.

- [ ] **步骤 6：检查 package.json 脚本配置**

运行：

```bash
bun pm pkg get scripts.smoke:api
```

预期：输出 `"bash scripts/smoke-api.sh"` 或等价 JSON 内容。

- [ ] **步骤 7：运行 check**

运行：

```bash
cd apps/server && bun run check
```

预期： exit 0.

- [ ] **步骤 8：提交任务 4**

运行：

```bash
git add scripts/smoke-api.sh docker/docker-compose.yml package.json
git commit -m "chore: add API smoke 门禁" \
  -m "Add a deployment smoke script and align Docker compose with the server-only API 服务 port and content volume." \
  -m "Constraint: Smoke must be safe to run after deployment without creating third-party publish side effects." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: bash -n scripts/smoke-api.sh" \
  -m "Tested: bun pm pkg get scripts.smoke:api" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Not-tested: Smoke against a live container in production infrastructure."
```

---

### 任务 5：默认无副作用发布闭环测试

**文件：**
- 新建： `apps/server/src/routes/publish-flow.test.ts`
- 仅在必要时修改：`apps/server/src/routes/contents.ts`、`apps/server/src/routes/webhook.ts`、`apps/server/src/routes/publish-status.ts`

- [ ] **步骤 1：写失败测试：已审核内容发布创建日志，webhook 完成闭环**

按照既有 mock 风格创建 `apps/server/src/routes/publish-flow.test.ts`：

```ts
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { setupContentsRoutes } from './contents';
import { setupWebhookRoutes } from './webhook';
import { createInMemoryOpenClawCallbackEventDeduper } from '../services/openclaw-callback-deduper';
import { createInMemoryAccountCheckLoginCallbackStore } from '../services/account-check-login-callbacks.service';

const contentRecord = {
  id: 'content-001',
  title: '测试标题',
  description: '测试正文',
  type: 'IMAGE',
  status: 'APPROVED',
  basePath: '/tmp/content/approved/content-001',
  images: ['/tmp/content/approved/content-001/1.png'],
  video: null,
  tags: ['测试'],
};

const accountRecord = {
  id: 'account-001',
  name: 'xhs-1',
  platform: 'xiaohongshu',
  status: 'ACTIVE',
  encryptedCookies: 'encrypted-cookies',
};

const publishLogRecord = {
  id: 'publish-log-001',
  contentId: 'content-001',
  accountId: 'account-001',
  platform: 'xiaohongshu',
  status: 'QUEUED',
};

const contentFindUniqueMock = mock(async () => contentRecord);
const accountFindUniqueMock = mock(async () => accountRecord);
const publishLogCreateMock = mock(async () => publishLogRecord);
const publishLogUpdateMock = mock(async (_args: unknown) => publishLogRecord);
const contentUpdateMock = mock(async (_args: unknown) => ({ ...contentRecord, status: 'PUBLISHED' }));
const publishLogFindUniqueMock = mock(async () => publishLogRecord);
const publishLogFindFirstMock = mock(async () => null);
const publishLogFindManyMock = mock(async () => []);
const addPublishJobMock = mock(async () => ({ id: 'job-001' }));
const moveToPublishedMock = mock(async () => undefined);

mock.module('../config/prisma', () => ({
  prisma: {
    content: { findUnique: contentFindUniqueMock, update: contentUpdateMock },
    account: { findUnique: accountFindUniqueMock },
    publishLog: {
      create: publishLogCreateMock,
      update: publishLogUpdateMock,
      findUnique: publishLogFindUniqueMock,
      findFirst: publishLogFindFirstMock,
      findMany: publishLogFindManyMock,
    },
  },
}));

mock.module('../queues/publish-queue', () => ({
  addPublishJob: addPublishJobMock,
}));

mock.module('../services/content.service', () => ({
  getContentById: contentFindUniqueMock,
  moveToPublished: moveToPublishedMock,
  approveContent: mock(async () => contentRecord),
  getContents: mock(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
  moveToApproved: mock(async () => undefined),
  rejectContent: mock(async () => contentRecord),
  scanInbox: mock(async () => undefined),
}));

describe('simulated publish flow', () => {
  beforeEach(() => {
    process.env.CPP_FROM_GATEWAY_TOKEN = 'gateway-callback-token';
    contentFindUniqueMock.mockClear();
    accountFindUniqueMock.mockClear();
    publishLogCreateMock.mockClear();
    publishLogUpdateMock.mockClear();
    contentUpdateMock.mockClear();
    addPublishJobMock.mockClear();
    moveToPublishedMock.mockClear();
  });

  it('queues approved content and applies a success webhook callback', async () => {
    const app = new Elysia()
      .use(setupContentsRoutes())
      .use(
        setupWebhookRoutes({
          mediaActionsService: {
            getDefinitions: () => [],
            submit: mock(async () => { throw new Error('not used'); }),
            getAction: mock(async () => null),
            listRecent: mock(async () => []),
            updateStatus: mock(async () => { throw new Error('not used'); }),
            handleCallback: mock(async () => { throw new Error('not used'); }),
          },
          callbackEventDeduper: createInMemoryOpenClawCallbackEventDeduper(),
          accountCheckLoginCallbackStore: createInMemoryAccountCheckLoginCallbackStore(),
        })
      );

    const publishRes = await app.handle(
      new Request('http://localhost/api/contents/content-001/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'xiaohongshu', accountId: 'account-001' }),
      })
    );
    const publishData = await publishRes.json();

    expect(publishRes.status).toBe(200);
    expect(publishData.success).toBe(true);
    expect(publishLogCreateMock).toHaveBeenCalled();
    expect(addPublishJobMock).toHaveBeenCalled();
    expect(contentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'content-001' },
      data: { status: 'PUBLISHING' },
    });

    const webhookRes = await app.handle(
      new Request('http://localhost/api/webhook/xhs/publish-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer gateway-callback-token',
        },
        body: JSON.stringify({
          version: '1.0',
          eventId: 'evt-flow-001',
          kind: 'publish',
          taskId: 'gateway-task-001',
          actionType: 'xiaohongshu.publish',
          status: 'success',
          refs: { publishLogId: 'publish-log-001', contentId: 'content-001', accountId: 'account-001' },
          result: { url: 'https://www.xiaohongshu.com/explore/test-note' },
        }),
      })
    );
    const webhookData = await webhookRes.json();

    expect(webhookRes.status).toBe(200);
    expect(webhookData.success).toBe(true);
    expect(publishLogUpdateMock).toHaveBeenCalledWith({
      where: { id: 'publish-log-001' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        externalTaskId: 'gateway-task-001',
        publishedUrl: 'https://www.xiaohongshu.com/explore/test-note',
      }),
    });
    expect(contentUpdateMock).toHaveBeenCalledWith({
      where: { id: 'content-001' },
      data: { status: 'PUBLISHED', publishCount: { increment: 1 } },
    });
    expect(moveToPublishedMock).toHaveBeenCalledWith('content-001', 'xiaohongshu');
  });
});
```

- [ ] **步骤 2：运行测试确认失败或 mock 边界缺口**

运行：

```bash
cd apps/server && bun test src/routes/publish-flow.test.ts
```

初始预期：如果现有路由模块不便于 mock 注入，或 mock shape 需要修正，则失败；失败应只发生在新增测试中。

- [ ] **步骤 3：修正测试或小范围注入边界**

如果失败是由难以 mock 的 service import 导致，优先添加 route setup options，而不是改变业务行为。例如，在 `apps/server/src/routes/contents.ts` 中扩展 setup 签名：

```ts
interface ContentsRouteOptions {
  addPublishJob?: typeof addPublishJob;
}

export function setupContentsRoutes(options: ContentsRouteOptions = {}) {
  const enqueuePublishJob = options.addPublishJob || addPublishJob;
```

Then replace direct calls to `addPublishJob(...)` with:

```ts
const job = await enqueuePublishJob(
```

更新测试，通过 options 传入 mock：

```ts
.use(setupContentsRoutes({ addPublishJob: addPublishJobMock }))
```

- [ ] **步骤 4：运行发布闭环测试确认通过**

运行：

```bash
cd apps/server && bun test src/routes/publish-flow.test.ts
```

预期：模拟发布闭环测试通过，0 个失败。

- [ ] **步骤 5：运行相关回归测试**

运行：

```bash
cd apps/server && bun test src/routes/publish-flow.test.ts src/routes/webhook.publish-result.test.ts src/routes/publish.test.ts
```

预期：通过，0 个失败。

- [ ] **步骤 6：运行 check**

运行：

```bash
cd apps/server && bun run check
```

预期： exit 0.

- [ ] **步骤 7：提交任务 5**

运行：

```bash
git add apps/server/src/routes/publish-flow.test.ts apps/server/src/routes/contents.ts
git commit -m "test: cover simulated publish loop" \
  -m "Add a no-side-effect publish flow test that proves approved content can enqueue, receive a success callback, and update publish/content state." \
  -m "Constraint: Default tests must not publish to third-party platforms." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: cd apps/server && bun test src/routes/publish-flow.test.ts" \
  -m "Tested: cd apps/server && bun test src/routes/publish-flow.test.ts src/routes/webhook.publish-result.test.ts src/routes/publish.test.ts" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Not-tested: Real XHS/Gateway publish side effects."
```

If `contents.ts` was not modified, remove it from `git add` before committing.

---

### 任务 6：真实 XHS 测试门禁

**文件：**
- 新建： `tests/real-xhs-smoke.test.ts`
- 修改： `docs/PRODUCTION_READINESS.md` later in 任务 7

- [ ] **步骤 1：写默认 skip 的真实 XHS smoke test**

创建 `tests/real-xhs-smoke.test.ts`：

```ts
import { describe, expect, it } from 'bun:test';

const realDescribe = process.env.RUN_REAL_XHS_TESTS === 'true' ? describe : describe.skip;

realDescribe('real XHS smoke tests', () => {
  it('requires explicit real publish configuration before running', () => {
    expect(process.env.RUN_REAL_XHS_TESTS).toBe('true');
    expect(process.env.XHS_MCP_INSTANCES).toBeTruthy();
    expect(process.env.API_BASE_URL).toBeTruthy();
    expect(process.env.API_AUTH_TOKEN).toBeTruthy();
  });

  it('documents the real publish side-effect boundary', () => {
    const warning = [
      'RUN_REAL_XHS_TESTS=true may publish to a third-party platform.',
      'Use only test accounts and safe test content.',
      'Do not enable this suite in default CI.',
    ].join(' ');

    expect(warning).toContain('third-party platform');
  });
});
```

- [ ] **步骤 2：运行默认测试并确认跳过**

运行：

```bash
bun test tests/real-xhs-smoke.test.ts
```

预期： tests skipped when `RUN_REAL_XHS_TESTS` is not `true`.

- [ ] **步骤 3：在缺少完整 env 时运行门禁测试并确认失败明确**

运行：

```bash
RUN_REAL_XHS_TESTS=true bun test tests/real-xhs-smoke.test.ts
```

预期：如果缺少 `XHS_MCP_INSTANCES`、`API_BASE_URL` 或 `API_AUTH_TOKEN`，测试失败；这证明门禁不会静默运行。

- [ ] **步骤 4：补充真实环境执行命令说明**

不要硬编码真实凭据。在 `tests/real-xhs-smoke.test.ts` 顶部添加注释：

```ts
/**
 * Real XHS smoke 门禁.
 * Run only with a test account and explicit side-effect approval:
 * RUN_REAL_XHS_TESTS=true XHS_MCP_INSTANCES='[{"name":"xhs-1","url":"http://xhs-mcp:5601"}]' bun test tests/real-xhs-smoke.test.ts
 */
```

- [ ] **步骤 5：运行默认 server 全量测试，确认不会意外触发真实发布**

运行：

```bash
cd apps/server && bun test
```

预期：通过；真实 XHS smoke 不包含在 server 默认测试套件中。

- [ ] **步骤 6：提交任务 6**

运行：

```bash
git add tests/real-xhs-smoke.test.ts
git commit -m "test: gate real XHS smoke checks" \
  -m "Document and enforce an explicit environment 门禁 before any real XHS publishing validation can run." \
  -m "Constraint: Real third-party side effects must never run in default test commands." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: bun test tests/real-xhs-smoke.test.ts" \
  -m "Tested: RUN_REAL_XHS_TESTS=true bun test tests/real-xhs-smoke.test.ts" \
  -m "Tested: cd apps/server && bun test" \
  -m "Not-tested: Real XHS publish with live test account."
```

---

### 任务 7：生产 runbook 与 API 文档同步

**文件：**
- 新建： `docs/PRODUCTION_READINESS.md`
- 修改： `docs/API.md`
- 按需修改：`apps/server/src/routes/api-doc.ts`（如果文档文字需要同步）
- 按需修改：`apps/server/src/routes/api-doc.test.ts`（如果端点列表变更）

- [ ] **步骤 1：创建生产就绪 runbook**

创建 `docs/PRODUCTION_READINESS.md`：

```md
# 生产就绪 Runbook

> 当前状态：推进中  
> 服务范围：`apps/server` API 服务  
> Swagger：`/docs`（受 `EXPOSE_DOCS` 控制）  
> OpenAPI JSON：`/docs/openapi.json`（受 `EXPOSE_DOCS` 控制）

## 1. 上线前必填环境变量

- `NODE_ENV=production`
- `PORT=50000`
- `DATABASE_URL`
- `REDIS_URL`
- `COOKIE_ENCRYPTION_KEY`
- `COOKIE_ENCRYPTION_SALT`
- `API_AUTH_TOKEN`
- `CPP_TO_GATEWAY_TOKEN`
- `CPP_FROM_GATEWAY_TOKEN`
- `API_BASE_URL`
- `CONTENT_DIR`
- `EXPOSE_DOCS=false`
- 真实 XHS 发布启用时：`XHS_MCP_INSTANCES`

## 2. 部署顺序

1. 准备 Postgres 与 Redis。
2. 准备 `CONTENT_DIR` 持久化目录。
3. 配置生产 `.env`。
4. 运行 Prisma 迁移。
5. 启动 API 服务。
6. 运行 health/readiness 检查。
7. 运行 smoke 脚本。
8. 如果启用真实发布，使用测试账号执行门禁保护的真实 XHS smoke。

## 3. 数据库迁移

```bash
cd apps/server
bun run db:migrate
```

## 4. Smoke

```bash
API_BASE_URL=http://localhost:50000 API_AUTH_TOKEN=<token> EXPOSE_DOCS=false bun run smoke:api
```

## 5. 回滚

1. 停止新版本服务。
2. 恢复上一版镜像或代码提交。
3. 如迁移不可逆，按迁移说明恢复数据库备份。
4. 重新运行 `/health`、`/ready` 和 smoke。

## 6. 测试门禁

| 层级 | 命令 | 是否有外部副作用 |
| --- | --- | --- |
| 默认 | `cd apps/server && bun test` | 否 |
| 集成 | `cd apps/server && RUN_INTEGRATION_TESTS=true bun test` | 否 |
| 真实 XHS | `RUN_REAL_XHS_TESTS=true bun test tests/real-xhs-smoke.test.ts` | 是 |

## 7. 上线 Checklist

- [ ] `cd apps/server && bun run check` 通过
- [ ] `cd apps/server && bun test` 通过
- [ ] Docker image 可构建
- [ ] `/health` 返回 ok
- [ ] `/ready` 返回 ready
- [ ] smoke 脚本通过
- [ ] 管理 API 鉴权启用
- [ ] Webhook token 校验启用
- [ ] 生产 secret 非 placeholder / 非弱密钥
- [ ] 数据库迁移完成
- [ ] 回滚流程可执行
- [ ] 默认模拟发布闭环测试通过
- [ ] 真实 XHS 测试账号发布闭环通过，或本次 release 标记为 API-only

## 8. 已知限制

- 真实 XHS 发布依赖测试账号、XHS MCP/Gateway、有效 cookie 或登录态。
- 默认测试不会触发第三方平台发布。
- `/api/media/*` 是 legacy/optional API，不是当前 service-api 主发布路径。
```

- [ ] **步骤 2：更新 docs/API.md**

In `docs/API.md`:

- Update verification date to the current date.
- Add `/ready` under health section.
- Add production auth note for `/api/*`.
- Add docs exposure note for `EXPOSE_DOCS`.
- Replace stale validation status with the new test layers.

Add this paragraph under common conventions:

```md
### 生产鉴权

生产环境中，除 `/health`、`/ready` 和 `/api/webhook/*` 外，管理 API 默认需要：

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

`/docs` 与 `/docs/openapi.json` 是否暴露由 `EXPOSE_DOCS` 控制。
```

- [ ] **步骤 3：如 API.md 提到新的 `/ready` 或鉴权，更新 OpenAPI 文档**

If `api-doc.ts` does not already include `/ready` and production auth descriptions from earlier tasks, add them now.

- [ ] **步骤 4：运行文档路由同步测试**

运行：

```bash
cd apps/server && bun test src/routes/api-doc.test.ts
```

预期：通过；`docs/API.md` 中每个 `### METHOD path` 都体现在 OpenAPI 中。

- [ ] **步骤 5：运行 check**

运行：

```bash
cd apps/server && bun run check
```

预期： exit 0.

- [ ] **步骤 6：提交任务 7**

运行：

```bash
git add docs/PRODUCTION_READINESS.md docs/API.md apps/server/src/routes/api-doc.ts apps/server/src/routes/api-doc.test.ts
git commit -m "docs: add production readiness runbook" \
  -m "Document the release gates, environment requirements, smoke flow, rollback path, and test layers for the API service." \
  -m "Constraint: Production readiness must be auditable by future agents and operators." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: cd apps/server && bun test src/routes/api-doc.test.ts" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Not-tested: Live deployment runbook execution."
```

---

### 任务 8：最终验证与发布状态更新

**文件：**
- 修改： `docs/PRODUCTION_READINESS.md`

- [ ] **步骤 1：运行完整默认验证**

运行：

```bash
cd apps/server && bun run check
cd apps/server && bun test
```

预期： `bun run check` exit 0; `bun test` exits 0 with 0 fail.

- [ ] **步骤 2：运行目标门禁测试**

运行：

```bash
bash -n scripts/smoke-api.sh
cd apps/server && bun test src/config/env.test.ts src/middleware/auth.test.ts src/routes/health.test.ts src/routes/publish-flow.test.ts src/routes/api-doc.test.ts
bun test tests/real-xhs-smoke.test.ts
```

预期：

- smoke 脚本语法检查退出码为 0。
- 目标 server 测试通过，0 个失败。
- 真实 XHS smoke 默认跳过。

- [ ] **步骤 3：更新 runbook 中的最终发布状态**

Modify top of `docs/PRODUCTION_READINESS.md`:

```md
> 当前状态：默认门禁通过；真实 XHS 发布需测试账号显式验证  
> 最近验证日期：2026-05-19
```

在 checklist 中根据实际证据标记条目：

```md
- [x] `cd apps/server && bun run check` 通过
- [x] `cd apps/server && bun test` 通过
- [x] `/health` 路由有测试覆盖
- [x] `/ready` 路由有测试覆盖
- [x] 管理 API 鉴权有测试覆盖
- [x] Webhook token 校验已有回归测试
- [x] 默认模拟发布闭环测试通过
- [ ] 真实 XHS 测试账号发布闭环通过
```

- [ ] **步骤 4：提交最终状态**

运行：

```bash
git add docs/PRODUCTION_READINESS.md
git commit -m "docs: record production 门禁 status" \
  -m "Record the final verified release-门禁 state and explicitly separate default readiness from real XHS publishing validation." \
  -m "Constraint: Real third-party publishing requires explicit test-account execution before being marked complete." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: cd apps/server && bun run check" \
  -m "Tested: cd apps/server && bun test" \
  -m "Tested: targeted production-readiness route/config/auth/publish-flow tests" \
  -m "Not-tested: Real XHS publishing unless the checklist item is explicitly marked complete."
```

- [ ] **步骤 5：所有任务完成后推送分支**

运行：

```bash
git status --short --branch
git push origin service-api
```

预期：

- 推送前：分支领先 origin，工作区干净。
- 推送成功。
- 推送后：`git status --short --branch` 显示没有未提交变更，也没有未推送提交。

---

## 最终验证命令

Run these before claiming implementation complete:

```bash
cd apps/server && bun run check
cd apps/server && bun test
bash -n scripts/smoke-api.sh
cd apps/server && bun test src/config/env.test.ts src/middleware/auth.test.ts src/routes/health.test.ts src/routes/publish-flow.test.ts src/routes/api-doc.test.ts
bun test tests/real-xhs-smoke.test.ts
git status --short --branch
```

预期最终证据：

- Biome check 退出码为 0。
- server 默认测试套件退出码为 0，且 0 个失败。
- Smoke 脚本 shell 语法检查退出码为 0。
- 生产就绪目标测试退出码为 0。
- 真实 XHS smoke 默认跳过。
- 最终提交后工作区干净。

## 规格覆盖自审

- 配置与部署：任务 1、任务 4、任务 7。
- 安全与访问控制：任务 3、任务 7。
- Health/readiness/smoke：任务 2、任务 4、任务 8。
- 发布闭环验证：任务 5、任务 6、任务 8。
- 测试门禁与运维文档：任务 6、任务 7、任务 8。
- 无默认第三方副作用：任务 5 和 任务 6 明确为真实发布设置门禁。
- 生产弱密钥路径：任务 1 拒绝 placeholder 和弱生产密钥。
