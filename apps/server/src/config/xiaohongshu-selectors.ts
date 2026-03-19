/**
 * 小红书页面元素 Selector 配置
 *
 * 更新时间**: 2026-03-06 22:45 CST
 * 更新内容**: 添加搜索结果页面选择器，增强容错性
 *
 * 使用说明：
 * 1. 使用多个备选 selector 提高容错性
 * 2. 优先使用 data-e2e 等稳定属性
 * 3. 定期验证 selector 是否有效
 *
 * 验证方法：
 * - 浏览器开发者工具检查元素
 * - Playwright Codegen: npx playwright code https://creator.xiaohongshu.com
 */

export interface XiaohongshuSelectors {
  // 登录相关
  login: {
    loginButton: string[];
    qrCode: string[];
    userAvatar: string[];
  };

  // 发布页面相关
  publish: {
    uploadArea: string[];
    fileInput: string[];
    titleInput: string[];
    descEditor: string[];
    tagInput: string[];
    publishButton: string[];
    imageItem: string[];
    successToast: string[];
    publishedUrl: string[];
  };

  // 搜索结果/数据抓取相关
  search: {
    noteCard: string[]; // 笔记卡片容器
    title: string[]; // 标题
    author: string[]; // 作者信息
    authorName: string[]; // 作者名称
    authorId: string[]; // 小红书号
    likeCount: string[]; // 点赞数
    collectCount: string[]; // 收藏数
    commentCount: string[]; // 评论数
    shareCount: string[]; // 分享数
    fanCount: string[]; // 粉丝数
    noteContent: string[]; // 笔记内容
    coverImage: string[]; // 封面图片
  };

  // 通用
  common: {
    loading: string[];
    error: string[];
    modal: string[];
    confirm: string[];
    cancel: string[];
  };
}

type SelectorElement = {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  clear(): Promise<void>;
};

type SelectorPage = {
  waitForSelector(
    selector: string,
    options: { state: 'visible' | 'detached'; timeout: number; strict?: boolean }
  ): Promise<SelectorElement | null>;
};

/**
 * 小红书 Selector 配置
 *
 * 注意：以下 selector 基于 2025-2026 年小红书页面结构
 * 如页面更新，需要重新验证和更新
 *
 * 选择器优先级：
 * 1. data-e2e 属性 (最稳定，官方测试用)
 * 2. 语义化 class 名
 * 3. 通用模式匹配
 * 4. XPath (最后手段)
 */
