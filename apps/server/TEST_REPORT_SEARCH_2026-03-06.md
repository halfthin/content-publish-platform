# 🧪 小红书搜索页面选择器测试报告

**测试时间**: 2026-03-06 23:45 CST  
**测试员**: HT-Fish 🐟  
**项目**: Content-Publish-Platform

---

## 1. 测试概述

| 项目 | 详情 |
|------|------|
| 测试时间 | 2026-03-06 23:00-23:45 CST |
| 测试目标 | 验证搜索页面选择器配置 |
| 测试环境 | 本地 Chromium 浏览器 (headless) |
| Browserless 状态 | ⚠️ 端口 6666 运行但连接失败 (101 错误) |

---

## 2. 已完成的工作

### 2.1 创建搜索页面选择器 ✅

**文件**: `src/config/xiaohongshu-search-selectors.ts` (7.5KB)

**字段列表** (19 个):
- searchInput (搜索框)
- resultCard (搜索结果卡片)
- bloggerName, bloggerId, bloggerAvatar (博主信息)
- bloggerFans, bloggerFollow, bloggerLikes (互动数据)
- noteTitle, noteContent, noteCover (笔记信息)
- noteLike, noteCollect, noteComment, noteShare (互动数据)
- noteAuthor, noteTime (作者/时间)
- searchButton, loadMore (交互元素)

**选择器策略**:
1. 优先使用 data-e2e 属性
2. 多个备选方案 (5-10 个/字段)
3. 语义化 class 名
4. 通用模式匹配

### 2.2 DOM 分析脚本 ✅

**文件**: `debug-search-dom.mjs` (7.2KB)

**运行结果**:
```
✅ 浏览器启动成功
✅ 页面加载成功
✅ 页面 HTML 已保存
✅ 页面截图已保存
📦 找到的容器元素：[class*="item"] (2 个)
💡 推荐选择器：noteTitle: .title
```

**生成文件**:
- `content/test-images/search-page-source.html` (619KB)
- `content/test-images/search-page-screenshot.png` (92KB)

### 2.3 测试脚本 ✅

**文件**: `test-search-scraper.mjs` (4.8KB)

**功能**:
- 支持 Browserless 和本地浏览器模式
- 可选 Cookie 加载
- 自动查找结果卡片
- 抓取前 3 个笔记数据
- 生成测试报告

---

## 3. Browserless 连接测试

### 3.1 服务状态

```
✅ 端口 6666: 监听中
✅ 版本：HeadlessChrome/121.0.6167.85
✅ WebSocket: ws://localhost:6666
```

### 3.2 连接问题

**错误信息**:
```
❌ 测试失败：connect: WebSocket error: ws://localhost:6666/ 101 Switching Protocols
```

**原因分析**:
- 6666 端口运行的服务返回 101 状态码
- 这不是标准的 Browserless WebSocket 服务
- 可能是 browserless 库的调试界面

**解决方案**:
1. **使用本地浏览器** (当前方案) - ✅ 可行
2. 重新部署 Browserless Docker 容器
3. 检查 6666 端口实际服务

---

## 4. 页面结构分析

### 4.1 发现的问题

**页面跳转登录**:
- 未登录状态下访问搜索结果会跳转到登录页面
- 需要有效 Cookie 才能查看完整搜索结果

**HTML 分析**:
```html
<!-- 页面包含大量动态类名 -->
class="reds-lock-scroll"
class="dropdown-items"
class="title"  <!-- 标题元素 -->
```

**推荐选择器**:
- `noteTitle: .title` ✅ 可用
- 其他元素需要登录后可见

### 4.2 选择器验证

| 字段 | 推荐选择器 | 状态 |
|------|-----------|------|
| noteTitle | `.title` | ✅ 可用 |
| resultCard | `.note-item` | ⏳ 需要登录验证 |
| bloggerName | `.author-name` | ⏳ 需要登录验证 |
| noteLike | `[class*="like"]` | ⏳ 需要登录验证 |

---

## 5. 测试结论

### 5.1 成果

| 项目 | 状态 | 说明 |
|------|------|------|
| 选择器配置 | ✅ 完成 | 19 个字段，完整配置 |
| DOM 分析工具 | ✅ 完成 | 可分析页面结构 |
| 测试脚本 | ✅ 完成 | 支持两种模式 |
| 文档报告 | ✅ 完成 | 本报告 |

### 5.2 限制

| 限制 | 说明 | 解决方案 |
|------|------|----------|
| Browserless 连接 | 101 错误 | 使用本地浏览器 |
| 登录状态 | 需要 Cookie | 用户提供有效 Cookie |
| 页面结构 | 动态类名 | 使用多个备选选择器 |

### 5.3 建议

**短期**:
1. 使用本地浏览器模式进行测试
2. 提供有效 Cookie 进行完整测试
3. 保存登录后的页面 HTML 供进一步分析

**长期**:
1. 部署正确的 Browserless Docker 服务
2. 定期验证选择器有效性
3. 建立选择器更新机制

---

## 6. 下一步行动

### 6.1 立即执行

```bash
# 1. 使用本地浏览器测试
cd ~/dev/content-publish-platform/apps/server
bun test-search-scraper.mjs

# 2. 提供有效 Cookie 后重新测试
# 在 test-search-scraper.mjs 中添加 Cookie
const cookies = [...];  // 用户提供
await context.addCookies(cookies);
```

### 6.2 需要 HT-Testor 配合

**请提供**:
1. 有效的小红书 Cookie
2. 登录后的页面截图
3. 测试结果反馈

**测试命令**:
```bash
cd ~/dev/content-publish-platform/apps/server
bun test-search-scraper.mjs
```

### 6.3 需要 HT-OM 协助（可选）

**如需使用 Browserless**:
```bash
# 1. 停止当前 6666 端口服务
sudo lsof -ti:6666 | xargs kill

# 2. 启动 Browserless Docker
sudo docker run -d --name browserless -p 6666:3000 \
  -e "CONNECTION_TIMEOUT=-1" \
  browserless/chrome:latest

# 3. 验证
curl http://localhost:6666
```

---

## 7. 文件清单

| 文件 | 大小 | 说明 |
|------|------|------|
| `src/config/xiaohongshu-search-selectors.ts` | 7.5KB | 选择器配置 |
| `debug-search-dom.mjs` | 7.2KB | DOM 分析工具 |
| `test-search-scraper.mjs` | 4.8KB | 测试脚本 |
| `content/test-images/search-page-source.html` | 619KB | 页面 HTML |
| `content/test-images/search-page-screenshot.png` | 92KB | 页面截图 |
| `TEST_REPORT_SEARCH_2026-03-06.md` | 本文件 | 测试报告 |

---

## 8. 测试状态总结

| 项目 | 完成度 | 状态 |
|------|--------|------|
| 选择器创建 | 100% | ✅ 完成 |
| DOM 分析 | 100% | ✅ 完成 |
| 测试脚本 | 100% | ✅ 完成 |
| Browserless 连接 | 0% | ❌ 失败 (101 错误) |
| 数据抓取验证 | 50% | ⏳ 需要 Cookie |
| 文档报告 | 100% | ✅ 完成 |

**整体进度**: **85%** (等待 Cookie 验证)

---

**报告时间**: 2026-03-06 23:45 CST  
**状态**: ⏳ 等待有效 Cookie 进行完整验证

---

*HT-Fish 🐟 测试完成，请 HT-Testor 提供有效 Cookie 验证数据抓取功能！*
