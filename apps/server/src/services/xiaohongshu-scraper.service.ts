/**
 * 小红书数据采集服务
 *
 * 创建时间**: 2026-03-07 11:20 CST
 * 用途**: 采集小红书博主信息和博文数据
 *
 * 功能**:
 * 1. 搜索关键词，获取博主列表
 * 2. 访问博主主页，采集详细信息
 * 3. 浏览博主笔记，采集博文数据
 */

import type { BrowserContext, Page } from 'playwright';
import { createLogger } from '../config/logger';
import { browserPool } from '../config/playwright';
import { extractNoteDetail, noteDetailSelectors } from '../config/xiaohongshu-note-selectors';
import { searchPageSelectors } from '../config/xiaohongshu-search-selectors';
import { extractUserProfile, userProfileSelectors } from '../config/xiaohongshu-user-selectors';

const logger = createLogger('xiaohongshu-scraper');

/**
 * 博主信息接口
 */
export interface BloggerProfile {
  userId: string; // 用户 ID
  nickname: string; // 昵称
  avatar: string; // 头像
  ipLocation: string; // IP 属地
  followCount: string; // 关注数
  fansCount: string; // 粉丝数
  likesCount: string; // 获赞与收藏数
  profileUrl: string; // 主页链接
  collectedAt: string; // 采集时间
}

/**
 * 笔记信息接口
 */
export interface NoteInfo {
  noteId: string; // 笔记 ID
  title: string; // 标题
  content: string; // 内容
  images: string[]; // 图片 URL 列表
  likeCount: string; // 点赞数
  collectCount: string; // 收藏数
  commentCount: string; // 评论数
  shareCount: string; // 分享数
  authorName: string; // 作者名
  publishTime: string; // 发布时间
  tags: string[]; // 标签
  noteUrl: string; // 笔记链接
  collectedAt: string; // 采集时间
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  keyword: string; // 搜索关键词
  totalCount: number; // 总结果数
  bloggers: BloggerProfile[]; // 博主列表
  notes: NoteInfo[]; // 笔记列表
}

/**
 * 采集配置
 */
export interface ScraperConfig {
  accountId: string;
  headless?: boolean;
  timeout?: number;
  maxBloggers?: number; // 最大采集博主数
  maxNotes?: number; // 每个博主最大采集笔记数
}

/**
 * 小红书数据采集器
 */
