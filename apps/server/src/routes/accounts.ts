import type { Prisma } from '@prisma/client';
import { Elysia, t } from 'elysia';
import { chromium } from 'playwright';
import { createLogger, verifyLogger } from '../config/logger';
import { prisma } from '../config/prisma';
import {
  normalizeCookiesForBrowser,
  normalizeCookiesForStorage,
  type SupportedPlatform,
} from '../utils/cookie-normalizer';
import { decryptCookies, encryptCookies } from '../utils/encryption';

const logger = createLogger('accounts-route');

function normalizePlatform(platform: string): SupportedPlatform | undefined {
  if (platform === 'xiaohongshu' || platform === 'weibo' || platform === 'douyin') {
    return platform;
  }
  return undefined;
}

async function navigateForVerification(
  page: Awaited<ReturnType<import('playwright').BrowserContext['newPage']>>,
  url: string
) {
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1500);
    return response;
  } catch (error) {
    const message = String(error);
    if (!message.toLowerCase().includes('timeout')) {
      throw error;
    }

    // 小红书页面常驻轮询较多，超时时保留当前页面继续做 DOM / API 探测
    await page.waitForTimeout(1500);
    return null;
  }
}

async function detectProfileLinks(
  page: Awaited<ReturnType<import('playwright').BrowserContext['newPage']>>
): Promise<{
  htmlProfileLinks: string[];
  domProfileLinks: string[];
}> {
  const normalizeProfileLink = (value: string): string | null => {
    const match = value.match(/(https?:\/\/www\.xiaohongshu\.com)?\/user\/profile\/[a-zA-Z0-9]+/);
    if (!match) {
      return null;
    }

    return match[0].startsWith('http') ? match[0] : `https://www.xiaohongshu.com${match[0]}`;
  };

  const domProfileLinks = await page.$$eval('a[href*="/user/profile/"]', (anchors) =>
    Array.from(
      new Set(
        anchors.map((anchor) => anchor.getAttribute('href') || anchor.href || '').filter(Boolean)
      )
    )
  );

  const html = await page.content();
  const htmlMatches = html.match(
    /(?:https?:\/\/www\.xiaohongshu\.com)?\/user\/profile\/[a-zA-Z0-9]+/g
  );

  return {
    htmlProfileLinks: Array.from(
      new Set((htmlMatches || []).map((link) => normalizeProfileLink(link)).filter(Boolean))
    ) as string[],
    domProfileLinks: Array.from(
      new Set(domProfileLinks.map((link) => normalizeProfileLink(link)).filter(Boolean))
    ) as string[],
  };
}

/**
 * 账号管理 API 路由
 */
