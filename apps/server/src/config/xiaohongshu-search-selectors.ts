/**
 * 小红书搜索页面元素 Selector 配置
 *
 * 创建时间**: 2026-03-06 23:00 CST
 * 更新时间**: 2026-03-07 09:45 CST (根据实际 DOM 分析更新)
 * 用途**: 用于浏览/抓取小红书搜索结果页面（非创作者平台）
 *
 * 页面类型**:
 * - 搜索结果页：https://www.xiaohongshu.com/search_result?keyword=xxx
 * - 发现页：https://www.xiaohongshu.com/explore
 * - 用户主页：https://www.xiaohongshu.com/user/profile/xxx
 *
 * 使用说明**:
 * 1. 使用多个备选 selector 提高容错性
 * 2. 优先使用 data-e2e 等稳定属性
 * 3. 定期验证 selector 是否有效
 *
 * 验证方法**:
 * - 浏览器开发者工具检查元素
 * - Playwright Codegen: npx playwright code https://www.xiaohongshu.com
 */

export interface SearchPageSelectors {
  // 搜索框
  searchInput: string[];

  // 搜索结果卡片（博主/笔记）
  resultCard: string[];

  // 博主信息
  bloggerName: string[]; // 昵称
  bloggerId: string[]; // 小红书号
  bloggerAvatar: string[]; // 头像
  bloggerFans: string[]; // 粉丝数
  bloggerFollow: string[]; // 关注数
  bloggerLikes: string[]; // 获赞与收藏

  // 笔记信息
  noteTitle: string[]; // 标题
  noteContent: string[]; // 内容摘要
  noteCover: string[]; // 封面图
  noteLike: string[]; // 点赞数
  noteCollect: string[]; // 收藏数
  noteComment: string[]; // 评论数
  noteShare: string[]; // 转发数
  noteAuthor: string[]; // 笔记作者
  noteTime: string[]; // 发布时间

  // 交互元素
  searchButton: string[]; // 搜索按钮
  loadMore: string[]; // 加载更多
}

/**
 * 小红书搜索页面 Selector 配置
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
 *
 * 实际 DOM 结构分析 (2026-03-07)**:
 * ```html
 * <section class="note-item">
 *   <div>
 *     <a class="cover mask ld">
 *       <img>
 *     </a>
 *     <div class="footer">
 *       <a class="title">
 *         <span>标题</span>
 *       </a>
 *       <div class="card-bottom-wrapper">
 *         <a class="author">
 *           <img class="author-avatar">
 *           <div class="name-time-wrapper">
 *             <div class="name">昵称</div>
 *             <div class="time">时间</div>
 *           </div>
 *         </a>
 *         <span class="like-wrapper like-active">
 *           <span class="count">点赞数</span>
 *         </span>
 *       </div>
 *     </div>
 *   </div>
 * </section>
 * ```
 */
export const searchPageSelectors: SearchPageSelectors = {
  // 搜索框
  searchInput: [
    'input#search-input',
    'input.search-input',
    'input[placeholder*="搜索"]',
    '.input-box input',
  ],

  // 搜索结果卡片
  resultCard: [
    'section.note-item',
    '.feeds-container section.note-item',
    '[data-v-7009f43a][data-v-36cb8a9a].note-item',
  ],

  // 博主昵称
  bloggerName: [
    '.note-item .author .name',
    '.card-bottom-wrapper .author .name',
    '.name-time-wrapper .name',
    '[class*="name-time-wrapper"] [class*="name"]',
  ],

  // 小红书号（需要从用户主页获取，搜索页不显示）
  bloggerId: ['.user-id', '.red-id', '[class*="user-id"]', '[class*="red-id"]'],

  // 博主头像
  bloggerAvatar: [
    '.note-item .author .author-avatar',
    '.note-item .author img.author-avatar',
    '.card-bottom-wrapper .author img',
    'img[class*="avatar"]',
  ],

  // 粉丝数（需要从用户主页获取，搜索页不显示）
  bloggerFans: ['[class*="fan"]', '[class*="follower"]', '.user-fans'],

  // 关注数（需要从用户主页获取，搜索页不显示）
  bloggerFollow: ['[class*="follow"]', '.user-follow'],

  // 获赞与收藏（需要从用户主页获取，搜索页不显示）
  bloggerLikes: ['[class*="like"]', '[class*="favorite"]', '.total-favorites'],

  // 笔记标题
  noteTitle: [
    '.note-item .title',
    '.note-item .title span',
    '.footer .title',
    '[class*="footer"] [class*="title"]',
  ],

  // 笔记内容摘要（搜索页不显示）
  noteContent: ['.note-content', '.content', '.desc', '.description'],

  // 笔记封面图
  noteCover: [
    '.note-item .cover img',
    '.note-item .cover.mask img',
    '.note-item a.cover img',
    'section.note-item img',
  ],

  // 笔记点赞数
  noteLike: [
    '.note-item .like-wrapper .count',
    '.like-wrapper.like-active .count',
    '[class*="like-wrapper"] [class*="count"]',
    '.interaction-like .count',
  ],

  // 笔记收藏数（搜索页不显示）
  noteCollect: ['[class*="collect"]', '[class*="favorite"]', '.interaction-collect'],

  // 笔记评论数（搜索页不显示）
  noteComment: ['[class*="comment"]', '.interaction-comment'],

  // 笔记转发数（搜索页不显示）
  noteShare: ['[class*="share"]', '.interaction-share'],

  // 笔记作者
  noteAuthor: [
    '.note-item .author',
    '.card-bottom-wrapper .author',
    '.author[href*="/user/profile/"]',
  ],

  // 发布时间
  noteTime: [
    '.note-item .author .time',
    '.name-time-wrapper .time',
    '.author .time',
    '[class*="time"]',
  ],

  // 搜索按钮
  searchButton: [
    'button[class*="search"]',
    '.input-button .search-icon',
    'button:has-text("搜索")',
  ],

  // 加载更多
  loadMore: [
    '.feeds-loading',
    'button:has-text("加载更多")',
    'button:has-text("查看更多")',
    '[class*="load-more"]',
  ],
};

/**
 * 查找第一个匹配的元素
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

  return null;
}

/**
 * 在卡片内查找元素
 */
export async function findElementInCard(card: any, selectors: string[]): Promise<any> {
  for (const selector of selectors) {
    try {
      const el = await card.$(selector);
      if (el) return el;
    } catch (error) {}
  }
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
 * 提取元素文本
 */
export async function getElementText(
  page: any,
  selectors: string[],
  options?: { timeout?: number }
): Promise<string> {
  const element = await findElement(page, selectors, options);

  if (element) {
    return (await element.textContent()) || '';
  }

  return '';
}
