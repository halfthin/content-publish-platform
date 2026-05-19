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
