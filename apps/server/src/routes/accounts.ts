import { Elysia, t } from 'elysia';
import { chromium } from 'playwright';
import { createLogger } from '../config/logger';
import { browserPool } from '../config/playwright';
import { prisma } from '../config/prisma';
import { decryptCookies, encryptCookies } from '../utils/encryption';

const logger = createLogger('accounts-route');

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
            const updateData: any = {};

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
            let cookieArray: any[];

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

            // 加密 Cookie
            const encryptionPassword =
              password || process.env.COOKIE_ENCRYPTION_KEY || 'default-key';
            const encryptedCookies = await encryptCookies(cookieArray, encryptionPassword);

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
                count: cookieArray.length,
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
            const cookies = await decryptCookies(account.encryptedCookies as string, encryptionPassword);

            // 启动临时浏览器验证 Cookie
            const browser = await chromium.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });

            try {
              const context = await browser.newContext({
                cookies,
                viewport: { width: 1920, height: 1080 },
              });

              const page = await context.newPage();

              // 访问小红书并检查登录状态
              await page.goto('https://www.xiaohongshu.com/explore', {
                waitUntil: 'networkidle',
                timeout: 30000,
              });

              // 检查是否已登录（检查用户头像）
              const isLoggedIn = await page.evaluate(() => {
                const avatar = document.querySelector(
                  'img[data-e2e="user-avatar"], .user-avatar, .avatar-img'
                );
                const loginButton = document.querySelector(
                  'button[data-e2e="login-button"], .login-button'
                );
                return !!avatar && !loginButton;
              });

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
              });

              return {
                success: true,
                data: {
                  isLoggedIn,
                  verifiedAt: new Date(),
                  platform: account.platform,
                },
              };
            } finally {
              await browser.close();
            }
          } catch (error) {
            logger.error('Failed to verify cookies', {
              accountId: id,
              error: String(error),
            });

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
              // 调用单个导入逻辑
              let cookieArray: any[];

              if (typeof cookies === 'string') {
                cookieArray = JSON.parse(cookies);
              } else {
                cookieArray = cookies;
              }

              const encryptionPassword =
                password || process.env.COOKIE_ENCRYPTION_KEY || 'default-key';
              const encryptedCookies = await encryptCookies(cookieArray, encryptionPassword);

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
