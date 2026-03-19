import type { BrowserContext, Page } from 'playwright';
import { createLogger } from '../config/logger';
import { browserPool } from '../config/playwright';
import {
  clickElement,
  fillInput,
  findElement,
  xiaohongshuSelectors,
} from '../config/xiaohongshu-selectors';
import type { PublishJob } from '../queues/publish-queue';
import { normalizeCookiesForBrowser } from '../utils/cookie-normalizer';
import { decryptCookies, encryptCookies } from '../utils/encryption';

const logger = createLogger('xiaohongshu-publisher');

export interface XiaohongshuPublisherConfig {
  accountId: string;
  headless?: boolean;
  timeout?: number;
}

export interface XiaohongshuPublishResult {
  success: boolean;
  publishedUrl?: string;
  error?: string;
  errorCode?: string;
}

/**
 * 小红书发布器
 */
export class XiaohongshuPublisher {
  private accountId: string;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: XiaohongshuPublisherConfig;

  constructor(config: XiaohongshuPublisherConfig) {
    this.accountId = config.accountId;
    this.config = config;
  }

  /**
   * 初始化浏览器上下文
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Xiaohongshu publisher', { accountId: this.accountId });

    try {
      this.context = await browserPool.createContext(this.accountId);

      // 设置控制台日志
      this.context.on('console', (msg) => {
        logger.debug('Browser console', {
          type: msg.type(),
          text: msg.text(),
          accountId: this.accountId,
        });
      });

      // 处理页面错误
      this.context.on('pageerror', (error) => {
        logger.error('Page error', {
          error: error.message,
          accountId: this.accountId,
        });
      });

      logger.info('Browser context initialized', { accountId: this.accountId });
    } catch (error) {
      logger.error('Failed to initialize browser context', {
        accountId: this.accountId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * 加载 Cookie
   */
  async loadCookies(encryptedCookies: string, password: string): Promise<boolean> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      const cookies = await decryptCookies(encryptedCookies, password);
      const normalizedCookies = normalizeCookiesForBrowser(cookies, 'xiaohongshu');
      await this.context.addCookies(normalizedCookies);
      logger.info('Cookies loaded', {
        accountId: this.accountId,
        inputCount: cookies.length,
        normalizedCount: normalizedCookies.length,
      });
      return true;
    } catch (error) {
      logger.error('Failed to load cookies', {
        accountId: this.accountId,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * 保存 Cookie
   */
  async saveCookies(password: string): Promise<string> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      const cookies = await this.context.cookies();
      const encrypted = await encryptCookies(cookies, password);
      logger.info('Cookies saved', { accountId: this.accountId, count: cookies.length });
      return encrypted;
    } catch (error) {
      logger.error('Failed to save cookies', {
        accountId: this.accountId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * 检查登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      const page = await this.context.newPage();
      await page.goto('https://creator.xiaohongshu.com/publish/publish', {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(this.config.timeout || 60000, 20000),
      });
      await page.waitForTimeout(1500);

      const hasPublishEntry = await findElement(page, xiaohongshuSelectors.publish.uploadArea, {
        timeout: 5000,
      });

      const hasLoginButton = await findElement(page, xiaohongshuSelectors.login.loginButton, {
        timeout: 5000,
      });

      const currentUrl = page.url();
      const isOnLoginPage = /login|signin|passport/i.test(currentUrl);
      const isLoggedIn =
        (!!hasPublishEntry || currentUrl.includes('creator.xiaohongshu.com')) &&
        !hasLoginButton &&
        !isOnLoginPage;

      await page.close();

      logger.info('Login status checked', {
        accountId: this.accountId,
        isLoggedIn,
        hasPublishEntry: !!hasPublishEntry,
        hasLoginButton: !!hasLoginButton,
        url: currentUrl,
      });
      return isLoggedIn;
    } catch (error) {
      logger.error('Failed to check login status', {
        accountId: this.accountId,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * 执行登录（需要人工介入）
   */
  async login(): Promise<boolean> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    logger.info('Starting login process', { accountId: this.accountId });

    try {
      const page = await this.context.newPage();
      this.page = page;

      await page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 点击登录按钮
      const loginButton = await page.$('.login-button');
      if (loginButton) {
        await loginButton.click();
        logger.info('Login button clicked, waiting for user to complete login');
      }

      // 等待用户完成登录（扫码或输入验证码）
      // 这里需要人工介入，等待时间较长
      await page.waitForSelector('.user-avatar', {
        timeout: 300000, // 5 分钟等待时间
      });

      logger.info('Login completed', { accountId: this.accountId });

      // 保存 Cookie
      // const encryptedCookies = await this.saveCookies(password);

      await page.close();
      this.page = null;

      return true;
    } catch (error) {
      logger.error('Login failed', {
        accountId: this.accountId,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * 发布内容
   */
  async publish(job: PublishJob): Promise<XiaohongshuPublishResult> {
    if (!this.context) {
      return {
        success: false,
        error: 'Browser context not initialized',
        errorCode: 'NOT_INITIALIZED',
      };
    }

    logger.info('Starting publish process', {
      accountId: this.accountId,
      contentId: job.contentId,
    });

    try {
      const page = await this.context.newPage();
      this.page = page;

      // 导航到发布页面
      await page.goto('https://creator.xiaohongshu.com/publish/publish', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 1. 上传图片
      logger.info('Uploading images', { count: job.content.images?.length || 0 });
      await this.uploadImages(page, job.content.images || []);

      // 2. 填写文案
      logger.info('Filling content');
      await this.fillContent(page, job.content.title, job.content.description || '');

      // 3. 添加标签
      if (job.content.tags && job.content.tags.length > 0) {
        logger.info('Adding tags', { count: job.content.tags.length });
        await this.addTags(page, job.content.tags);
      }

      // 4. 提交发布
      logger.info('Submitting publish');
      await this.submitPublish(page);

      // 5. 等待发布完成并获取链接
      logger.info('Waiting for publish completion');
      const publishedUrl = await this.waitForPublishComplete(page);

      await page.close();
      this.page = null;

      logger.info('Publish completed successfully', {
        accountId: this.accountId,
        publishedUrl,
      });

      return {
        success: true,
        publishedUrl,
      };
    } catch (error) {
      logger.error('Publish failed', {
        accountId: this.accountId,
        error: String(error),
      });

      return {
        success: false,
        error: String(error),
        errorCode: 'PUBLISH_FAILED',
      };
    }
  }

  /**
   * 上传图片
   */
  private async uploadImages(page: Page, images: string[]): Promise<void> {
    logger.info('Finding upload area');

    // 找到上传区域（使用多个备选 selector）
    const uploadElement = await findElement(page, xiaohongshuSelectors.publish.uploadArea, {
      timeout: 15000,
    });

    if (!uploadElement) {
      logger.error('Upload area not found', { selectors: xiaohongshuSelectors.publish.uploadArea });
      throw new Error('Upload area not found - please verify selectors');
    }

    logger.info('Upload area found, clicking to upload');
    await uploadElement.click();

    // 找到文件输入框并上传
    const fileInput = await findElement(page, xiaohongshuSelectors.publish.fileInput, {
      timeout: 5000,
    });

    if (!fileInput) {
      throw new Error('File input not found');
    }

    // 逐个上传图片
    for (let i = 0; i < images.length; i++) {
      const imagePath = images[i];
      logger.info(`Uploading image ${i + 1}/${images.length}`, { path: imagePath });

      try {
        await fileInput.setInputFiles(imagePath);

        // 等待图片上传完成
        await page.waitForSelector(xiaohongshuSelectors.publish.imageItem[0], {
          timeout: 30000,
          state: 'visible',
        });

        logger.info(`Image ${i + 1} uploaded successfully`);
      } catch (error) {
        logger.error(`Failed to upload image ${i + 1}`, {
          path: imagePath,
          error: String(error),
        });
        throw new Error(`Failed to upload image: ${error}`);
      }
    }

    logger.info('All images uploaded', { count: images.length });
  }

  /**
   * 填写内容
   */
  private async fillContent(page: Page, title: string, description: string): Promise<void> {
    logger.info('Filling title and description');

    // 填写标题
    const titleFilled = await fillInput(page, xiaohongshuSelectors.publish.titleInput, title, {
      timeout: 10000,
    });

    if (!titleFilled) {
      logger.warn('Failed to fill title', { selectors: xiaohongshuSelectors.publish.titleInput });
    } else {
      logger.info('Title filled successfully');
    }

    // 填写描述（可能是 contenteditable div 或 textarea）
    const descElement = await findElement(page, xiaohongshuSelectors.publish.descEditor, {
      timeout: 10000,
    });

    if (descElement) {
      // 检查是否是 contenteditable div
      const isContentEditable = await descElement.evaluate(
        (el: HTMLElement) => el.contentEditable === 'true'
      );

      if (isContentEditable) {
        // 对于 contenteditable div，使用 keyboard 输入
        await descElement.click();
        await page.keyboard.type(description, { delay: 50 });
        logger.info('Description filled (contenteditable div)');
      } else {
        // 普通输入框
        await descElement.fill(description);
        logger.info('Description filled (input/textarea)');
      }
    } else {
      logger.warn('Description editor not found', {
        selectors: xiaohongshuSelectors.publish.descEditor,
      });
    }
  }

  /**
   * 添加标签
   */
  private async addTags(page: Page, tags: string[]): Promise<void> {
    logger.info('Adding tags', { count: tags.length });

    for (const tag of tags) {
      // 找到标签输入框
      const tagInputElement = await findElement(page, xiaohongshuSelectors.publish.tagInput, {
        timeout: 5000,
      });

      if (!tagInputElement) {
        logger.warn('Tag input not found, skipping tag', { tag });
        continue;
      }

      try {
        // 清空并输入标签
        await tagInputElement.fill('');
        await tagInputElement.fill(tag);

        // 按 Enter 确认
        await page.keyboard.press('Enter');

        // 等待标签添加完成
        await page.waitForTimeout(500);

        logger.info(`Tag added: ${tag}`);
      } catch (error) {
        logger.error('Failed to add tag', { tag, error: String(error) });
      }
    }

    logger.info('Tags added', { count: tags.length });
  }

  /**
   * 提交发布
   */
  private async submitPublish(page: Page): Promise<void> {
    logger.info('Finding publish button');

    const clicked = await clickElement(page, xiaohongshuSelectors.publish.publishButton, {
      timeout: 10000,
    });

    if (!clicked) {
      logger.error('Publish button not found', {
        selectors: xiaohongshuSelectors.publish.publishButton,
      });
      throw new Error('Publish button not found - please verify selectors');
    }

    logger.info('Publish button clicked');
  }

  /**
   * 等待发布完成
   */
  private async waitForPublishComplete(page: Page): Promise<string> {
    logger.info('Waiting for publish completion');

    try {
      // 等待成功提示（多个备选 selector）
      const successElement = await findElement(page, xiaohongshuSelectors.publish.successToast, {
        timeout: 30000,
      });

      if (!successElement) {
        logger.warn('Success toast not found');
      } else {
        logger.info('Success toast displayed');
      }

      // 等待一小段时间确保页面稳定
      await page.waitForTimeout(1000);

      // 获取发布后的链接
      const urlElement = await findElement(page, xiaohongshuSelectors.publish.publishedUrl, {
        timeout: 5000,
      });

      if (urlElement) {
        const url = await urlElement.getAttribute('href');
        logger.info('Published URL retrieved', { url });
        return url || '';
      }

      logger.warn('Published URL not found');
      return '';
    } catch (error) {
      logger.error('Error waiting for publish completion', { error: String(error) });
      throw new Error(`Publish completion check failed: ${error}`);
    }
  }

  /**
   * 关闭
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await browserPool.removeContext(this.accountId);
      this.context = null;
    }

    logger.info('Publisher closed', { accountId: this.accountId });
  }
}
