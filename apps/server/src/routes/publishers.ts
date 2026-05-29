import { Elysia, t } from 'elysia';
import { createLogger } from '../config/logger';
import { getChannelRouter } from '../services/channel-router';

const logger = createLogger('publishers-route');

export function setupPublishersRoutes() {
  return (
    new Elysia({ prefix: '/api/publishers' })

      // 获取所有可用发布实例
      .get('/', async () => {
        const router = getChannelRouter();
        const platforms = router.getPlatforms();
        const result: Array<{
          platform: string;
          name: string;
          label: string;
          type: string;
          status: string;
        }> = [];

        for (const platform of platforms) {
          const publishers = router.getByPlatform(platform);
          for (const pub of publishers) {
            let loginStatus = 'unknown';
            try {
              const auth = await pub.checkAuth();
              loginStatus = auth.loggedIn ? 'logged_in' : 'expired';
            } catch {
              loginStatus = 'offline';
            }

            result.push({
              platform: pub.platform,
              name: pub.name,
              label: `${platformLabel(pub.platform)} - ${pub.name}`,
              type: pub.platform === 'xiaohongshu' ? 'mcp' : 'unknown',
              status: loginStatus,
            });
          }
        }

        return { success: true, data: result };
      })

      // 获取某平台的所有实例
      .get('/:platform', async ({ params }) => {
        const router = getChannelRouter();
        const publishers = router.getByPlatform(params.platform);
        const result = [];

        for (const pub of publishers) {
          let loginStatus = 'unknown';
          try {
            const auth = await pub.checkAuth();
            loginStatus = auth.loggedIn ? 'logged_in' : 'expired';
          } catch {
            loginStatus = 'offline';
          }

          result.push({
            platform: pub.platform,
            name: pub.name,
            label: `${platformLabel(pub.platform)} - ${pub.name}`,
            type: pub.platform === 'xiaohongshu' ? 'mcp' : 'unknown',
            status: loginStatus,
            supportsAuth: typeof pub.startAuth === 'function',
          });
        }

        return { success: true, data: result };
      })
  );
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    xiaohongshu: '小红书',
    weibo: '微博',
    douyin: '抖音',
    bilibili: 'B 站',
    wechat: '微信',
  };
  return labels[platform] || platform;
}
