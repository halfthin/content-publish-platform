import { createLogger } from './logger';

const logger = createLogger('xhs-mcp');

export interface XhsMcpInstanceConfig {
  name: string;
  url: string;
  accountName?: string;
}

interface XhsMcpConfig {
  instances: XhsMcpInstanceConfig[];
}

function parseInstances(): XhsMcpInstanceConfig[] {
  const raw = process.env.XHS_MCP_INSTANCES || '[]';

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      logger.error('XHS_MCP_INSTANCES must be a JSON array');
      return [];
    }

    const valid = parsed.filter(
      (item: unknown): item is XhsMcpInstanceConfig =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as XhsMcpInstanceConfig).name === 'string' &&
        typeof (item as XhsMcpInstanceConfig).url === 'string' &&
        (item as XhsMcpInstanceConfig).name.length > 0 &&
        (item as XhsMcpInstanceConfig).url.length > 0
    );

    if (valid.length !== parsed.length) {
      logger.warn(
        `XHS_MCP_INSTANCES: ${parsed.length - valid.length} invalid entries filtered out`
      );
    }

    return valid;
  } catch {
    logger.error('XHS_MCP_INSTANCES: failed to parse JSON');
    return [];
  }
}

function buildMcpUrl(instance: XhsMcpInstanceConfig): string {
  const base = instance.url.replace(/\/+$/, '');
  return base.includes('/mcp') ? base : `${base}/mcp`;
}

const instances = parseInstances();

export const xhsMcpConfig: XhsMcpConfig = {
  instances,
};

export function getMcpUrlByName(name: string): string | undefined {
  const inst = instances.find((i) => i.name === name);
  return inst ? buildMcpUrl(inst) : undefined;
}

export function getMcpUrlByIndex(index: number): string | undefined {
  const inst = instances[index];
  return inst ? buildMcpUrl(inst) : undefined;
}

export function validateXhsMcpConfig(): boolean {
  if (instances.length === 0) {
    logger.warn('No XHS MCP instances configured (XHS_MCP_INSTANCES is empty)');
    return false;
  }

  logger.info(
    `XHS MCP instances loaded: ${instances.map((i) => `${i.name}(${buildMcpUrl(i)})`).join(', ')}`
  );

  return true;
}
