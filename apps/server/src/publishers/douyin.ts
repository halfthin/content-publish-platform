import type { BrowserContext, Page } from 'playwright';
import { clickElement, douyinSelectors, fillInput, findElement } from '../config/douyin-selectors';
import { createLogger } from '../config/logger';
import { browserPool } from '../config/playwright';
import type { PublishJob } from '../queues/publish-queue';
import { decryptCookies, encryptCookies } from '../utils/encryption';

const logger = createLogger('douyin-publisher');

export interface DouyinPublisherConfig {
  accountId: string;
  headless?: boolean;
  timeout?: number;
}

export interface DouyinPublishResult {
  success: boolean;
  publishedUrl?: string;
  error?: string;
  errorCode?: string;
}

/**
 * 抖音视频发布器
 *
 * 功能：
 * - 支持 Cookie 保持登录
 * - 发布视频 + 标题 + 描述 + 话题
 * - 支持封面图设置
 * - 自动等待发布完成
 *
 * 注意：
 * - 抖音视频有格式和大小限制
 * - 需要预先处理视频格式（MP4 推荐）
 * - 发布时间较长，需要耐心等待
 */
export class DouyinPublisher {
  private accountId: string;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: DouyinPublisherConfig;

  constructor(config: DouyinPublisherConfig) {
    this.accountId = config.accountId;
    this.config = config;
  }

  /**
   * 初始化浏览器上下文
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Douyin publisher', { accountId: this.accountId });

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
      await page.goto('https://creator.douyin.com', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 检查是否已登录（使用多个备选 selector）
      const hasAvatar = await findElement(page, douyinSelectors.login.userAvatar, {
        timeout: 5000,
      });

      const hasLoginButton = await findElement(page, douyinSelectors.login.loginButton, {
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

      await page.goto('https://creator.douyin.com', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 点击登录按钮
      const loginClicked = await clickElement(page, douyinSelectors.login.loginButton, {
        timeout: 10000,
      });

      if (!loginClicked) {
        logger.warn('Login button not found, may already be on login page');
      }

      // 等待用户完成登录（扫码或输入账号密码）
      // 抖音通常使用扫码登录
      logger.info('Waiting for user to complete login (scan QR code or enter credentials)');

      const hasAvatar = await findElement(page, douyinSelectors.login.userAvatar, {
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
  async publish(job: PublishJob): Promise<DouyinPublishResult> {
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
      await page.goto('https://creator.douyin.com/publish', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout || 60000,
      });

      // 1. 上传视频
      if (job.content.video) {
        logger.info('Uploading video', { path: job.content.video });
        await this.uploadVideo(page, job.content.video);
      } else {
        return {
          success: false,
          error: 'Video path is required for Douyin publish',
          errorCode: 'MISSING_VIDEO',
        };
      }

      // 等待视频上传和处理完成
      logger.info('Waiting for video processing');
      await this.waitForVideoProcessing(page);

      // 2. 填写标题和描述
      logger.info('Filling title and description');
      await this.fillContent(
        page,
        job.content.title,
        job.content.description || '',
        job.content.tags || []
      );

      // 3. 设置封面（可选）
      if (job.content.coverPath) {
        logger.info('Setting cover image', { path: job.content.coverPath });
        await this.setCoverImage(page, job.content.coverPath);
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
   * 上传视频
   */
  private async uploadVideo(page: Page, videoPath: string): Promise<void> {
    logger.info('Finding video upload button');

    // 找到视频上传按钮
    const uploadButton = await findElement(page, douyinSelectors.publish.uploadButton, {
      timeout: 15000,
    });

    if (!uploadButton) {
      logger.error('Upload button not found', { selectors: douyinSelectors.publish.uploadButton });
      throw new Error('Upload button not found - please verify selectors');
    }

    logger.info('Upload button found, clicking to upload');
    await uploadButton.click();

    // 找到文件输入框
    const fileInput = await findElement(page, douyinSelectors.publish.fileInput, {
      timeout: 5000,
    });

    if (!fileInput) {
      throw new Error('File input not found');
    }

    // 上传视频文件
    logger.info('Uploading video file', { path: videoPath });
    await fileInput.setInputFiles(videoPath);

    // 等待视频预览出现
    const videoPreview = await findElement(page, douyinSelectors.publish.videoPreview, {
      timeout: 60000, // 视频上传可能需要较长时间
    });

    if (!videoPreview) {
      throw new Error('Video preview not found after upload');
    }

    logger.info('Video uploaded successfully');
  }

