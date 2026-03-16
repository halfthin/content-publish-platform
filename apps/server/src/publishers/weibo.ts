import type { BrowserContext, Page } from 'playwright';
import { createLogger } from '../config/logger';
import { browserPool } from '../config/playwright';
import { clickElement, fillInput, findElement, weiboSelectors } from '../config/weibo-selectors';
import type { PublishJob } from '../queues/publish-queue';
import { decryptCookies, encryptCookies } from '../utils/encryption';

const logger = createLogger('weibo-publisher');

export interface WeiboPublisherConfig {
  accountId: string;
  headless?: boolean;
  timeout?: number;
}

export interface WeiboPublishResult {
  success: boolean;
  publishedUrl?: string;
  error?: string;
  errorCode?: string;
}

/**
 * 微博发布器
 *
 * 功能：
 * - 支持 Cookie 保持登录
 * - 发布文字 + 图片（最多 9 张）+ 话题
 * - 自动等待发布完成
 */
export class WeiboPublisher {
  private accountId: string;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: WeiboPublisherConfig;

  constructor(config: WeiboPublisherConfig) {
    this.accountId = config.accountId;
    this.config = config;
  }

  /**
   * 初始化浏览器上下文
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Weibo publisher', { accountId: this.accountId });

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
      await this.context.addCookies(cookies);
      logger.info('Cookies loaded', { accountId: this.accountId, count: cookies.length });
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
      await page.goto('https://weibo.com', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 检查是否已登录（使用多个备选 selector）
      const hasAvatar = await findElement(page, weiboSelectors.login.userAvatar, {
        timeout: 5000,
      });

      const hasLoginButton = await findElement(page, weiboSelectors.login.loginButton, {
        timeout: 5000,
      });

      const isLoggedIn = !!hasAvatar && !hasLoginButton;

      await page.close();

      logger.info('Login status checked', {
        accountId: this.accountId,
        isLoggedIn,
        hasAvatar: !!hasAvatar,
        hasLoginButton: !!hasLoginButton,
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

      await page.goto('https://weibo.com', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 点击登录按钮
      const loginClicked = await clickElement(page, weiboSelectors.login.loginButton, {
        timeout: 10000,
      });

      if (!loginClicked) {
        logger.warn('Login button not found, may already be on login page');
      }

      // 等待用户完成登录（扫码或输入账号密码）
      // 这里需要人工介入，等待时间较长
      logger.info('Waiting for user to complete login (scan QR or enter credentials)');

      const hasAvatar = await findElement(page, weiboSelectors.login.userAvatar, {
        timeout: 300000, // 5 分钟等待时间
      });

      if (!hasAvatar) {
        throw new Error('Login timeout - user did not complete login within 5 minutes');
      }

      logger.info('Login completed', { accountId: this.accountId });

      // 等待一小段时间确保页面稳定
      await page.waitForTimeout(2000);

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
  async publish(job: PublishJob): Promise<WeiboPublishResult> {
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

      // 导航到发布页面（微博首页即发布页面）
      await page.goto('https://weibo.com', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 1. 填写内容（包括话题）
      logger.info('Filling content');
      await this.fillContent(
        page,
        job.content.description || job.content.title,
        job.content.tags || []
      );

      // 2. 上传图片
      if (job.content.images && job.content.images.length > 0) {
        logger.info('Uploading images', { count: job.content.images.length });
        await this.uploadImages(page, job.content.images);
      }

      // 3. 提交发布
      logger.info('Submitting publish');
      await this.submitPublish(page);

      // 4. 等待发布完成并获取链接
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
   * 填写内容（包括话题）
   */
  private async fillContent(page: Page, content: string, tags: string[]): Promise<void> {
    logger.info('Filling content and topics');

    // 找到内容编辑器
    const editorElement = await findElement(page, weiboSelectors.publish.contentEditor, {
      timeout: 15000,
    });

    if (!editorElement) {
      logger.error('Content editor not found', { selectors: weiboSelectors.publish.contentEditor });
      throw new Error('Content editor not found - please verify selectors');
    }

    // 检查是否是 contenteditable div
    const isContentEditable = await editorElement.evaluate(
      (el: HTMLElement) => el.contentEditable === 'true'
    );

    if (isContentEditable) {
      // 对于 contenteditable div，先点击再输入
      await editorElement.click();
      await page.keyboard.type(content, { delay: 50 });
      logger.info('Content filled (contenteditable div)');
    } else {
      // 普通输入框
      await editorElement.fill(content);
      logger.info('Content filled (input/textarea)');
    }

    // 添加话题标签
    if (tags && tags.length > 0) {
      logger.info('Adding topic tags', { count: tags.length });
      await this.addTopicTags(page, tags);
    }
  }

