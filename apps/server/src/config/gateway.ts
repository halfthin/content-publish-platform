import { createLogger } from './logger';

const logger = createLogger('gateway-config');

// Gateway 配置
const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const toGatewayToken = process.env.CPP_TO_GATEWAY_TOKEN || '';
const fromGatewayToken = process.env.CPP_FROM_GATEWAY_TOKEN || '';
const publishMode = process.env.PUBLISH_MODE || 'gateway';

export const gatewayConfig = {
  url: gatewayUrl,
  toGatewayToken,
  fromGatewayToken,
  publishMode: publishMode as 'gateway' | 'local',
  isGatewayMode: publishMode === 'gateway',
};

export function validateGatewayConfig(): boolean {
  if (!gatewayConfig.isGatewayMode) {
    logger.info('Gateway mode disabled, using local Playwright');
    return false;
  }

  if (!gatewayConfig.url) {
    logger.error('OPENCLAW_GATEWAY_URL is not configured');
    return false;
  }

  if (!gatewayConfig.toGatewayToken) {
    logger.warn('CPP_TO_GATEWAY_TOKEN is not set');
  }

  logger.info('Gateway config loaded', {
    url: gatewayConfig.url,
    publishMode: gatewayConfig.publishMode,
    hasToken: !!gatewayConfig.toGatewayToken,
  });

  return true;
}
