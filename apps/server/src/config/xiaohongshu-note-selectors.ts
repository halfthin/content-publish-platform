/**
 * 小红书笔记详情页面元素 Selector 配置
 *
 * 创建时间**: 2026-03-07 11:20 CST
 * 用途**: 用于采集博文详细信息（图片、文案、点赞、收藏、评论等）
 *
 * 页面类型**:
 * - 笔记详情：https://www.xiaohongshu.com/explore/{noteId}
 * - 笔记详情（备用）: https://www.xiaohongshu.com/discovery/item/{noteId}
 *
 * 数据采集目标**:
 * 1. 图片/视频 (images/videos)
 * 2. 文案内容 (content)
 * 3. 标题 (title)
 * 4. 点赞数 (likeCount)
 * 5. 收藏数 (collectCount)
 * 6. 评论数 (commentCount)
 * 7. 分享数 (shareCount)
 * 8. 作者信息 (author)
 * 9. 发布时间 (publishTime)
 */

export interface NoteDetailSelectors {
  // 内容区域
  title: string[]; // 标题
  content: string[]; // 文案内容
  contentText: string[]; // 纯文本内容

  // 媒体资源
  images: string[]; // 图片列表
  image: string[]; // 单张图片
  video: string[]; // 视频
  imageContainer: string[]; // 图片容器

  // 互动数据
  likeCount: string[]; // 点赞数
  collectCount: string[]; // 收藏数
  commentCount: string[]; // 评论数
  shareCount: string[]; // 分享数

  // 作者信息
  authorName: string[]; // 作者昵称
  authorAvatar: string[]; // 作者头像
  authorId: string[]; // 作者 ID

  // 时间信息
  publishTime: string[]; // 发布时间

  // 标签
  tags: string[]; // 话题标签

  // 交互元素
  likeButton: string[]; // 点赞按钮
  collectButton: string[]; // 收藏按钮
  commentButton: string[]; // 评论按钮
  shareButton: string[]; // 分享按钮

  // 评论列表
  commentList: string[]; // 评论列表容器
  commentItem: string[]; // 单条评论
}

/**
 * 小红书笔记详情页面 Selector 配置
 */
export const noteDetailSelectors: NoteDetailSelectors = {
  // 标题
  title: [
    '[class*="title"]',
    '.note-title',
    '.title',
    '[data-e2e="noteTitle"]',
    'h1[class*="title"]',
  ],

  // 文案内容（富文本）
  content: ['[class*="content"]', '.note-content', '.content', '[data-e2e="noteContent"]', '.desc'],

  // 纯文本内容
  contentText: ['[class*="text"]', '.text-content', '.note-text', 'p[class*="content"]'],

  // 图片列表容器
  images: [
    '[class*="image-list"]',
    '.image-list',
    '.note-images',
    '.carousel',
    '[data-e2e="noteImages"]',
  ],

  // 单张图片
  image: [
    '[class*="image"]',
    'img[class*="image"]',
    '.note-image',
    '.image-container img',
    '[data-e2e="noteImage"]',
  ],

  // 图片容器
  imageContainer: [
    '[class*="image-container"]',
    '.image-container',
    '.image-wrapper',
    '.carousel-item',
  ],

  // 视频
  video: [
    '[class*="video"]',
    'video',
    '.note-video',
    '[data-e2e="noteVideo"]',
    'video[class*="player"]',
  ],

  // 点赞数
  likeCount: [
    '[class*="like"]',
    '.like-count',
    '.like-wrapper .count',
    '[data-e2e="likeCount"]',
    '.interaction-like .count',
  ],

  // 收藏数
  collectCount: [
    '[class*="collect"]',
    '.collect-count',
    '.collect-wrapper .count',
    '[data-e2e="collectCount"]',
    '.interaction-collect .count',
  ],

  // 评论数
  commentCount: [
    '[class*="comment"]',
    '.comment-count',
    '.comment-wrapper .count',
    '[data-e2e="commentCount"]',
    '.interaction-comment .count',
  ],

  // 分享数
  shareCount: [
    '[class*="share"]',
    '.share-count',
    '.share-wrapper .count',
    '[data-e2e="shareCount"]',
    '.interaction-share .count',
  ],

  // 作者昵称
  authorName: [
    '[class*="author"]',
    '.author-name',
    '.user-name',
    '[data-e2e="authorName"]',
    '.user-info .name',
  ],

  // 作者头像
  authorAvatar: [
    '[class*="avatar"]',
    '.author-avatar',
    '.user-avatar',
    '[data-e2e="authorAvatar"]',
    'img[class*="avatar"]',
  ],

  // 作者 ID
  authorId: [
    '[class*="author-id"]',
    '.author-id',
    '.user-id',
    '[data-e2e="authorId"]',
    '.author[href*="/user/profile/"]',
  ],

  // 发布时间
  publishTime: [
    '[class*="time"]',
    '.publish-time',
    '.time',
    '[data-e2e="publishTime"]',
    'span[class*="time"]',
  ],

  // 话题标签
  tags: ['[class*="tag"]', '.note-tag', '.topic', '[data-e2e="noteTag"]', 'a[href*="/tag/"]'],

  // 点赞按钮
  likeButton: [
    '[class*="like-btn"]',
    '.like-button',
    'button[class*="like"]',
    '[data-e2e="likeButton"]',
  ],

  // 收藏按钮
  collectButton: [
    '[class*="collect-btn"]',
    '.collect-button',
    'button[class*="collect"]',
    '[data-e2e="collectButton"]',
  ],

  // 评论按钮
  commentButton: [
    '[class*="comment-btn"]',
    '.comment-button',
    'button[class*="comment"]',
    '[data-e2e="commentButton"]',
  ],

  // 分享按钮
  shareButton: [
    '[class*="share-btn"]',
    '.share-button',
    'button[class*="share"]',
    '[data-e2e="shareButton"]',
  ],

  // 评论列表容器
  commentList: [
    '[class*="comment-list"]',
    '.comment-list',
    '.comments',
    '[data-e2e="commentList"]',
  ],

  // 单条评论
  commentItem: ['[class*="comment-item"]', '.comment-item', '.comment', '[data-e2e="commentItem"]'],
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
  $$(selector: string, options?: { timeout?: number }): Promise<SelectorElement[]>;
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
 * 查找所有匹配的元素
 */
export async function findElements(
  page: SelectorPage,
  selectors: string[],
  options?: { timeout?: number }
): Promise<SelectorElement[]> {
  const timeout = options?.timeout ?? 10000;

  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector, { timeout });
      if (elements && elements.length > 0) {
        return elements;
      }
    } catch {}
  }

  return [];
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
 * 提取所有图片 URL
 */