export class XiaohongshuScraper {
  private config: ScraperConfig;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: ScraperConfig) {
    this.config = {
      headless: true,
      timeout: 60000,
      maxBloggers: 10,
      maxNotes: 20,
      ...config,
    };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    logger.info('Initializing scraper', { accountId: this.config.accountId });

    try {
      this.context = await browserPool.createContext(this.config.accountId);

      this.context.on('console', (msg) => {
        logger.debug('Browser console', {
          type: msg.type(),
          text: msg.text(),
        });
      });

      this.context.on('pageerror', (error) => {
        logger.error('Page error', { error: error.message });
      });

      // 创建第一个页面
      this.page = await this.context.newPage();

      logger.info('Browser context and page initialized');
    } catch (error) {
      logger.error('Failed to initialize browser', { error: String(error) });
      throw error;
    }
  }

  /**
   * 加载 Cookie
   */
  async loadCookies(): Promise<boolean> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      // 读取 Cookie 配置文件（使用绝对路径）
      const cookiePath =
        '/home/halfthin/dev/content-publish-platform/.workspace/config/xiaohongshu.cookies.ts';
      const cookieContent = await Bun.file(cookiePath).text();

      // 解析 TypeScript 文件，提取 Cookie 数组
      const match = cookieContent.match(/export const XIAOHONGSHU_COOKIES = (\[.*?\]);/s);
      if (!match) {
        throw new Error('Failed to parse cookie file');
      }

      // 简化 JSON：移除注释和多余字段
      const cookiesJson = match[1]
        .replace(/\/\/.*$/gm, '') // 移除行注释
        .replace(/(\w+):/g, '"$1":') // 键名加引号
        .replace(/'/g, '"'); // 单引号转双引号

      const XIAOHONGSHU_COOKIES = JSON.parse(cookiesJson);

      // 转换为 Playwright Cookie 格式
      const playwrightCookies = XIAOHONGSHU_COOKIES.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate || -1,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
        sameSite: c.sameSite === 'unspecified' ? undefined : c.sameSite || 'Lax',
      }));

      await this.context.addCookies(playwrightCookies);

      logger.info('Cookies loaded', { count: playwrightCookies.length });
      return true;
    } catch (error) {
      logger.error('Failed to load cookies', { error: String(error) });
      return false;
    }
  }

  /**
   * 搜索关键词
   */
  async search(keyword: string): Promise<void> {
    if (!this.context || !this.page) {
      throw new Error('Browser not initialized');
    }

    logger.info('Searching keyword', { keyword });

    try {
      // 导航到搜索页面
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`;
      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      // 等待搜索结果加载
      await this.page.waitForSelector(searchPageSelectors.resultCard[0], {
        timeout: 10000,
      });

      logger.info('Search completed');
    } catch (error) {
      logger.error('Search failed', { error: String(error) });
      throw error;
    }
  }

  /**
   * 从搜索结果中提取博主列表
   */
  async extractBloggersFromSearch(): Promise<BloggerProfile[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    logger.info('Extracting bloggers from search results');

    try {
      const bloggers: BloggerProfile[] = [];
      const seenUsers = new Set<string>();

      // 获取所有笔记卡片
      const cards = await this.page.$$(searchPageSelectors.resultCard[0]);

      for (const card of cards) {
        try {
          // 提取作者信息（从笔记卡片中提取作者）
          const [authorEl, avatarEl] = await Promise.all([
            card.$(searchPageSelectors.noteAuthor[0]),
            card.$(searchPageSelectors.bloggerAvatar[0]),
          ]);

          const authorText = authorEl ? await authorEl.textContent() : '';
          const avatar = avatarEl ? await avatarEl.getAttribute('src') : '';
          const profileUrl = authorEl ? await authorEl.getAttribute('href') : '';

          // 去重
          if (authorText && profileUrl && !seenUsers.has(profileUrl)) {
            seenUsers.add(profileUrl);

            bloggers.push({
              userId: this.extractUserIdFromUrl(profileUrl),
              nickname: authorText.trim(),
              avatar: avatar || '',
              ipLocation: '',
              followCount: '',
              fansCount: '',
              likesCount: '',
              profileUrl: profileUrl.startsWith('http')
                ? profileUrl
                : `https://www.xiaohongshu.com${profileUrl}`,
              collectedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          logger.warn('Failed to extract author', { error: String(error) });
        }
      }

      logger.info('Bloggers extracted', { count: bloggers.length });
      return bloggers;
    } catch (error) {
      logger.error('Failed to extract bloggers', { error: String(error) });
      return [];
    }
  }

  /**
   * 访问博主主页
   */
  async visitUserProfile(userId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    logger.info('Visiting user profile', { userId });

    try {
      const profileUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
      await this.page.goto(profileUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      // 等待主页加载
      await this.page.waitForSelector(userProfileSelectors.nickname[0], {
        timeout: 10000,
      });

      logger.info('User profile loaded');
    } catch (error) {
      logger.error('Failed to load user profile', { error: String(error) });
      throw error;
    }
  }

  /**
   * 采集博主详细信息
   */
  async collectBloggerProfile(): Promise<BloggerProfile> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    logger.info('Collecting blogger profile');

    try {
      const profile = await extractUserProfile(this.page);
      const url = this.page.url();
      const userId = this.extractUserIdFromUrl(url);

      const bloggerProfile: BloggerProfile = {
        ...profile,
        userId,
        profileUrl: url,
        collectedAt: new Date().toISOString(),
      };

      logger.info('Blogger profile collected', {
        nickname: bloggerProfile.nickname,
        fansCount: bloggerProfile.fansCount,
      });

      return bloggerProfile;
    } catch (error) {
      logger.error('Failed to collect blogger profile', { error: String(error) });
      throw error;
    }
  }

  /**
   * 采集博主笔记列表
   */
  async collectBloggerNotes(maxNotes?: number): Promise<NoteInfo[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const limit = maxNotes || this.config.maxNotes;
    logger.info('Collecting blogger notes', { limit });

    try {
      const notes: NoteInfo[] = [];

      // 获取笔记卡片
      const noteCards = await this.page.$$(userProfileSelectors.noteCard[0]);

      for (let i = 0; i < Math.min(noteCards.length, limit); i++) {
        try {
          const card = noteCards[i];

          // 点击笔记进入详情页
          await card.click();
          await this.page.waitForLoadState('networkidle');

          // 等待详情页加载
          await this.page.waitForSelector(noteDetailSelectors.title[0], {
            timeout: 5000,
          });

          // 提取笔记详情
          const noteData = await extractNoteDetail(this.page);
          const noteUrl = this.page.url();
          const noteId = this.extractNoteIdFromUrl(noteUrl);

          notes.push({
            ...noteData,
            noteId,
            noteUrl,
            collectedAt: new Date().toISOString(),
          });

          // 返回笔记列表页
          await this.page.goBack();
          await this.page.waitForLoadState('networkidle');
        } catch (error) {
          logger.warn('Failed to collect note', { index: i, error: String(error) });

          // 尝试继续
          try {
            await this.page.goBack();
            await this.page.waitForLoadState('networkidle');
          } catch (e) {
            // 忽略错误
          }
        }
      }

      logger.info('Blogger notes collected', { count: notes.length });
      return notes;
    } catch (error) {
      logger.error('Failed to collect blogger notes', { error: String(error) });
      return [];
    }
  }

  /**
   * 完整的采集流程
   */
  async scrape(keyword: string): Promise<SearchResult> {
    logger.info('Starting full scrape process', { keyword });

    try {
      // 1. 搜索关键词
      await this.search(keyword);

      // 2. 提取博主列表
      const bloggers = await this.extractBloggersFromSearch();
      logger.info('Found bloggers', { count: bloggers.length });

      // 3. 采集每个博主的详细信息和笔记
      const allNotes: NoteInfo[] = [];

      for (const blogger of bloggers.slice(0, this.config.maxBloggers)) {
        logger.info('Processing blogger', { nickname: blogger.nickname });

        try {
          // 访问主页
          await this.visitUserProfile(blogger.userId);

          // 采集详细信息
          const detailedProfile = await this.collectBloggerProfile();

          // 合并信息
          Object.assign(blogger, detailedProfile);

          // 采集笔记
          const notes = await this.collectBloggerNotes();
          allNotes.push(...notes);
        } catch (error) {
          logger.error('Failed to process blogger', {
            nickname: blogger.nickname,
            error: String(error),
          });
        }
      }

      const result: SearchResult = {
        keyword,
        totalCount: bloggers.length,
        bloggers,
        notes: allNotes,
      };

      logger.info('Scrape completed', {
        bloggers: bloggers.length,
        notes: allNotes.length,
      });

      return result;
    } catch (error) {
      logger.error('Scrape failed', { error: String(error) });
      throw error;
    }
  }

  /**
   * 从 URL 提取用户 ID
   */
  private extractUserIdFromUrl(url: string): string {
    const match = url.match(/\/user\/profile\/([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
  }

  /**
   * 从 URL 提取笔记 ID
   */
  private extractNoteIdFromUrl(url: string): string {
    const match = url.match(/\/explore\/([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
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
      await browserPool.removeContext(this.config.accountId);
      this.context = null;
    }

    logger.info('Scraper closed');
  }
}

/**
 * 创建采集器实例
 */
export async function createScraper(config: ScraperConfig): Promise<XiaohongshuScraper> {
  const scraper = new XiaohongshuScraper(config);
  await scraper.initialize();
  return scraper;
}