  /**
   * 添加话题标签
   */
  private async addTopicTags(page: Page, tags: string[]): Promise<void> {
    for (const tag of tags) {
      try {
        // 清理标签格式（移除 # 符号，如果有的话）
        const cleanTag = tag.replace(/^#|#$/g, '');

        // 点击话题按钮
        const topicClicked = await clickElement(page, weiboSelectors.publish.topicButton, {
          timeout: 3000,
        });

        if (topicClicked) {
          // 等待话题输入框出现
          await page.waitForTimeout(500);

          // 输入话题
          const topicInput = await findElement(page, weiboSelectors.publish.topicInput, {
            timeout: 3000,
          });

          if (topicInput) {
            await topicInput.fill(cleanTag);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            logger.info(`Topic added: #${cleanTag}#`);
          }
        } else {
          // 如果找不到话题按钮，直接在内容中添加话题格式
          await page.keyboard.type(`#${cleanTag}# `);
          logger.info(`Topic added inline: #${cleanTag}#`);
        }
      } catch (error) {
        logger.error('Failed to add topic', { tag, error: String(error) });
      }
    }

    logger.info('All topics added', { count: tags.length });
  }

  /**
   * 上传图片
   */
  private async uploadImages(page: Page, images: string[]): Promise<void> {
    logger.info('Finding image upload button');

    // 微博最多支持 9 张图片
    const maxImages = 9;
    const imagesToUpload = images.slice(0, maxImages);

    if (images.length > maxImages) {
      logger.warn(`Too many images (${images.length}), only uploading first ${maxImages}`);
    }

    // 找到图片上传按钮
    const uploadButton = await findElement(page, weiboSelectors.publish.imageUploadButton, {
      timeout: 15000,
    });

    if (!uploadButton) {
      logger.error('Image upload button not found', {
        selectors: weiboSelectors.publish.imageUploadButton,
      });
      throw new Error('Image upload button not found - please verify selectors');
    }

    logger.info('Image upload button found, clicking to upload');
    await uploadButton.click();

    // 找到文件输入框
    const fileInput = await findElement(page, weiboSelectors.publish.fileInput, {
      timeout: 5000,
    });

    if (!fileInput) {
      throw new Error('File input not found');
    }

    // 逐个上传图片
    for (let i = 0; i < imagesToUpload.length; i++) {
      const imagePath = imagesToUpload[i];
      logger.info(`Uploading image ${i + 1}/${imagesToUpload.length}`, { path: imagePath });

      try {
        await fileInput.setInputFiles(imagePath);

        // 等待图片上传完成
        const imageItem = await findElement(page, weiboSelectors.publish.imageItem, {
          timeout: 30000,
        });

        if (!imageItem) {
          throw new Error('Image preview not found after upload');
        }

        logger.info(`Image ${i + 1} uploaded successfully`);

        // 如果还有图片要上传，点击上传按钮再次打开文件选择器
        if (i < imagesToUpload.length - 1) {
          await page.waitForTimeout(1000);
          await uploadButton.click();
          await page.waitForTimeout(500);
        }
      } catch (error) {
        logger.error(`Failed to upload image ${i + 1}`, {
          path: imagePath,
          error: String(error),
        });
        throw new Error(`Failed to upload image: ${error}`);
      }
    }

    logger.info('All images uploaded', { count: imagesToUpload.length });
  }

  /**
   * 提交发布
   */
  private async submitPublish(page: Page): Promise<void> {
    logger.info('Finding publish button');

    const clicked = await clickElement(page, weiboSelectors.publish.publishButton, {
      timeout: 10000,
    });

    if (!clicked) {
      logger.error('Publish button not found', { selectors: weiboSelectors.publish.publishButton });
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
      const successElement = await findElement(page, weiboSelectors.publish.successToast, {
        timeout: 30000,
      });

      if (!successElement) {
        logger.warn('Success toast not found');
      } else {
        logger.info('Success toast displayed');
      }

      // 等待一小段时间确保页面稳定
      await page.waitForTimeout(2000);

      // 获取发布后的链接
      // 方法 1: 查找成功提示中的链接
      const urlElement = await findElement(page, weiboSelectors.publish.publishedUrl, {
        timeout: 5000,
      });

      if (urlElement) {
        const url = await urlElement.getAttribute('href');
        logger.info('Published URL retrieved', { url });
        if (url) {
          return url.startsWith('http') ? url : `https://weibo.com${url}`;
        }
      }

      // 方法 2: 从当前 URL 获取
      const currentUrl = page.url();
      if (currentUrl.includes('weibo.com/')) {
        logger.info('Using current page URL', { url: currentUrl });
        return currentUrl;
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
