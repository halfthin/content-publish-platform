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