  /**
   * 等待视频处理完成
   */
  private async waitForVideoProcessing(page: Page): Promise<void> {
    logger.info('Waiting for video processing');

    // 等待加载状态消失
    const loadingElements = douyinSelectors.common.loading;
    for (const selector of loadingElements) {
      try {
        await page.waitForSelector(selector, {
          state: 'detached',
          timeout: 120000, // 视频处理可能需要 2 分钟
        });
        logger.info('Loading indicator disappeared');
        break;
      } catch {
        // 继续尝试下一个 selector
      }
    }

    // 额外等待时间确保视频处理完成
    await page.waitForTimeout(3000);

    logger.info('Video processing completed');
  }

  /**
   * 填写内容（标题、描述、话题）
   */
  private async fillContent(
    page: Page,
    title: string,
    description: string,
    tags: string[]
  ): Promise<void> {
    logger.info('Filling content');

    // 填写标题
    if (title) {
      const titleFilled = await fillInput(page, douyinSelectors.publish.titleInput, title, {
        timeout: 5000,
      });

      if (titleFilled) {
        logger.info('Title filled');
      } else {
        logger.warn('Title input not found, skipping');
      }
    }

    // 填写描述
    if (description) {
      const descElement = await findElement(page, douyinSelectors.publish.descriptionEditor, {
        timeout: 5000,
      });

      if (descElement) {
        const isContentEditable = await descElement.evaluate(
          (el: HTMLElement) => el.contentEditable === 'true'
        );

        if (isContentEditable) {
          await descElement.click();
          await page.keyboard.type(description, { delay: 50 });
          logger.info('Description filled (contenteditable)');
        } else {
          await descElement.fill(description);
          logger.info('Description filled (input/textarea)');
        }
      } else {
        logger.warn('Description editor not found');
      }
    }

    // 添加话题标签
    if (tags && tags.length > 0) {
      logger.info('Adding hashtags', { count: tags.length });
      await this.addHashtags(page, tags);
    }
  }

  /**
   * 添加话题标签
   */
  private async addHashtags(page: Page, tags: string[]): Promise<void> {
    for (const tag of tags) {
      try {
        // 清理标签格式（移除 # 符号，如果有的话）
        const cleanTag = tag.replace(/^#|#$/g, '');

        // 点击话题按钮
        const hashtagClicked = await clickElement(page, douyinSelectors.publish.hashtagButton, {
          timeout: 3000,
        });

        if (hashtagClicked) {
          // 等待话题输入框出现
          await page.waitForTimeout(500);

          // 输入话题
          const hashtagInput = await findElement(page, douyinSelectors.publish.hashtagInput, {
            timeout: 3000,
          });

          if (hashtagInput) {
            await hashtagInput.fill(cleanTag);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            logger.info(`Hashtag added: #${cleanTag}#`);
          }
        } else {
          // 如果找不到话题按钮，直接在描述中添加话题格式
          await page.keyboard.type(`#${cleanTag}# `);
          logger.info(`Hashtag added inline: #${cleanTag}#`);
        }
      } catch (error) {
        logger.error('Failed to add hashtag', { tag, error: String(error) });
      }
    }

    logger.info('All hashtags added', { count: tags.length });
  }

  /**
   * 设置封面图片
   */
  private async setCoverImage(page: Page, coverPath: string): Promise<void> {
    logger.info('Finding cover upload button');

    const coverButton = await findElement(page, douyinSelectors.publish.coverUpload, {
      timeout: 5000,
    });

    if (!coverButton) {
      logger.warn('Cover upload button not found, skipping');
      return;
    }

    await coverButton.click();

    // 找到文件输入框
    const fileInput = await findElement(page, douyinSelectors.publish.fileInput, {
      timeout: 5000,
    });

    if (fileInput) {
      await fileInput.setInputFiles(coverPath);
      logger.info('Cover image set');
    } else {
      logger.warn('File input for cover not found');
    }
  }

  /**
   * 提交发布
   */
  private async submitPublish(page: Page): Promise<void> {
    logger.info('Finding publish button');

    const clicked = await clickElement(page, douyinSelectors.publish.publishButton, {
      timeout: 10000,
    });

    if (!clicked) {
      logger.error('Publish button not found', {
        selectors: douyinSelectors.publish.publishButton,
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
      // 等待成功提示
      const successElement = await findElement(page, douyinSelectors.publish.successToast, {
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
      const urlElement = await findElement(page, douyinSelectors.publish.publishedUrl, {
        timeout: 5000,
      });

      if (urlElement) {
        const url = await urlElement.getAttribute('href');
        logger.info('Published URL retrieved', { url });
        if (url) {
          return url.startsWith('http') ? url : `https://www.douyin.com${url}`;
        }
      }

      // 从当前 URL 获取
      const currentUrl = page.url();
      if (currentUrl.includes('douyin.com') || currentUrl.includes('iesdouyin.com')) {
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
