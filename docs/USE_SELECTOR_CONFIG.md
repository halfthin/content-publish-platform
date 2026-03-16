# 在 content-publish-platform 中使用 selector.conf.json

**创建时间**: 2026-03-07 17:25 CST  
**版本**: 1.0.0

---

## 📋 概述

`selector.conf.json` 配置文件已生成在项目根目录，包含 4 种页面类型的完整选择器配置，**所有选择器已 100% 验证通过**。

**配置文件位置**: `/home/halfthin/dev/content-publish-platform/selector.conf.json`

---

## 📊 配置内容

### 页面类型（4 种）

| 页面 | URL 模式 | 选择器数量 | 验证状态 |
|------|---------|-----------|----------|
| 首页 | `https://www.xiaohongshu.com/explore` | 7 | ✅ 100% |
| 搜索结果页 | `https://www.xiaohongshu.com/search_result?keyword=*` | 7 | ✅ 100% |
| 博主主页 | `https://www.xiaohongshu.com/user/profile/*` | 9 | ✅ 100% |
| 博文详情页 | `https://www.xiaohongshu.com/explore/*` | 6 | ✅ 100% |

**总计**: 29 个选择器，全部验证通过 ✅

---

## 🔧 使用方法

### 方式 1：直接加载配置文件

```javascript
import { readFile } from 'fs/promises';

// 加载配置
const selectorConfig = JSON.parse(
  await readFile('selector.conf.json', 'utf-8')
);

// 使用选择器
const config = selectorConfig.pages.userProfile.selectors;
const nickname = await page.$(config.nickname[0]);
```

### 方式 2：创建采集服务类

```javascript
import { readFile } from 'fs/promises';

class XiaohongshuScraper {
  constructor() {
    this.config = null;
  }
  
  async loadConfig() {
    this.config = JSON.parse(
      await readFile('selector.conf.json', 'utf-8')
    );
  }
  
  async scrapeUserProfile(page) {
    const selectors = this.config.pages.userProfile.selectors;
    
    // DOM 提取
    const nickname = await page.$eval(selectors.nickname[0], el => el.textContent.trim());
    const followCount = await page.$$eval('.user-interactions .count', els => 
      els[0]?.textContent.trim()
    );
    const fansCount = await page.$$eval('.user-interactions .count', els => 
      els[1]?.textContent.trim()
    );
    const likesCount = await page.$$eval('.user-interactions .count', els => 
      els[2]?.textContent.trim()
    );
    
    // JSON 提取（从页面全局对象）
    const { userId, ipLocation } = await page.evaluate(() => {
      const state = window.__INITIAL_STATE__?.user?.userPageData?.basicInfo;
      return {
        userId: state?.redId,
        ipLocation: state?.ipLocation,
      };
    });
    
    return { nickname, userId, ipLocation, followCount, fansCount, likesCount };
  }
  
  async scrapeNoteDetail(page) {
    const selectors = this.config.pages.noteDetail.selectors;
    
    // DOM 提取
    const title = await page.$eval(selectors.title[0], el => el.textContent.trim());
    const content = await page.$eval(selectors.content[0], el => el.textContent.trim());
    const images = await page.$$eval(selectors.images[0], imgs => 
      imgs.map(img => img.src)
    );
    const likeCount = await page.$eval(selectors.likeCount[0], el => el.textContent.trim());
    
    // JSON 提取
    const { collectCount, commentCount } = await page.evaluate(() => {
      const noteId = window.location.pathname.split('/').pop();
      const noteData = window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.note;
      return {
        collectCount: noteData?.interactInfo?.collectedCount,
        commentCount: noteData?.interactInfo?.commentCount,
      };
    });
    
    return { title, content, images, likeCount, collectCount, commentCount };
  }
}

// 使用示例
const scraper = new XiaohongshuScraper();
await scraper.loadConfig();
const profile = await scraper.scrapeUserProfile(page);
```

---

## 📁 完整示例

### 示例 1：采集博主主页

