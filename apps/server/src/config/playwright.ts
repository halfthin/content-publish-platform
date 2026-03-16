import { type Browser, type BrowserContext, chromium } from 'playwright';
import { createLogger } from './logger';

const logger = createLogger('playwright');

export interface PlaywrightConfig {
  headless: boolean;
  slowMo: number;
  timeout: number;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent: string;
}

// 默认配置
const defaultConfig: PlaywrightConfig = {
  headless: true, // 默认无头模式（服务器环境）
  slowMo: parseInt(process.env.PLAYWRIGHT_SLOW_MO || '100', 10),
  timeout: 60000, // 60 秒超时
  viewport: {
    width: 1920,
    height: 1080,
  },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * 浏览器池管理类
 */
export class BrowserPool {
  private static instance: BrowserPool;
  private browser: Browser | null = null;
  private config: PlaywrightConfig;
  private contexts: Map<string, BrowserContext> = new Map();

  private constructor(config: Partial<PlaywrightConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<PlaywrightConfig>): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool(config);
    }
    return BrowserPool.instance;
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      logger.info('Browser already initialized');
      return;
    }

    try {
      // 检查是否使用 Browserless 远程浏览器
      const browserlessUrl = process.env.BROWSERLESS_URL;

      if (browserlessUrl) {
        // 检查是否为 CDP 模式 (URL 不包含 /playwright)
        const isCDPMode = !browserlessUrl.includes('/playwright');

        if (isCDPMode) {
          // Browserless v1.61+ 使用 CDP 协议
          const httpEndpoint = browserlessUrl.replace('ws://', 'http://');
          this.browser = await chromium.connectOverCDP(httpEndpoint);

          logger.info('Connected to Browserless service (CDP mode)', {
            httpEndpoint,
          });
        } else {
          // Playwright 协议模式
          this.browser = await chromium.connect({
            wsEndpoint: browserlessUrl,
          });

          logger.info('Connected to Browserless service (Playwright mode)', {
            wsEndpoint: browserlessUrl,
          });
        }
      } else {
        // 使用本地浏览器（开发模式）
        this.browser = await chromium.launch({
          headless: this.config.headless,
          slowMo: this.config.slowMo,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
          ],
        });

        logger.info('Chromium browser launched (local)', {
          headless: this.config.headless,
          slowMo: this.config.slowMo,
        });
      }
    } catch (error) {
      logger.error('Failed to initialize browser', { error: String(error) });
      throw error;
    }
  }

  /**
   * 创建新的浏览器上下文（用于多账号）
   */
  async createContext(
    accountId: string,
    options?: {
      cookies?: any[];
      storageState?: string;
    }
  ): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const existingContext = this.contexts.get(accountId);
    if (existingContext) {
      logger.warn('Context already exists for account', { accountId });
      return existingContext;
    }

    try {
      const context = await this.browser.newContext({
        viewport: this.config.viewport,
        userAgent: this.config.userAgent,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        ...options,
      });

      // 设置默认超时
      context.setDefaultTimeout(this.config.timeout);
      context.setDefaultNavigationTimeout(this.config.timeout);

      this.contexts.set(accountId, context);

      logger.info('Browser context created', { accountId });

      return context;
    } catch (error) {
      logger.error('Failed to create browser context', { accountId, error: String(error) });
      throw error;
    }
  }

  /**
   * 获取浏览器上下文
   */
  getContext(accountId: string): BrowserContext | undefined {
    return this.contexts.get(accountId);
  }

  /**
   * 删除浏览器上下文
   */
  async removeContext(accountId: string): Promise<void> {
    const context = this.contexts.get(accountId);
    if (context) {
      await context.close();
      this.contexts.delete(accountId);
      logger.info('Browser context removed', { accountId });
    }
  }

  /**
   * 获取浏览器实例
   */
  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.browser;
  }

  /**
   * 关闭所有上下文和浏览器
   */
  async close(): Promise<void> {
    // 关闭所有上下文
    for (const [accountId, context] of this.contexts.entries()) {
      try {
        await context.close();
        logger.info('Context closed', { accountId });
      } catch (error) {
        logger.error('Failed to close context', { accountId, error: String(error) });
      }
    }

    this.contexts.clear();

    // 关闭浏览器
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    activeContexts: number;
    browserConnected: boolean;
  } {
    return {
      activeContexts: this.contexts.size,
      browserConnected: this.browser?.isConnected() ?? false,
    };
  }
}

// 导出单例
export const browserPool = BrowserPool.getInstance();

// 导出便捷函数
export async function initializeBrowser(config?: Partial<PlaywrightConfig>): Promise<BrowserPool> {
  const pool = BrowserPool.getInstance(config);
  await pool.initialize();
  return pool;
}

export async function getBrowserContext(accountId: string, options?: any): Promise<BrowserContext> {
  const pool = BrowserPool.getInstance();
  return pool.createContext(accountId, options);
}