export async function extractImages(
  page: SelectorPage,
  selectors: NoteDetailSelectors = noteDetailSelectors
): Promise<string[]> {
  try {
    // 先尝试找图片容器
    const containers = await findElements(page, selectors.imageContainer);

    if (containers && containers.length > 0) {
      const urls: string[] = [];
      for (const container of containers) {
        const img = await container.$('img');
        if (img) {
          const src = await img.getAttribute('src');
          if (src) urls.push(src);
        }
      }
      if (urls.length > 0) return urls;
    }

    // 直接找图片
    const images = await findElements(page, selectors.image);
    const urls: string[] = [];

    for (const img of images) {
      const src = await img.getAttribute('src');
      if (src && !urls.includes(src)) {
        urls.push(src);
      }
    }

    return urls;
  } catch (error) {
    console.error('Failed to extract images:', error);
    return [];
  }
}

/**
 * 提取笔记详情数据
 */
export async function extractNoteDetail(
  page: SelectorPage,
  selectors: NoteDetailSelectors = noteDetailSelectors
): Promise<{
  title: string;
  content: string;
  images: string[];
  likeCount: string;
  collectCount: string;
  commentCount: string;
  shareCount: string;
  authorName: string;
  authorAvatar: string;
  publishTime: string;
  tags: string[];
}> {
  try {
    // 并行提取所有字段
    const [
      title,
      content,
      images,
      likeCount,
      collectCount,
      commentCount,
      shareCount,
      authorName,
      authorAvatar,
      publishTime,
    ] = await Promise.all([
      getElementText(page, selectors.title, { timeout: 5000 }),
      getElementText(page, selectors.content, { timeout: 5000 }),
      extractImages(page, selectors),
      getElementText(page, selectors.likeCount, { timeout: 5000 }),
      getElementText(page, selectors.collectCount, { timeout: 5000 }),
      getElementText(page, selectors.commentCount, { timeout: 5000 }),
      getElementText(page, selectors.shareCount, { timeout: 5000 }),
      getElementText(page, selectors.authorName, { timeout: 5000 }),
      getElementText(page, selectors.authorAvatar, { timeout: 5000 }),
      getElementText(page, selectors.publishTime, { timeout: 5000 }),
    ]);

    // 提取标签
    const tagElements = await findElements(page, selectors.tags, { timeout: 5000 });
    const tags: string[] = [];
    for (const tag of tagElements) {
      const text = await tag.textContent();
      if (text) tags.push(text.trim());
    }

    return {
      title: title.trim(),
      content: content.trim(),
      images,
      likeCount: likeCount.trim(),
      collectCount: collectCount.trim(),
      commentCount: commentCount.trim(),
      shareCount: shareCount.trim(),
      authorName: authorName.trim(),
      authorAvatar: authorAvatar.trim(),
      publishTime: publishTime.trim(),
      tags,
    };
  } catch (error) {
    console.error('Failed to extract note detail:', error);
    throw error;
  }
}