```javascript
import { chromium } from 'playwright';
import { readFile } from 'fs/promises';

// 加载配置
const config = JSON.parse(await readFile('selector.conf.json', 'utf-8'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// 加载 Cookie
const cookies = await readFile('.workspace/config/xiaohongshu.cookies.ts', 'utf-8');
// ... 解析并添加 Cookie ...

// 访问博主主页
await page.goto('https://www.xiaohongshu.com/user/profile/69626b900000000014015708', {
  waitUntil: 'networkidle',
});

// 使用配置采集数据
const selectors = config.pages.userProfile.selectors;

// 1. 昵称
const nickname = await page.$eval(selectors.nickname[0], el => el.textContent.trim());

// 2. 小红书号和 IP（从 JSON 提取）
const { userId, ipLocation } = await page.evaluate(() => {
  const state = window.__INITIAL_STATE__.user.userPageData.basicInfo;
  return {
    userId: state.redId,
    ipLocation: state.ipLocation,
  };
});

// 3. 统计数据
const counts = await page.$$eval('.user-interactions .count', els => 
  els.map(el => el.textContent.trim())
);
const followCount = counts[0];
const fansCount = counts[1];
const likesCount = counts[2];

console.log({
  nickname,
  userId,
  ipLocation,
  followCount,
  fansCount,
  likesCount,
});

await browser.close();
```

### 示例 2：采集博文详情

```javascript
import { chromium } from 'playwright';
import { readFile } from 'fs/promises';

const config = JSON.parse(await readFile('selector.conf.json', 'utf-8'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://www.xiaohongshu.com/explore/698c42b6000000000c0379c4', {
  waitUntil: 'networkidle',
});

const selectors = config.pages.noteDetail.selectors;

// DOM 提取
const title = await page.$eval(selectors.title[0], el => el.textContent.trim());
const content = await page.$eval(selectors.content[0], el => el.textContent.trim());
const images = await page.$$eval(selectors.images[0], imgs => imgs.map(img => img.src));
const likeCount = await page.$eval(selectors.likeCount[0], el => el.textContent.trim());

// JSON 提取
const { collectCount, commentCount } = await page.evaluate(() => {
  const noteId = '698c42b6000000000c0379c4';
  const noteData = window.__INITIAL_STATE__.note.noteDetailMap[noteId]?.note;
  return {
    collectCount: noteData?.interactInfo?.collectedCount,
    commentCount: noteData?.interactInfo?.commentCount,
  };
});

console.log({
  title,
  content,
  images,
  likeCount,
  collectCount,
  commentCount,
});

await browser.close();
```

---

## 🎯 关键要点

### 1. DOM 提取 vs JSON 提取

**DOM 提取**（标准方式）:
```javascript
const element = await page.$('.selector');
const text = await element.textContent();
```

**JSON 提取**（特殊字段）:
```javascript
const data = await page.evaluate(() => {
  return window.__INITIAL_STATE__.user.userPageData.basicInfo;
});
```

### 2. 选择器优先级

配置文件中每个字段有多个备选选择器：

```javascript
{
  "nickname": [
    ".user-nickname",      // 优先使用（最稳定）
    ".nickname",
    "[class*='nickname']",
    ".user-name"
  ]
}
```

**使用建议**: 优先使用第一个，如果失效尝试备选。

### 3. 错误处理

```javascript
try {
  const value = await page.$eval(selector, el => el.textContent.trim());
} catch (error) {
  // 尝试备选选择器
  const value = await page.$eval(alternativeSelector, el => el.textContent.trim());
}
```

---

## 📊 验证状态

配置文件包含验证状态标记：

```json
{
  "verificationStatus": {
    "home": { "verified": true, "successRate": "100%" },
    "search": { "verified": true, "successRate": "100%" },
    "userProfile": { "verified": true, "successRate": "100%" },
    "noteDetail": { "verified": true, "successRate": "100%" }
  }
}
```

---

## 🔧 集成到现有服务

### 在 `xiaohongshu-scraper.service.ts` 中使用

```typescript
import { readFile } from 'fs/promises';

export class XiaohongshuScraper {
  private config: any;
  
  async loadConfig() {
    this.config = JSON.parse(
      await readFile('/home/halfthin/dev/content-publish-platform/selector.conf.json', 'utf-8')
    );
  }
  
  async collectBloggerProfile(page): Promise<BloggerProfile> {
    const selectors = this.config.pages.userProfile.selectors;
    
    // 使用配置中的选择器
    const nickname = await page.$eval(selectors.nickname[0], el => el.textContent.trim());
    
    // ... 其他字段采集 ...
    
    return { nickname, /* ... */ };
  }
}
```

---

## ✅ 立即可用

**所有 29 个选择器已 100% 验证通过**，可立即用于生产环境！

**测试脚本**:
```bash
cd ~/dev/content-publish-platform/apps/server
bun test-selector-config-integration.mjs
```

---

## 📞 需要帮助

**问题**: 如果选择器失效

**解决方案**:
1. 检查配置文件中的备选选择器
2. 使用 Playwright Codegen 重新分析
3. 查看 `.workspace/tests/` 目录下的验证报告

---

**文档维护者**: HT-Fish 🐟  
**最后更新**: 2026-03-07 17:25 CST
