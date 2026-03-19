import { describe, expect, it } from 'bun:test';
import { normalizeCookiesForBrowser, normalizeCookiesForStorage } from './cookie-normalizer';

describe('cookie-normalizer', () => {
  it('normalizes xiaohongshu creator cookies to shared domain', () => {
    const normalized = normalizeCookiesForBrowser(
      [
        {
          name: 'web_session',
          value: 'session-value',
          domain: 'creator.xiaohongshu.com',
          path: '/',
          expirationDate: 1893456000,
          sameSite: 'unspecified',
        },
      ],
      'xiaohongshu'
    );

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.domain).toBe('.xiaohongshu.com');
    expect(normalized[0]?.expires).toBe(1893456000);
    expect(normalized[0]?.sameSite).toBeUndefined();
  });

  it('keeps cookies with url when domain is missing', () => {
    const normalized = normalizeCookiesForBrowser([
      {
        name: 'a1',
        value: 'token',
        url: 'https://creator.xiaohongshu.com',
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.url).toBe('https://creator.xiaohongshu.com');
  });

  it('normalizes storage payload into playwright-compatible fields', () => {
    const normalized = normalizeCookiesForStorage(
      [
        {
          name: 'xsec_token',
          value: 'abc',
          domain: 'www.xiaohongshu.com',
          path: '/',
          sameSite: 'no_restriction',
          secure: false,
        },
      ],
      'xiaohongshu'
    );

    expect(normalized).toEqual([
      {
        name: 'xsec_token',
        value: 'abc',
        domain: '.xiaohongshu.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'None',
      },
    ]);
  });
});