export const xiaohongshuSelectors: XiaohongshuSelectors = {
  login: {
    // 登录按钮 - 多个备选
    loginButton: [
      'button[data-e2e="login-button"]',
      '.login-button',
      'a[href*="login"]',
      'button:has-text("登录")',
      'button:has-text("登 录")',
      '.reds-button-new.login-btn',
    ],

    // 二维码
    qrCode: [
      'img[data-e2e="qr-code"]',
      '.qrcode-img',
      'img[src*="qrcode"]',
      'div[class*="qrcode"]',
    ],

    // 用户头像（已登录标志）
    userAvatar: [
      'img[data-e2e="user-avatar"]',
      '.user-avatar',
      '.avatar-img',
      'img[class*="avatar"]',
      'div[class*="user-info"] img',
      '[class*="user"] img',
    ],
  },

  publish: {
    // 上传区域 - 使用多个备选
    uploadArea: [
      'div[data-e2e="upload-area"]',
      '.upload-area',
      'div[class*="upload"]',
      'div[class*="image-upload"]',
      'button:has-text("上传")',
      'button:has-text("选择图片")',
    ],

    // 文件输入框
    fileInput: [
      'input[type="file"]',
      'input[data-e2e="file-input"]',
      'div[class*="upload"] input[type="file"]',
    ],

    // 标题输入框
    titleInput: [
      'input[data-e2e="title-input"]',
      'input[placeholder*="标题"]',
      'input[class*="title"]',
      'textarea[class*="title"]',
      'input[placeholder*="填写标题"]',
    ],

    // 描述编辑器（contenteditable）
    descEditor: [
      'div[data-e2e="desc-editor"]',
      'div[contenteditable="true"]',
      'div[class*="editor"]',
      'div[class*="desc"]',
      'div[class*="content"]',
      'textarea[placeholder*="正文"]',
      'textarea[placeholder*="描述"]',
    ],

    // 标签输入框
    tagInput: [
      'input[data-e2e="tag-input"]',
      'input[placeholder*="标签"]',
      'input[class*="tag"]',
      'div[class*="tag"] input',
      'input[placeholder*="#"]',
    ],

    // 发布按钮
    publishButton: [
      'button[data-e2e="publish"]',
      'button[data-e2e="submit"]',
      'button[type="submit"]',
      'button:has-text("发布")',
      'button:has-text("发 布")',
      'button[class*="publish"]',
      'button[class*="submit"]',
    ],

    // 图片项（上传后显示）
    imageItem: [
      'div[data-e2e="image-item"]',
      '.image-item',
      'div[class*="image-item"]',
      'div[class*="upload-preview"]',
      'img[class*="preview"]',
    ],

    // 成功提示
    successToast: [
      'div[data-e2e="success-toast"]',
      '.success-toast',
      'div[class*="success"]',
      'div[class*="toast"]',
      '.ant-message-success',
      'div[class*="message-success"]',
    ],

    // 发布后的链接
    publishedUrl: [
      'a[data-e2e="published-url"]',
      '.published-url',
      'a[class*="note-link"]',
      'a[href*="xiaohongshu.com"]',
      'a:has-text("查看")',
    ],
  },

  // 搜索结果/数据抓取选择器
  search: {
    // 笔记卡片容器 - 多个备选
    noteCard: [
      'div[data-e2e="note-item"]',
      '.note-item',
      '.search-result-item',
      '.note-card',
      'section[class*="note"]',
      'article[class*="note"]',
      '[class*="search-result"]',
      'div[class*="card"]',
    ],

    // 标题
    title: [
      'div[data-e2e="note-title"]',
      '.note-title',
      '.title',
      'h3[class*="title"]',
      '[class*="title"]',
      '.note-content',
    ],

    // 作者信息（容器）
    author: [
      'div[data-e2e="author-info"]',
      '.author-info',
      '.user-info',
      '[class*="author"]',
      '[class*="user-info"]',
    ],

    // 作者名称
    authorName: [
      'span[data-e2e="author-name"]',
      '.author-name',
      '.nickname',
      '.username',
      '[class*="author"] span',
      '[class*="user"] .name',
      '.user-name',
    ],

    // 小红书号
    authorId: [
      'span[data-e2e="author-id"]',
      '.author-id',
      '.user-id',
      '.red-id',
      '[class*="id"]',
      '.user-number',
    ],

    // 点赞数
    likeCount: [
      'span[data-e2e="like-count"]',
      '.like-count',
      '.like',
      '[class*="like"]',
      '[class*="heart"]',
      '.interaction-like',
    ],

    // 收藏数
    collectCount: [
      'span[data-e2e="collect-count"]',
      '.collect-count',
      '.collect',
      '.star',
      '[class*="collect"]',
      '[class*="star"]',
      '.interaction-collect',
    ],

    // 评论数
    commentCount: [
      'span[data-e2e="comment-count"]',
      '.comment-count',
      '.comment',
      '[class*="comment"]',
      '.interaction-comment',
    ],

    // 分享数
    shareCount: [
      'span[data-e2e="share-count"]',
      '.share-count',
      '.share',
      '[class*="share"]',
      '.interaction-share',
    ],

    // 粉丝数
    fanCount: [
      'span[data-e2e="fan-count"]',
      '.fan-count',
      '.fans-count',
      '.follower-count',
      '[class*="fan"]',
      '[class*="follower"]',
    ],

    // 笔记内容
    noteContent: [
      'div[data-e2e="note-content"]',
      '.note-content',
      '.content',
      '.desc',
      '.description',
    ],

    // 封面图片
    coverImage: [
      'img[data-e2e="cover-image"]',
      '.cover-image',
      '.note-cover',
      'img[class*="cover"]',
      '.note-item img',
    ],
  },

  common: {
    // 加载状态
    loading: ['.ant-spin', '[class*="loading"]', '.loading', 'div[class*="spinner"]'],

    // 错误提示
    error: [
      '.ant-message-error',
      '.error-message',
      '[class*="error"]',
      'div[class*="toast-error"]',
    ],

    // 弹窗
    modal: ['.ant-modal', '.modal', '[class*="modal"]', '[role="dialog"]'],

    // 确认按钮
    confirm: [
      'button:has-text("确认")',
      'button:has-text("确定")',
      '.ant-btn-primary',
      'button[class*="confirm"]',
    ],

    // 取消按钮
    cancel: ['button:has-text("取消")', '.ant-btn-default', 'button[class*="cancel"]'],
  },
};

/**
 * 查找第一个匹配的 selector
 */
export async function findElement(
  page: SelectorPage,
  selectors: string[],
  options?: { timeout?: number; strict?: boolean }
): Promise<SelectorElement | null> {
  const timeout = options?.timeout ?? 10000;

  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, {
        state: 'visible',
        timeout,
        strict: options?.strict ?? false,
      });

      if (element) {
        return element;
      }
    } catch {}
  }

  // 所有 selector 都失败
  return null;
}

/**
 * 查找并点击元素
 */
export async function clickElement(
  page: SelectorPage,
  selectors: string[],
  options?: { timeout?: number }
): Promise<boolean> {
  const element = await findElement(page, selectors, options);

  if (element) {
    await element.click();
    return true;
  }

  return false;
}

/**
 * 查找并填充输入框
 */
export async function fillInput(
  page: SelectorPage,
  selectors: string[],
  value: string,
  options?: { timeout?: number; clear?: boolean }
): Promise<boolean> {
  const element = await findElement(page, selectors, options);

  if (element) {
    if (options?.clear !== false) {
      await element.clear();
    }
    await element.fill(value);
    return true;
  }

  return false;
}

/**
 * 等待元素消失
 */
export async function waitForElementDisappear(
  page: SelectorPage,
  selectors: string[],
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10000;

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, {
        state: 'detached',
        timeout,
      });
      return;
    } catch {}
  }
}
