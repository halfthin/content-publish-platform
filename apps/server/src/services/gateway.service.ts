import { randomUUID } from 'node:crypto';
import { gatewayConfig } from '../config/gateway';
import { createLogger } from '../config/logger';

const logger = createLogger('gateway-service');

export interface GatewayPublishParams {
  platform: 'xiaohongshu' | 'weibo' | 'douyin' | 'bilibili' | 'wechat';
  contentId: string;
  accountId: string;
  contentPath: string; // 绝对路径，如 /home/halfthin/dev/content-publish-platform/content/approved/xxx
  taskId?: string;
}

export interface GatewayPublishResult {
  success: boolean;
  taskId: string;
  error?: string;
}

export interface GatewayCallbackPayload {
  taskId: string;
  contentId: string;
  accountId: string;
  platform: string;
  status: 'success' | 'failed' | 'needs-auth';
  publishedId?: string;
  url?: string;
  error?: string;
  timestamp: string;
}

class GatewayService {
  private baseUrl: string;
  private toToken: string;
  private fromToken: string;

  // 平台名称映射: 内部名称 -> Gateway webhook 路径
  private static readonly PLATFORM_MAP: Record<string, string> = {
    xiaohongshu: 'xhs',
    weibo: 'weibo',
    douyin: 'douyin',
    bilibili: 'bilibili',
    wechat: 'wechat',
  };

  constructor() {
    this.baseUrl = gatewayConfig.url;
    this.toToken = gatewayConfig.toGatewayToken;
    this.fromToken = gatewayConfig.fromGatewayToken;
  }

  /**
   * 映射平台名称到 Gateway webhook 路径
   */
  private mapPlatformToGateway(platform: string): string {
    return GatewayService.PLATFORM_MAP[platform] || platform;
  }

  /**
   * 获取回调 URL
   */
  private getCallbackUrl(platform: string): string {
    // 获取本服务暴露的地址
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:50000';
    const gatewayPlatform = this.mapPlatformToGateway(platform);
    return `${baseUrl}/api/webhook/${gatewayPlatform}/publish-result`;
  }

  /**
   * 调用 Gateway 发布
   */
  async publish(params: GatewayPublishParams): Promise<GatewayPublishResult> {
    const taskId = params.taskId || randomUUID();

    // 根据 platform 映射到 action
    const action = 'publish';

    const payload = {
      taskId,
      contentId: params.contentId,
      accountId: params.accountId,
      platform: params.platform,
      action,
      callback: {
        url: this.getCallbackUrl(params.platform),
        token: this.fromToken,
      },
      payload: {
        contentPath: params.contentPath,
      },
    };

    logger.info('Calling gateway publish', {
      taskId,
      platform: params.platform,
      contentId: params.contentId,
      contentPath: params.contentPath,
    });

    try {
      const response = await fetch(`${this.baseUrl}/webhooks/cpp/${params.platform}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.toToken ? { Authorization: `Bearer ${this.toToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Gateway publish failed', {
          status: response.status,
          error: errorText,
        });
        return {
          success: false,
          taskId,
          error: `Gateway returned ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json();
      logger.info('Gateway publish accepted', { taskId, result });

      return {
        success: true,
        taskId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Gateway publish error', { error: errorMsg });
      return {
        success: false,
        taskId,
        error: errorMsg,
      };
    }
  }

  /**
   * 验证 Gateway 连接
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        ...(this.toToken ? { headers: { Authorization: `Bearer ${this.toToken}` } } : {}),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// 单例导出
let gatewayServiceInstance: GatewayService | null = null;

export function getGatewayService(): GatewayService {
  if (!gatewayServiceInstance) {
    gatewayServiceInstance = new GatewayService();
  }
  return gatewayServiceInstance;
}
