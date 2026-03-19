import type { SetCookieParam } from 'playwright';

export type SupportedPlatform = 'xiaohongshu' | 'weibo' | 'douyin';

type CookieLike = Record<string, unknown>;

const XIAOHONGSHU_SHARED_DOMAIN = '.xiaohongshu.com';
const XIAOHONGSHU_HOSTS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'creator.xiaohongshu.com',
  'edith.xiaohongshu.com',
]);

function normalizeSameSite(sameSite: unknown): 'Strict' | 'Lax' | 'None' | undefined {
  if (typeof sameSite !== 'string') {
    return undefined;
  }

  const normalized = sameSite.trim().toLowerCase();
  if (!normalized || normalized === 'unspecified') {
    return undefined;
  }
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'none' || normalized === 'no_restriction' || normalized === 'no restriction') {
    return 'None';
  }
  return undefined;
}

function normalizeExpires(input: CookieLike): number | undefined {
  const rawValue = input.expires ?? input.expirationDate;

  if (rawValue === undefined || rawValue === null || rawValue === '' || rawValue === -1) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function getUrlHostname(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) {
    return undefined;
  }

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function normalizeDomain(input: CookieLike, platform?: SupportedPlatform): string | undefined {
  const rawDomain = typeof input.domain === 'string' ? input.domain.trim().toLowerCase() : '';
  const rawHostname = rawDomain.replace(/^\./, '');
  const urlHostname = getUrlHostname(input.url);

  if (platform === 'xiaohongshu') {
    const xhsHostname = rawHostname || urlHostname;
    if (xhsHostname && XIAOHONGSHU_HOSTS.has(xhsHostname)) {
      return XIAOHONGSHU_SHARED_DOMAIN;
    }
  }

  if (rawDomain) {
    return rawDomain;
  }

  return undefined;
}

function normalizePath(path: unknown): string {
  return typeof path === 'string' && path.trim() ? path : '/';
}

export function normalizeCookiesForBrowser(
  cookies: unknown[],
  platform?: SupportedPlatform
): SetCookieParam[] {
  if (!Array.isArray(cookies)) {
    return [];
  }

  return cookies
    .map((cookie) => {
      if (!cookie || typeof cookie !== 'object') {
        return null;
      }

      const input = cookie as CookieLike;
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const value =
        typeof input.value === 'string'
          ? input.value
          : input.value === undefined || input.value === null
            ? ''
            : String(input.value);

      if (!name || !value) {
        return null;
      }

      const sameSite = normalizeSameSite(input.sameSite);
      const secure = Boolean(input.secure) || sameSite === 'None';
      const normalizedCookie: SetCookieParam = {
        name,
        value,
        path: normalizePath(input.path),
        httpOnly: Boolean(input.httpOnly),
        secure,
      };

      const domain = normalizeDomain(input, platform);
      const expires = normalizeExpires(input);

      if (domain) {
        normalizedCookie.domain = domain;
      } else if (typeof input.url === 'string' && input.url.trim()) {
        normalizedCookie.url = input.url.trim();
      }

      if (expires !== undefined) {
        normalizedCookie.expires = expires;
      }

      if (sameSite) {
        normalizedCookie.sameSite = sameSite;
      }

      return normalizedCookie;
    })
    .filter((cookie): cookie is SetCookieParam => {
      return Boolean(cookie && (cookie.domain || cookie.url));
    });
}

export function normalizeCookiesForStorage(
  cookies: unknown[],
  platform?: SupportedPlatform
): Record<string, unknown>[] {
  return normalizeCookiesForBrowser(cookies, platform).map((cookie) => {
    const normalized: Record<string, unknown> = {
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || '/',
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
    };

    if (cookie.domain) {
      normalized.domain = cookie.domain;
    }
    if (cookie.url) {
      normalized.url = cookie.url;
    }
    if (cookie.expires !== undefined) {
      normalized.expires = cookie.expires;
    }
    if (cookie.sameSite) {
      normalized.sameSite = cookie.sameSite;
    }

    return normalized;
  });
}
