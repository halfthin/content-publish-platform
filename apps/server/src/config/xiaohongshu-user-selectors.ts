/**
 * 小红书用户主页元素 Selector 配置
 *
 * 创建时间**: 2026-03-07 11:20 CST
 * 用途**: 用于采集博主详细信息（昵称、小红书号、IP 属地、关注、粉丝、获赞等）
 *
 * 页面类型**:
 * - 用户主页：https://www.xiaohongshu.com/user/profile/{userId}
 * - 创作者主页：https://creator.xiaohongshu.com/user/{userId}
 *
 * 数据采集目标**:
 * 1. 博主名称 (nickname)
 * 2. 小红书号 (userId)
 * 3. IP 属地 (ipLocation)
 * 4. 关注数 (followCount)
 * 5. 粉丝数 (fansCount)
 * 6. 获赞与收藏数 (likesCount)
 */

export interface UserProfileSelectors {
  // 基础信息
  nickname: string[]; // 博主昵称
  userId: string[]; // 小红书号
  ipLocation: string[]; // IP 属地
  avatar: string[]; // 头像

  // 统计数据
  followCount: string[]; // 关注数
  fansCount: string[]; // 粉丝数
  likesCount: string[]; // 获赞与收藏数

  // 笔记列表
  noteList: string[]; // 笔记列表容器
  noteCard: string[]; // 笔记卡片

  // 交互元素
  followButton: string[]; // 关注按钮
  messageButton: string[]; // 私信按钮
}

/**
 * 小红书用户主页 Selector 配置
 *
 * 选择器优先级**:
 * 1. data-e2e 属性 (最稳定，官方测试用)
 * 2. 语义化 class 名
 * 3. 通用模式匹配 [class*="xxx"]
 * 4. XPath (最后手段)
 *
 * 注意**:
 * - 小红书页面结构可能频繁更新
 * - 建议定期验证选择器有效性
 * - 使用多个备选提高容错性
 */
export const userProfileSelectors: UserProfileSelectors = {
  // 博主昵称
  nickname: [
    '[class*="nickname"]',
    '.user-nickname',
    '.nickname',
    '[data-e2e="userNickname"]',
    '.user-info .nickname',
  ],

  // 小红书号
  userId: [
    '[class*="user-id"]',
    '.user-id',
    '.red-id',
    'span:has-text("小红书号")',
    '[data-e2e="userId"]',
  ],

  // IP 属地
  ipLocation: [
    '[class*="ip"]',
    '.ip-location',
    'span:has-text("IP")',
    'span:has-text("属地")',
    '[class*="location"]',
  ],

  // 头像
  avatar: [
    '[class*="avatar"]',
    '.user-avatar',
    '.avatar',
    'img[class*="avatar"]',
    '[data-e2e="userAvatar"]',
  ],

  // 关注数
  followCount: [
    '[class*="follow"]',
    '.follow-count',
    '.user-follow',
    '[data-e2e="followCount"]',
    '.user-stats .follow',
  ],

  // 粉丝数
  fansCount: [
    '[class*="fan"]',
    '.fans-count',
    '.user-fans',
    '[data-e2e="fansCount"]',
    '.user-stats .fans',
  ],

  // 获赞与收藏数
  likesCount: [
    '[class*="like"]',
    '.likes-count',
    '.total-favorites',
    '[data-e2e="likesCount"]',
    '.user-stats .likes',
    '[class*="favorite"]',
  ],

  // 笔记列表容器
  noteList: ['.note-list', '.user-notes', '[class*="note-list"]', '.feeds-container'],

  // 笔记卡片
  noteCard: ['.note-item', '.note-card', '[class*="note-card"]', '.note-list .note-item'],

  // 关注按钮
  followButton: [
    '[class*="follow-btn"]',
    '.follow-button',
    'button:has-text("关注")',
    '[data-e2e="followButton"]',
  ],

  // 私信按钮
  messageButton: [
    '[class*="message"]',
    '.message-button',
    'button:has-text("私信")',
    '[data-e2e="messageButton"]',
  ],
};

type SelectorElement = {
  textContent(): Promise<string | null>;
  getAttribute(name: string): Promise<string | null>;
  $(selector: string): Promise<SelectorElement | null>;
};

type SelectorPage = {
  waitForSelector(
    selector: string,
    options: { state: 'visible'; timeout: number; strict?: boolean }
  ): Promise<SelectorElement | null>;
};

/**
 * 查找第一个匹配的元素
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

  return null;
}

/**
 * 提取元素文本
 */
export async function getElementText(
  page: SelectorPage,
  selectors: string[],
  options?: { timeout?: number }
): Promise<string> {
  const element = await findElement(page, selectors, options);

  if (element) {
    return (await element.textContent()) || '';
  }

  return '';
}

/**
 * 提取元素属性
 */
export async function getElementAttribute(
  page: SelectorPage,
  selectors: string[],
  attribute: string,
  options?: { timeout?: number }
): Promise<string> {
  const element = await findElement(page, selectors, options);

  if (element) {
    return (await element.getAttribute(attribute)) || '';
  }

  return '';
}

/**
 * 提取元素图片 URL
 */
export async function getImageUrl(
  page: SelectorPage,
  selectors: string[],
  options?: { timeout?: number }
): Promise<string> {
  const element = await findElement(page, selectors, options);

  if (element) {
    // 尝试获取 src 或 data-src
    const src = await element.getAttribute('src');
    if (src) return src;

    const dataSrc = await element.getAttribute('data-src');
    if (dataSrc) return dataSrc;

    // 查找内部的 img 标签
    const img = await element.$('img');
    if (img) {
      const imgSrc = await img.getAttribute('src');
      if (imgSrc) return imgSrc;
    }
  }

  return '';
}

/**
 * 提取用户主页数据
 */
export async function extractUserProfile(
  page: SelectorPage,
  selectors: UserProfileSelectors = userProfileSelectors
): Promise<{
  nickname: string;
  userId: string;
  ipLocation: string;
  avatar: string;
  followCount: string;
  fansCount: string;
  likesCount: string;
}> {
  try {
    const [nickname, userId, ipLocation, avatar, followCount, fansCount, likesCount] =
      await Promise.all([
        getElementText(page, selectors.nickname, { timeout: 5000 }),
        getElementText(page, selectors.userId, { timeout: 5000 }),
        getElementText(page, selectors.ipLocation, { timeout: 5000 }),
        getImageUrl(page, selectors.avatar, { timeout: 5000 }),
        getElementText(page, selectors.followCount, { timeout: 5000 }),
        getElementText(page, selectors.fansCount, { timeout: 5000 }),
        getElementText(page, selectors.likesCount, { timeout: 5000 }),
      ]);

    return {
      nickname: nickname.trim(),
      userId: userId.trim(),
      ipLocation: ipLocation.trim(),
      avatar: avatar.trim(),
      followCount: followCount.trim(),
      fansCount: fansCount.trim(),
      likesCount: likesCount.trim(),
    };
  } catch (error) {
    console.error('Failed to extract user profile:', error);
    throw error;
  }
}
