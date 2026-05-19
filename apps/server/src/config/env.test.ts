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
});
