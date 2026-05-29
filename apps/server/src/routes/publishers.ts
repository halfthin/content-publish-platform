import { Elysia, t } from 'elysia';
import { createLogger } from '../config/logger';
import { xhsMcpConfig } from '../config/xhs-mcp';
import { getChannelRouter } from '../services/channel-router';

const logger = createLogger('publishers-route');

interface PublisherInfo {
  platform: string;
  name: string;
  label: string;
  type: string;
  status: 'online' | 'offline' | 'logged_in' | 'expired' | 'unknown';
  supportsAuth: boolean;
  config: Record<string, string>;
}

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: '小红书',
  weibo: '微博',
  douyin: '抖音',
  bilibili: 'B 站',
  wechat: '微信',
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] || platform;
}

/**
 * 验证 MCP 实例是否可达（走标准 MCP initialize 流程）
 */
async function checkMcpHealth(mcpUrl: string): Promise<'online' | 'offline'> {
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {},
          clientInfo: { name: 'cpp', version: '1.0.0' },
        },
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

/**
 * 从配置中发现发布实例
 */
function discoverFromConfig(): PublisherInfo[] {
  const result: PublisherInfo[] = [];

  // 1. 从 xhs-mcp 配置发现小红书实例
  for (const inst of xhsMcpConfig.instances) {
    const base = inst.url.replace(/\/+$/, '');
    const mcpUrl = base.includes('/mcp') ? base : `${base}/mcp`;
    result.push({
      platform: 'xiaohongshu',
      name: inst.name,
      label: `${platformLabel('xiaohongshu')} - ${inst.name}`,
      type: 'mcp',
      status: 'unknown',
      supportsAuth: true,
      config: { url: inst.url, mcpUrl },
    });
  }

  return result;
}

/**
 * 从 ChannelRouter 发现已注册的发布实例
 */
function discoverFromRouter(): PublisherInfo[] {
  const router = getChannelRouter();
  const platforms = router.getPlatforms();
  const result: PublisherInfo[] = [];

  for (const platform of platforms) {
    const publishers = router.getByPlatform(platform);
    for (const pub of publishers) {
      // 跳过已在配置中发现过的 MCP 实例（避免重复）
      if (platform === 'xiaohongshu') continue;
      result.push({
        platform: pub.platform,
        name: pub.name,
        label: `${platformLabel(pub.platform)} - ${pub.name}`,
        type: 'unknown',
        status: 'unknown',
        supportsAuth: typeof pub.startAuth === 'function',
        config: {},
      });
    }
  }

  return result;
}

export function setupPublishersRoutes() {
  return (
    new Elysia({ prefix: '/api/publishers' })

      // 获取所有可用发布实例（发现 + 验证）
      .get('/', async () => {
        const publishers = [...discoverFromConfig(), ...discoverFromRouter()];

        // 并发验证每个实例的状态
        const results = await Promise.all(
          publishers.map(async (pub) => {
            if (pub.type === 'mcp' && pub.config.mcpUrl) {
              pub.status = await checkMcpHealth(pub.config.mcpUrl);
            }
            return pub;
          })
        );

        return { success: true, data: results };
      })

      // 获取某平台的所有实例（已验证）
      .get('/:platform', async ({ params }) => {
        const publishers = [...discoverFromConfig(), ...discoverFromRouter()].filter(
          (p) => p.platform === params.platform
        );

        const results = await Promise.all(
          publishers.map(async (pub) => {
            if (pub.type === 'mcp' && pub.config.mcpUrl) {
              pub.status = await checkMcpHealth(pub.config.mcpUrl);
            }
            return pub;
          })
        );

        return { success: true, data: results };
      })
  );
}
