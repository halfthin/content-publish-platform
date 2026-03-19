/**
 * 小红书未登录页面选择器配置
 *
 * 创建时间**: 2026-03-07 05:25 CST
 * 用途**: 用于未登录状态下浏览/抓取小红书搜索结果页面
 *
 * 注意**: 未登录页面与登录页面结构不同，需要专用选择器
 */

export interface UnauthPageSelectors {
  // 登录提示
  loginTips: string[];

  // 搜索结果卡片 (未登录模式)
  resultCard: string[];

  // 笔记/博主信息
  title: string[];
  author: string[];
  avatar: string[];
  like: string[];
  collect: string[];
  comment: string[];
}

type SelectorElement = {
  textContent(): Promise<string | null>;
};

type SelectorCard = {
  $(selector: string): Promise<SelectorElement | null>;
};

/**
 * 未登录页面选择器配置
 */
export const unauthPageSelectors: UnauthPageSelectors = {
  // 登录提示
  loginTips: ['.user-tips', '.tip-text', '[class*="login"]', 'button:has-text("登录")'],

  // 搜索结果卡片 (未登录模式)
  resultCard: [
    '.note-item',
    '.search-result-item',
    '.note-card',
    '[class*="note"]',
    '[class*="card"]',
    'section[class*="note"]',
    'article[class*="note"]',
  ],

  // 标题
  title: ['.title', '[class*="title"]', 'h3', '[class*="content"]', '.note-content'],

  // 作者
  author: ['.author', '[class*="author"]', '.user-name', '[class*="user"] .name', '.nickname'],

  // 头像
  avatar: ['.avatar', '[class*="avatar"]', '[class*="user"] img', 'img[class*="avatar"]'],

  // 点赞
  like: ['.like', '[class*="like"]', '[class*="heart"]', '.interaction-like'],

  // 收藏
  collect: ['.collect', '[class*="collect"]', '[class*="star"]', '.interaction-collect'],

  // 评论
  comment: ['.comment', '[class*="comment"]', '.interaction-comment'],
};

/**
 * 在卡片内查找元素
 */
export async function findElementInCard(
  card: SelectorCard,
  selectors: string[]
): Promise<SelectorElement | null> {
  for (const selector of selectors) {
    try {
      const el = await card.$(selector);
      if (el) return el;
    } catch {}
  }
  return null;
}

/**
 * 提取元素文本
 */
export async function getElementText(card: SelectorCard, selectors: string[]): Promise<string> {
  const el = await findElementInCard(card, selectors);
  if (el) {
    const text = await el.textContent();
    return text?.trim() || '';
  }
  return '';
}
