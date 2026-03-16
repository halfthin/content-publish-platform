/**
 * 抖音平台页面元素 Selector 配置
 *
 * 使用说明：
 * 1. 使用多个备选 selector 提高容错性
 * 2. 优先使用 data-* 等稳定属性
 * 3. 定期验证 selector 是否有效
 *
 * 验证方法：
 * - 浏览器开发者工具检查元素
 * - Playwright Codegen: npx playwright code https://creator.douyin.com
 */

export interface DouyinSelectors {
  // 登录相关
  login: {
    loginButton: string[];
    loginForm: string[];
    usernameInput: string[];
    passwordInput: string[];
    submitButton: string[];
    userAvatar: string[];
    qrCodeLogin: string[];
  };

  // 发布页面相关
  publish: {
    publishArea: string[];
    uploadButton: string[];
    fileInput: string[];
    videoPreview: string[];
    titleInput: string[];
    descriptionEditor: string[];
    hashtagButton: string[];
    hashtagInput: string[];
    coverUpload: string[];
    publishButton: string[];
    successToast: string[];
    publishedUrl: string[];
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

/**
 * 抖音平台 Selector 配置
 *
 * 注意：以下 selector 基于 2025 年抖音创作者平台页面结构
 * 如页面更新，需要重新验证和更新
 */
export const douyinSelectors: DouyinSelectors = {
  login: {
    // 登录按钮 - 多个备选
    loginButton: [
      'a[href*="login"]',
      'button:has-text("登录")',
      'a:has-text("登录")',
      '[class*="login"]',
      'button[class*="login-btn"]',
    ],

    // 登录表单
    loginForm: [
      'form[action*="login"]',
      '[class*="login-form"]',
      '#loginForm',
      '[class*="login-box"]',
    ],

    // 用户名/手机号输入框
    usernameInput: [
      'input[name="username"]',
      'input[type="tel"]',
      'input[placeholder*="手机号"]',
      'input[placeholder*="账号"]',
      'input[id*="username"]',
      'input[id*="mobile"]',
    ],

    // 密码输入框
    passwordInput: [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="密码"]',
      'input[id*="password"]',
    ],

    // 提交按钮
    submitButton: [
      'button[type="submit"]',
      'button:has-text("登录")',
      'button:has-text("获取验证码")',
      '[class*="submit"]',
      '[type="submit"]',
    ],

    // 用户头像（已登录标志）
    userAvatar: [
      'img[class*="avatar"]',
      'img[class*="user-avatar"]',
      '[class*="avatar"] img',
      'img[alt*="头像"]',
      '[node-type="avatar"]',
      '.user-avatar',
    ],

    // 二维码登录
    qrCodeLogin: [
      '[class*="qrcode"]',
      'img[src*="qrcode"]',
      '[class*="qr-code"]',
      '[class*="qr_code"]',
    ],
  },

  publish: {
    // 发布区域 - 使用多个备选
    publishArea: [
      '[class*="publish"]',
      '[class*="upload"]',
      '[class*="creator"]',
      '[node-type="publish"]',
      'div[class*="publish-container"]',
    ],

    // 上传按钮
    uploadButton: [
      '[class*="upload-btn"]',
      'button:has-text("上传视频")',
      'button:has-text("选择文件")',
      '[class*="upload-area"]',
      '[node-type="upload"]',
      '[data-action="upload"]',
      '.upload-button',
    ],

    // 文件输入框
    fileInput: [
      'input[type="file"]',
      'input[accept*="video"]',
      '[class*="upload"] input[type="file"]',
      'input[accept=".mp4,.mov,.avi"]',
    ],

    // 视频预览
    videoPreview: [
      '[class*="video-preview"]',
      '[class*="preview"] video',
      '[node-type="video-preview"]',
      'video[class*="preview"]',
      '.video-player',
    ],

    // 标题输入框
    titleInput: [
      'input[placeholder*="标题"]',
      'input[class*="title"]',
      '[class*="title-input"]',
      'input[id*="title"]',
      '[node-type="title"]',
    ],

    // 描述编辑器（contenteditable 或 textarea）
    descriptionEditor: [
      '[class*="description"]',
      'div[contenteditable="true"]',
      'textarea[class*="description"]',
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="文案"]',
      '[node-type="description"]',
      '[data-type="description"]',
      '.description-editor',
    ],

    // 话题/标签按钮
    hashtagButton: [
      '[class*="hashtag"]',
      '[class*="topic"]',
      'button:has-text("#")',
      'button:has-text("话题")',
      'button:has-text("@")',
      '[node-type="hashtag"]',
      '[data-action="hashtag"]',
    ],

    // 话题输入框
    hashtagInput: [
      'input[placeholder*="话题"]',
      'input[placeholder*="#"]',
      'input[class*="hashtag"]',
      '[class*="hashtag-input"]',
    ],

    // 封面上传
    coverUpload: [
      '[class*="cover"]',
      '[class*="thumbnail"]',
      'button:has-text("设置封面")',
      '[node-type="cover"]',
      '[class*="cover-upload"]',
    ],

    // 发布按钮
    publishButton: [
      'button:has-text("发布")',
      'button:has-text("发布视频")',
      'button[class*="publish"]',
      'button[class*="submit"]',
      '[class*="publish-btn"]',
      '[node-type="submit"]',
      '[type="submit"]',
      'button:has-text("确认发布")',
    ],

    // 成功提示
    successToast: [
      '[class*="success"]',
      '[class*="toast"]',
      '.toast-success',
      '[class*="message-success"]',
      '[node-type="success"]',
      '[class*="notification-success"]',
    ],

    // 发布后的链接
    publishedUrl: [
      'a[class*="video-link"]',
      'a[href*="douyin.com/"]',
      'a[href*="iesdouyin.com/"]',
      '[class*="detail-link"]',
      'a:has-text("查看")',
      'a:has-text("分享")',
    ],
  },

  common: {
    // 加载状态
    loading: [
      '[class*="loading"]',
      '.loading-spinner',
      '[class*="spinner"]',
      '[class*="loader"]',
      '[class*="loading-mask"]',
    ],

    // 错误提示
    error: [
      '[class*="error"]',
      '.toast-error',
      '[class*="toast-error"]',
      '[node-type="error"]',
      '[class*="error-message"]',
    ],

    // 弹窗
    modal: [
      '[class*="modal"]',
      '[role="dialog"]',
      '.modal-dialog',
      '[class*="dialog"]',
      '[class*="popup"]',
    ],

    // 确认按钮
    confirm: [
      'button:has-text("确认")',
      'button:has-text("确定")',
      '[class*="confirm"]',
      '[class*="ok"]',
      'button:has-text("是")',
    ],

    // 取消按钮
    cancel: [
      'button:has-text("取消")',
      '[class*="cancel"]',
      '[class*="close"]',
      'button:has-text("否")',
    ],
  },
};

/**
 * 查找第一个匹配的 selector
 */
export async function findElement(
  page: any,
  selectors: string[],
  options?: { timeout?: number; strict?: boolean }
): Promise<any> {
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
    } catch (error) {}
  }

  // 所有 selector 都失败
  return null;
}

/**
 * 查找并点击元素
 */
export async function clickElement(
  page: any,
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
  page: any,
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
  page: any,
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
