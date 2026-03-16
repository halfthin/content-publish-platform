/**
 * 微博平台页面元素 Selector 配置
 *
 * 使用说明：
 * 1. 使用多个备选 selector 提高容错性
 * 2. 优先使用 data-* 等稳定属性
 * 3. 定期验证 selector 是否有效
 *
 * 验证方法：
 * - 浏览器开发者工具检查元素
 * - Playwright Codegen: npx playwright code https://weibo.com
 */

export interface WeiboSelectors {
  // 登录相关
  login: {
    loginButton: string[];
    loginForm: string[];
    usernameInput: string[];
    passwordInput: string[];
    submitButton: string[];
    userAvatar: string[];
  };

  // 发布页面相关
  publish: {
    publishArea: string[];
    contentEditor: string[];
    imageUploadButton: string[];
    fileInput: string[];
    imageItem: string[];
    topicButton: string[];
    topicInput: string[];
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
 * 微博平台 Selector 配置
 *
 * 注意：以下 selector 基于 2025 年微博页面结构
 * 如页面更新，需要重新验证和更新
 */
export const weiboSelectors: WeiboSelectors = {
  login: {
    // 登录按钮 - 多个备选
    loginButton: [
      'a[href*="login"]',
      'button:has-text("登录")',
      'a:has-text("登录")',
      '[class*="login"]',
      'a[href*="sso.login"]',
    ],

    // 登录表单
    loginForm: ['form[action*="login"]', '[class*="login-form"]', '#loginForm'],

    // 用户名输入框
    usernameInput: [
      'input[name="username"]',
      'input[type="text"]',
      'input[placeholder*="用户名"]',
      'input[placeholder*="手机号"]',
      'input[id*="username"]',
      'input[id*="loginname"]',
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
      'a:has-text("登录")',
      '[class*="submit"]',
      '[type="submit"]',
    ],

    // 用户头像（已登录标志）
    userAvatar: [
      'img[class*="avatar"]',
      '.woo-avatar-img',
      '[class*="user-avatar"]',
      'img[alt*="头像"]',
      '[node-type="avatar"]',
    ],
  },

  publish: {
    // 发布区域 - 使用多个备选
    publishArea: [
      '[class*="publish"]',
      '[class*="post"]',
      '[class*="composer"]',
      '[node-type="publish"]',
      'div[class*="write"]',
      '[placeholder*="有什么新鲜事"]',
      '[placeholder*="分享你的日常"]',
    ],

    // 内容编辑器（contenteditable 或 textarea）
    contentEditor: [
      '[class*="editor"]',
      'div[contenteditable="true"]',
      'textarea[class*="content"]',
      'textarea[placeholder*="微博"]',
      '[node-type="content"]',
      '[data-type="content"]',
    ],

    // 图片上传按钮
    imageUploadButton: [
      '[class*="image-upload"]',
      '[class*="upload-image"]',
      'button[class*="pic"]',
      '[node-type="addPic"]',
      '[data-action="addPic"]',
      'svg[class*="picture"]',
      'i[class*="picture"]',
    ],

    // 文件输入框
    fileInput: [
      'input[type="file"]',
      'input[accept*="image"]',
      '[class*="upload"] input[type="file"]',
    ],

    // 图片项（上传后显示）
    imageItem: [
      '[class*="image-item"]',
      '[class*="pic-item"]',
      '[node-type="image"]',
      '[class*="preview"]',
      'img[class*="thumbnail"]',
    ],

    // 话题按钮
    topicButton: [
      '[class*="topic"]',
      'button:has-text("#")',
      'button:has-text("话题")',
      '[node-type="topic"]',
      '[data-action="topic"]',
    ],

    // 话题输入框
    topicInput: ['input[placeholder*="话题"]', 'input[class*="topic"]', '[class*="topic-input"]'],

    // 发布按钮
    publishButton: [
      'button:has-text("发布")',
      'button[class*="publish"]',
      'button[class*="submit"]',
      '[class*="send"]',
      '[node-type="submit"]',
      '[type="submit"]',
      'button:has-text("发送")',
    ],

    // 成功提示
    successToast: [
      '[class*="success"]',
      '[class*="toast"]',
      '.woo-toast-success',
      '[class*="message-success"]',
      '[node-type="success"]',
    ],

    // 发布后的链接
    publishedUrl: [
      'a[class*="status-link"]',
      'a[href*="weibo.com/"]',
      '[class*="detail-link"]',
      'a:has-text("查看")',
    ],
  },

  common: {
    // 加载状态
    loading: ['[class*="loading"]', '.woo-loading', '[class*="spinner"]', '[class*="loader"]'],

    // 错误提示
    error: [
      '[class*="error"]',
      '.woo-toast-error',
      '[class*="toast-error"]',
      '[node-type="error"]',
    ],

    // 弹窗
    modal: ['[class*="modal"]', '[role="dialog"]', '.woo-modal', '[class*="dialog"]'],

    // 确认按钮
    confirm: [
      'button:has-text("确认")',
      'button:has-text("确定")',
      '[class*="confirm"]',
      '[class*="ok"]',
    ],

    // 取消按钮
    cancel: ['button:has-text("取消")', '[class*="cancel"]', '[class*="close"]'],
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