export function setupAccountsRoutes() {
  return (
    new Elysia({ prefix: '/api/accounts' })
      // 获取账号列表
      .get('/', async ({ query }) => {
        const { platform, status } = query;

        const where: Record<string, unknown> = {};

        if (platform) {
          where.platform = platform;
        }

        if (status) {
          where.status = status;
        }

        const accounts = await prisma.account.findMany({
          where,
          include: {
            group: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        return {
          success: true,
          data: accounts,
        };
      })

      // 创建账号
      .post(
        '/',
        async ({ body }) => {
          const { name, platform, groupId, username, remark } = body;

          try {
            // 如果没有提供 groupId，创建或连接到默认分组
            const groupConnect = groupId
              ? { connect: { id: groupId } }
              : {
                  connectOrCreate: {
                    where: {
                      platform_name: {
                        platform,
                        name: '默认分组',
                      },
                    },
                    create: {
                      platform,
                      name: '默认分组',
                      description: '自动创建的默认分组',
                    },
                  },
                };

            const account = await prisma.account.create({
              data: {
                name,
                platform,
                username,
                notes: remark, // 字段映射：remark -> notes
                status: 'ACTIVE', // enum 用大写
                loginStatus: 'UNKNOWN',
                group: groupConnect,
              },
              include: {
                group: true,
              },
            });

            logger.info('Account created', { accountId: account.id, name });

            return {
              success: true,
              data: account,
              message: '账号创建成功',
            };
          } catch (error) {
            logger.error('Failed to create account', { error: String(error) });

            return {
              success: false,
              error: `创建账号失败：${error}`,
            };
          }
        },
        {
          body: t.Object({
            name: t.String(),
            platform: t.String(),
            groupId: t.Optional(t.String()),
            username: t.Optional(t.String()),
            remark: t.Optional(t.String()),
          }),
        }
      )

      // 更新账号
      .put(
        '/:id',
        async ({ params, body }) => {
          const { id } = params;
          const { name, platform, groupId, username, remark, status } = body;

          try {
            const updateData: Prisma.AccountUpdateInput = {};

            // 只更新有值的字段
            if (name !== undefined) updateData.name = name;
            if (platform !== undefined) updateData.platform = platform;
            if (username !== undefined) updateData.username = username;
            if (remark !== undefined) updateData.notes = remark; // 字段映射：remark -> notes
            if (status !== undefined) updateData.status = status;

            // 只有当 groupId 有值时才添加 group 关系
            if (groupId) {
              updateData.group = {
                connect: { id: groupId },
              };
            }

            const account = await prisma.account.update({
              where: { id },
              data: updateData,
              include: {
                group: true,
              },
            });

            logger.info('Account updated', { accountId: id });

            return {
              success: true,
              data: account,
              message: '账号更新成功',
            };
          } catch (error) {
            logger.error('Failed to update account', { accountId: id, error: String(error) });

            return {
              success: false,
              error: `更新账号失败：${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            name: t.Optional(t.String()),
            platform: t.Optional(t.String()),
            groupId: t.Optional(t.String()),
            username: t.Optional(t.String()),
            remark: t.Optional(t.String()),
            status: t.Optional(t.String()),
          }),
        }
      )

      // 删除账号
      .delete(
        '/:id',
        async ({ params }) => {
          const { id } = params;

          try {
            await prisma.account.delete({
              where: { id },
            });

            logger.info('Account deleted', { accountId: id });

            return {
              success: true,
              message: '账号删除成功',
            };
          } catch (error) {
            logger.error('Failed to delete account', { accountId: id, error: String(error) });

            return {
              success: false,
              error: `删除账号失败：${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )

      // 切换账号状态
      .post(
        '/:id/toggle-status',
        async ({ params }) => {
          const { id } = params;

          try {
            const account = await prisma.account.findUnique({
              where: { id },
            });

            if (!account) {
              return {
                success: false,
                error: '账号不存在',
              };
            }

            const newStatus = account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

            await prisma.account.update({
              where: { id },
              data: {
                status: newStatus,
              },
            });

            logger.info('Account status toggled', { accountId: id, newStatus });

            return {
              success: true,
              data: {
                id,
                status: newStatus,
              },
              message: '账号状态已更新',
            };
          } catch (error) {
            logger.error('Failed to toggle account status', {
              accountId: id,
              error: String(error),
            });

            return {
              success: false,
              error: `切换账号状态失败：${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )

      // 获取账号详情
      .get('/:id', async ({ params }) => {
        const { id } = params;

        const account = await prisma.account.findUnique({
          where: { id },
          include: {
            group: true,
            publishLogs: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        });

        if (!account) {
          return {
            success: false,
            error: 'Account not found',
          };
        }

        return {
          success: true,
          data: account,
        };
      })

      // 导入 Cookie
      .post(
        '/:id/cookies',
        async ({ params, body }) => {
          const { id } = params;
          const { cookies, password } = body;

          try {
            // 验证账号存在
            const account = await prisma.account.findUnique({
              where: { id },
            });

            if (!account) {
              return {
                success: false,
                error: 'Account not found',
              };
            }

            // 解析 Cookie（支持 JSON 字符串或对象）
            let cookieArray: unknown[];

            if (typeof cookies === 'string') {
              try {
                cookieArray = JSON.parse(cookies);
              } catch {
                return {
                  success: false,
                  error: 'Invalid cookie format: must be JSON array',
                };
              }
            } else {
              cookieArray = cookies;
            }

            // 验证 Cookie 格式
            if (!Array.isArray(cookieArray) || cookieArray.length === 0) {
              return {
                success: false,
                error: 'Cookie must be a non-empty array',
              };
            }

            const normalizedCookies = normalizeCookiesForStorage(
              cookieArray,
              normalizePlatform(account.platform)
            );
            if (normalizedCookies.length === 0) {
              return {
                success: false,
                error: 'Cookie must include valid name/value and domain or url fields',
              };
            }

            // 加密 Cookie
            const encryptionPassword =
              password || process.env.COOKIE_ENCRYPTION_KEY || 'default-key';
            const encryptedCookies = await encryptCookies(normalizedCookies, encryptionPassword);

            // 更新数据库
            await prisma.account.update({
              where: { id },
              data: {
                encryptedCookies,
                cookieUpdatedAt: new Date(),
                loginStatus: 'LOGGED_IN',
              },
            });

            logger.info('Cookies imported', {
              accountId: id,
              count: cookieArray.length,
            });

            return {
              success: true,
              message: 'Cookies imported successfully',
              data: {
                count: normalizedCookies.length,
                updatedAt: new Date(),
              },
            };
          } catch (error) {
            logger.error('Failed to import cookies', {
              accountId: id,
              error: String(error),
            });

            return {
              success: false,
              error: `Failed to import cookies: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          body: t.Object({
            cookies: t.Union([t.String(), t.Array(t.Any())]),
            password: t.Optional(t.String()),
          }),
        }
      )

      // 验证 Cookie
      .get(
        '/:id/cookies/verify',
        async ({ params, query }) => {
          const { id } = params;
          const { password } = query;

          try {
            // 获取账号
            const account = await prisma.account.findUnique({
              where: { id },
            });

            if (!account) {
              return {
                success: false,
                error: 'Account not found',
              };
            }

            if (!account.encryptedCookies) {
              return {
                success: false,
                error: 'No cookies found for this account',
              };
            }

            // 解密 Cookie
            const encryptionPassword =
              password || process.env.COOKIE_ENCRYPTION_KEY || 'default-key';
            const cookies = await decryptCookies(
              account.encryptedCookies as string,
              encryptionPassword
            );

            // 启动临时浏览器验证 Cookie
            const browser = await chromium.launch({
              headless: true,
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
              ],
            });

            try {
              // 使用更像真人的浏览器配置
              const context = await browser.newContext({
                userAgent:
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai',
                extraHTTPHeaders: {
                  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                },
              });

              const normalizedCookies = normalizeCookiesForBrowser(
                cookies,
                normalizePlatform(account.platform)
              );
              if (normalizedCookies.length === 0) {
                return {
                  success: false,
                  error: 'No valid cookies remained after normalization',
                };
              }
              await context.addCookies(normalizedCookies);

              // P2: 验证 cookie 是否成功注入 - 升到 info 级别并记录到 verifyLogger
              const injectedCookies = await context.cookies();
              const injectedCookieNames = new Set(injectedCookies.map((cookie) => cookie.name));
              const hasXiaohongshuAuthCookies =
                injectedCookieNames.has('a1') &&
                (injectedCookieNames.has('web_session') ||
                  injectedCookieNames.has('id_token') ||
                  injectedCookieNames.has('webId'));
              const cookieLog = {
                accountId: id,
                stage: 'cookie_injection',
                inputCount: normalizedCookies.length,
                inputDomains: normalizedCookies.map((c) => c.domain),
                injectedCount: injectedCookies.length,
                injectedDomains: injectedCookies.map((c) => c.domain),
                injectedCookieNames: Array.from(injectedCookieNames),
                success: injectedCookies.length > 0,
              };
              logger.info(cookieLog, 'Cookies injected');
              verifyLogger.info(cookieLog, 'Cookie injection completed');

              const page = await context.newPage();

              // P4: 反自动化补丁 - 隐藏 webdriver 特征
              await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
              });

              const platformUrls: Record<string, string[]> = {
                xiaohongshu: [
                  'https://creator.xiaohongshu.com/publish/publish',
                  'https://www.xiaohongshu.com/explore',
                ],
                weibo: ['https://weibo.com'],
                douyin: ['https://www.douyin.com'],
              };
              const verifyTargets = platformUrls[account.platform] || platformUrls.xiaohongshu;

              let response: Awaited<ReturnType<typeof page.goto>> | null = null;
              let lastVisitedUrl = verifyTargets[0];
              for (const verifyUrl of verifyTargets) {
                lastVisitedUrl = verifyUrl;
                response = await navigateForVerification(page, verifyUrl);

                if (account.platform !== 'xiaohongshu') {
                  break;
                }

                const currentUrl = page.url();
                if (!/login|signin|passport/i.test(currentUrl)) {
                  break;
                }
              }

              // 访问平台并检查登录状态
              const currentPageUrl = page.url();
              const currentTitle = await page.title();
              const isXiaohongshu = account.platform === 'xiaohongshu';
              const isOnLoginPage = /login|signin|passport/i.test(currentPageUrl);
              const isOnCreatorDomain = currentPageUrl.includes('creator.xiaohongshu.com');
              const detectedProfileLinks = isXiaohongshu ? await detectProfileLinks(page) : null;

              if (isXiaohongshu && !isOnLoginPage && isOnCreatorDomain) {
                const creatorPublishEntry = await page
                  .locator('input[type="file"], button:has-text("发布"), [class*="upload"]')
                  .first()
                  .isVisible()
                  .catch(() => false);

                if (creatorPublishEntry) {
                  await context.close();

                  await prisma.account.update({
                    where: { id },
                    data: {
                      loginStatus: 'LOGGED_IN',
                    },
                  });

                  logger.info('Cookie verification completed', {
                    accountId: id,
                    isLoggedIn: true,
                    method: 'creator-publish-page',
                    details: {
                      url: currentPageUrl,
                      pageTitle: currentTitle,
                    },
                  });

                  return {
                    success: true,
                    data: {
                      isLoggedIn: true,
                      verifiedAt: new Date(),
                      platform: account.platform,
                      verifyMethod: 'creator-publish-page',
                      verifyDetails: {
                        url: currentPageUrl,
                        pageTitle: currentTitle,
                        hasAvatar: false,
                        hasLoginButton: false,
                        httpStatus: response?.status(),
                        hasAuthCookies: hasXiaohongshuAuthCookies,
                      },
                    },
                  };
                }
              }

              if (
                isXiaohongshu &&
                !isOnLoginPage &&
                hasXiaohongshuAuthCookies &&
                detectedProfileLinks &&
                (detectedProfileLinks.htmlProfileLinks.length > 0 ||
                  detectedProfileLinks.domProfileLinks.length > 0)
              ) {
                await prisma.account.update({
                  where: { id },
                  data: {
                    loginStatus: 'LOGGED_IN',
                  },
                });

                logger.info('Cookie verification completed', {
                  accountId: id,
                  isLoggedIn: true,
                  method: 'web-domain-with-auth-cookies',
                  details: {
                    url: currentPageUrl,
                    pageTitle: currentTitle,
                    injectedCookieNames: Array.from(injectedCookieNames),
                    detectedProfileLinks,
                  },
                });
                verifyLogger.info(
                  {
                    accountId: id,
                    stage: 'verify_complete',
                    isLoggedIn: true,
                    method: 'web-domain-with-auth-cookies',
                    url: currentPageUrl,
                    pageTitle: currentTitle,
                    injectedCookieNames: Array.from(injectedCookieNames),
                    detectedProfileLinks,
                  },
                  'Cookie verification completed'
                );

                await context.close();

                return {
                  success: true,
                  data: {
                    isLoggedIn: true,
                    verifiedAt: new Date(),
                    platform: account.platform,
                    verifyMethod: 'web-domain-with-auth-cookies',
                    verifyDetails: {
                      url: currentPageUrl,
                      pageTitle: currentTitle,
                      hasAvatar: false,
                      hasLoginButton: true,
                      httpStatus: response?.status(),
                      hasAuthCookies: true,
                      detectedProfileLinks,
                    },
                  },
                };
              }

              // 继续使用 API + DOM 兜底
              // 根据平台选择验证 URL
              const verifyUrl = currentPageUrl || lastVisitedUrl;

              // 访问平台并检查登录状态
              if (!response) {
                response = await navigateForVerification(page, verifyUrl);
              }

              // P2: API优先 + 页面兜底校验
              let isLoggedIn = false;
              let verifyMethod = 'unknown';
              let verifyDetails: Record<string, unknown> = {};

              // 优先尝试 API 探测（小红书用户信息接口）
              try {
                const apiResult = await page.evaluate(async () => {
                  try {
                    const res = await fetch(
                      'https://edith.xiaohongshu.com/api/sns/web/v1/user/me',
                      {
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                      }
                    );
                    return { status: res.status, ok: res.ok };
                  } catch {
                    return { status: 0, ok: false };
                  }
                });

                if (apiResult.ok) {
                  isLoggedIn = true;
                  verifyMethod = 'api-success';
                  verifyDetails = { apiStatus: apiResult.status, method: 'api' };
                  logger.info('Cookie verified via API', {
                    accountId: id,
                    status: apiResult.status,
                  });
                } else if (apiResult.status === 401) {
                  verifyMethod = 'api-unauthorized';
                  verifyDetails = { apiStatus: apiResult.status, method: 'api' };
                  logger.info('API returned 401, will fallback to DOM', { accountId: id });
                } else {
                  verifyMethod = 'api-error';
                  verifyDetails = { apiStatus: apiResult.status, method: 'api' };
                  logger.info('API error, will fallback to DOM', {
                    accountId: id,
                    status: apiResult.status,
                  });
                }
              } catch (apiError) {
                verifyMethod = 'api-exception';
                logger.info('API verification exception, falling back to DOM', {
                  accountId: id,
                  error: String(apiError),
                });
              }

              // API 失败时 fallback 到页面 DOM 检测
              if (!isLoggedIn) {
                verifyDetails = await page.evaluate(() => {
                  const details = {
                    hasAvatar: false,
                    hasLoginButton: false,
                    pageTitle: document.title,
                    url: window.location.href,
                  };
                  const avatar = document.querySelector(
                    'img[data-e2e="user-avatar"], .user-avatar, .avatar-img, .avatar'
                  );
                  const loginButton = document.querySelector(
                    'button[data-e2e="login-button"], .login-button, a[href*="login"]'
                  );
                  const creatorPublishEntry = document.querySelector(
                    'input[type="file"], [class*="upload-wrapper"], [class*="upload-area"], [class*="publish-content"], [class*="publish-container"]'
                  );
                  details.hasAvatar = !!avatar;
                  details.hasLoginButton = !!loginButton;
                  return {
                    ...details,
                    hasCreatorPublishEntry: !!creatorPublishEntry,
                    hasAuthCookies: document.cookie.includes('a1='),
                  };
                });
                if (detectedProfileLinks) {
                  verifyDetails.detectedProfileLinks = detectedProfileLinks;
                }

                isLoggedIn =
                  (verifyDetails.hasAvatar && !verifyDetails.hasLoginButton) ||
                  ((verifyDetails.detectedProfileLinks?.htmlProfileLinks?.length > 0 ||
                    verifyDetails.detectedProfileLinks?.domProfileLinks?.length > 0) &&
                    verifyDetails.hasAuthCookies &&
                    !/login|signin|passport/i.test(verifyDetails.url || '')) ||
                  (verifyDetails.hasCreatorPublishEntry &&
                    verifyDetails.url?.includes('creator.xiaohongshu.com') &&
                    !verifyDetails.hasLoginButton &&
                    verifyDetails.hasAuthCookies &&
                    !/login|signin|passport/i.test(verifyDetails.url || ''));
                // P3: 细化失败状态，可判责
                if (isLoggedIn) {
                  verifyMethod = 'dom';
                } else if (verifyDetails.hasLoginButton) {
                  verifyMethod = 'dom-login-page-detected';
                } else if (!verifyDetails.hasAvatar) {
                  verifyMethod = 'dom-no-avatar-detected';
                } else {
                  verifyMethod = 'dom-failed';
                }
              }

              await context.close();

              // 更新账号状态
              await prisma.account.update({
                where: { id },
                data: {
                  loginStatus: isLoggedIn ? 'LOGGED_IN' : 'EXPIRED',
                },
              });

              logger.info('Cookie verification completed', {
                accountId: id,
                isLoggedIn,
                method: verifyMethod,
                details: verifyDetails,
              });
              verifyLogger.info(
                {
                  accountId: id,
                  stage: 'verify_complete',
                  isLoggedIn,
                  method: verifyMethod,
                  details: verifyDetails,
                  injectedCookieNames: Array.from(injectedCookieNames),
                },
                'Cookie verification completed'
              );

              return {
                success: true,
                data: {
                  isLoggedIn,
                  verifiedAt: new Date(),
                  platform: account.platform,
                  verifyMethod,
                  verifyDetails: {
                    url: verifyDetails.url || verifyUrl,
                    pageTitle: verifyDetails.pageTitle,
                    hasAvatar: verifyDetails.hasAvatar,
                    hasLoginButton: verifyDetails.hasLoginButton,
                    httpStatus: response?.status(),
                    apiStatus: verifyDetails.apiStatus,
                    hasCreatorPublishEntry: verifyDetails.hasCreatorPublishEntry,
                    hasAuthCookies: verifyDetails.hasAuthCookies || hasXiaohongshuAuthCookies,
                  },
                },
              };
            } finally {
              await browser.close();
            }
          } catch (error) {
            const errorMsg = String(error);
            logger.error('Failed to verify cookies', {
              accountId: id,
              error: errorMsg,
            });
            // 记录到独立 verify 日志
            verifyLogger.error(
              {
                accountId: id,
                stage: 'verify_exception',
                error: errorMsg,
                stack: error instanceof Error ? error.stack : undefined,
              },
              'Cookie verify failed with exception'
            );

            return {
              success: false,
              error: `Failed to verify cookies: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
          query: t.Object({
            password: t.Optional(t.String()),
          }),
        }
      )

      // 删除 Cookie
      .delete(
        '/:id/cookies',
        async ({ params }) => {
          const { id } = params;

          try {
            await prisma.account.update({
              where: { id },
              data: {
                encryptedCookies: null,
                cookieUpdatedAt: null,
                loginStatus: 'UNKNOWN',
              },
            });

            logger.info('Cookies deleted', { accountId: id });

            return {
              success: true,
              message: 'Cookies deleted successfully',
            };
          } catch (error) {
            logger.error('Failed to delete cookies', {
              accountId: id,
              error: String(error),
            });

            return {
              success: false,
              error: `Failed to delete cookies: ${error}`,
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )

      // 批量导入 Cookie
      .post(
        '/cookies/batch-import',
        async ({ body }) => {
          const { imports } = body;

          if (!Array.isArray(imports) || imports.length === 0) {
            return {
              success: false,
              error: 'Imports must be a non-empty array',
            };
          }

          const results = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of imports) {
            const { accountId, cookies, password } = item;

            try {
              const account = await prisma.account.findUnique({
                where: { id: accountId },
                select: { platform: true },
              });

              if (!account) {
                throw new Error('Account not found');
              }

              // 调用单个导入逻辑
              let cookieArray: unknown[];

              if (typeof cookies === 'string') {
                cookieArray = JSON.parse(cookies);
              } else {
                cookieArray = cookies;
              }

              const encryptionPassword =
                password || process.env.COOKIE_ENCRYPTION_KEY || 'default-key';
              const normalizedCookies = normalizeCookiesForStorage(
                cookieArray,
                normalizePlatform(account.platform)
              );
              const encryptedCookies = await encryptCookies(normalizedCookies, encryptionPassword);

              await prisma.account.update({
                where: { id: accountId },
                data: {
                  encryptedCookies,
                  cookieUpdatedAt: new Date(),
                  loginStatus: 'LOGGED_IN',
                },
              });

              results.push({
                accountId,
                success: true,
              });
              successCount++;
            } catch (error) {
              results.push({
                accountId: item.accountId,
                success: false,
                error: String(error),
              });
              failCount++;
            }
          }

          logger.info('Batch cookie import completed', {
            total: imports.length,
            success: successCount,
            fail: failCount,
          });

          return {
            success: true,
            data: {
              results,
              summary: {
                total: imports.length,
                success: successCount,
                fail: failCount,
              },
            },
          };
        },
        {
          body: t.Object({
            imports: t.Array(
              t.Object({
                accountId: t.String(),
                cookies: t.Union([t.String(), t.Array(t.Any())]),
                password: t.Optional(t.String()),
              })
            ),
          }),
        }
      )
  );
}
