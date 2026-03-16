# agent-browser 分析报告

**分析日期**: 2026-03-07  
**分析对象**: https://agent-browser.dev/  
**版本**: v0.16.3 (2026-03-04 发布)

---

## 1️⃣ agent-browser 是什么？

**agent-browser** 是 Vercel Labs 开发的**专为 AI 代理设计的无头浏览器自动化 CLI 工具**。

### 核心特点

| 特点 | 说明 |
|------|------|
| 🚀 **Rust 原生 CLI** | 亚毫秒级命令解析（比 Node.js 快） |
| 📝 **紧凑文本输出** | 使用 accessibility tree + refs，节省 Token（~200-400 tokens vs ~3000-5000） |
| 🔗 **引用式选择器** | `@e1`, `@e2` 确定性元素定位 |
| 📦 **50+ 命令** | 导航、表单、截图、网络、存储等 |
| 🔐 **会话隔离** | 多个独立浏览器实例，独立认证状态 |
| 🌐 **跨平台** | macOS/Linux/Windows 原生二进制 |

### 安装方式

```bash
# 全局安装（推荐）
npm install -g agent-browser
agent-browser install  # 下载 Chromium

# macOS (Homebrew)
brew install agent-browser

# 快速尝试（无需安装）
npx agent-browser open example.com
```

---

## 2️⃣ 与当前架构对比

### 当前技术栈

content-publish-platform 使用 **Playwright (Node.js 库)**：

```typescript
// apps/server/src/config/playwright.ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ cookies });
const page = await context.newPage();
await page.goto('https://xiaohongshu.com');
```

### 对比表

| 特性 | 当前 Playwright | agent-browser |
|------|----------------|---------------|
| **架构** | Node.js 库 | Rust CLI + Node.js Daemon |
| **输出** | JSON/对象 | 紧凑文本（AI 优化） |
| **选择器** | CSS/XPath | Refs (`@e1`) + 语义定位 |
| **Token 消耗** | 高（完整 DOM） | 低（Accessibility Tree） |
| **会话管理** | 手动实现 | 内置 `--session` |
| **状态持久化** | 手动保存 Cookie | `--profile` / `--session-name` |
| **安全功能** | 无 | 域白名单、动作策略、加密 |
| **CDP 模式** | 支持 | 支持 + 自动发现 |
| **流式预览** | 需自行实现 | 内置 WebSocket 流 |

---

## 3️⃣ 能给项目带来的提升

### ✅ 优势领域

#### 1. AI 代理集成（最大优势）

**当前方式**：需要编写 TypeScript 代码

```typescript
const page = await context.newPage();
await page.goto('https://xiaohongshu.com');
const cards = await page.$$('.note-item');
```

**agent-browser 方式**：直接 CLI 调用

```bash
agent-browser open xiaohongshu.com
agent-browser snapshot -i
# 输出：- note-card "笔记标题" [ref=e1]
agent-browser click @e1
```

**提升**：
- ✅ OpenClaw 可直接调用，无需封装 API
- ✅ Token 消耗减少 **80-90%**
- ✅ 更适合 LLM 理解和操作

#### 2. 会话和状态管理

```bash
# 多账号管理（当前需手动实现）
agent-browser --session xiaohongshu-account1 open xiaohongshu.com
agent-browser --session xiaohongshu-account2 open xiaohongshu.com

# 状态持久化（自动保存 Cookie）
agent-browser --session-name xiaohongshu open xiaohongshu.com
# 下次自动恢复登录状态
```

**提升**：
- ✅ 简化多账号管理代码
- ✅ 自动处理 Cookie/LocalStorage
- ✅ 支持状态加密（`AGENT_BROWSER_ENCRYPTION_KEY`）

#### 3. 安全增强

```bash
# 域白名单（防止跳转到恶意网站）
agent-browser --allowed-domains "xiaohongshu.com,*.xiaohongshu.com" open ...

# 动作策略（限制危险操作）
agent-browser --action-policy ./policy.json ...

# 输出长度限制（防止上下文溢出）
agent-browser --max-output 50000 ...
```

**提升**：
- ✅ 防止 AI 代理被注入攻击
- ✅ 限制危险操作（eval、下载等）
- ✅ 控制输出大小，节省 Token

#### 4. 调试和可视化

```bash
# 带标注的截图（元素编号对应 ref）
agent-browser screenshot --annotate page.png
# 输出：[1] @e1 button "发布"

# 差异对比
agent-browser diff screenshot --baseline before.png

# 性能分析
agent-browser profiler start
# ... 操作 ...
agent-browser profiler stop profile.json
```

**提升**：
- ✅ 更直观的调试体验
- ✅ 可视化元素定位
- ✅ 性能瓶颈分析

#### 5. CDP 模式集成

```bash
# 连接现有 Chrome（可复用 Browserless）
agent-browser --cdp 9222 snapshot

# 自动发现运行中的 Chrome
agent-browser --auto-connect open xiaohongshu.com

# 远程浏览器（Browserbase/Kernel 等云服务）
export BROWSERBASE_API_KEY=xxx
agent-browser -p browserbase open xiaohongshu.com
```

**提升**：
- ✅ 复用现有 Browserless 投资
- ✅ 支持云浏览器服务
- ✅ 连接 Electron/WebView2 应用

---

### ⚠️ 劣势/限制

#### 1. 成熟度
- **当前**：Playwright 是成熟稳定的工业级方案
- **agent-browser**：v0.16.3（2026-03-04 发布），部分功能实验性

#### 2. 功能完整性
- ❌ 原生模式不支持 Firefox/WebKit（仅 Chromium/Safari）
- ❌ 部分 Playwright 高级功能缺失（HAR 导出、特定追踪格式）
- ❌ 社区生态较小

#### 3. 性能对比

| 场景 | Playwright | agent-browser |
|------|-----------|---------------|
| 首次启动 | ~2s | ~1s（Rust） |
| 命令解析 | ~50ms | <1ms |
| 页面操作 | 相同（都基于 Playwright/CDP） | 相同 |

---

## 4️⃣ 推荐实施方案

### 🎯 方案 A：混合架构（推荐）

**保留现有 Playwright 代码**，**新增 agent-browser 作为 AI 接口层**：

```typescript
// apps/server/src/services/browser-automation.ts
import { exec } from 'child_process';

export async function runAgentBrowser(commands: string[]) {
  const cmd = commands.join(' && ');
  return new Promise((resolve, reject) => {
    exec(`agent-browser ${cmd}`, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve({ output: stdout, error: stderr });
    });
  });
}

// 使用示例
await runAgentBrowser([
  'open https://xiaohongshu.com',
  'snapshot -i',
  'click @e1',
]);
```

**优势**：
- ✅ 不破坏现有代码
- ✅ OpenClaw 可直接调用 CLI
- ✅ 渐进式迁移

---

### 🎯 方案 B：CDP 模式集成

**使用 agent-browser 连接现有 Browserless**：

```bash
# content-publish-platform 继续使用 Playwright
# OpenClaw 使用 agent-browser 通过 CDP 控制同一浏览器

agent-browser --cdp ws://localhost:9222 snapshot
agent-browser --cdp ws://localhost:9222 click @e1
```

**修改 `playwright.ts`**：
```typescript
// 启用 CDP 调试端口
this.browser = await chromium.launch({
  headless: true,
  args: ['--remote-debugging-port=9222', ...],
});
```

**优势**：
- ✅ 复用现有浏览器实例
- ✅ OpenClaw 可直接介入控制
- ✅ 最小改动

---

### 🎯 方案 C：完全迁移（不推荐）

**用 agent-browser 替换 Playwright**：

```typescript
// 需要重写所有浏览器操作代码
// 风险高，收益有限
```

**劣势**：
- ❌ 大量代码重写
- ❌ 功能可能不完整
- ❌ 稳定性风险

---

## 5️⃣ 具体使用场景

### 场景 1：OpenClaw 直接控制浏览器

```bash
# OpenClaw 调用 agent-browser
curl http://127.0.0.1:18789/tools/invoke \
  -H 'Authorization: Bearer TOKEN' \
  -d '{
    "tool": "exec",
    "args": {
      "command": "agent-browser --session xiaohongshu open xiaohongshu.com && agent-browser snapshot -i"
    }
  }'
```

### 场景 2：AI 调试助手

```bash
# 发布失败时，AI 自动调试
agent-browser --profile xiaohongshu open xiaohongshu.com/publish
agent-browser screenshot --annotate error-debug.png
agent-browser console  # 查看控制台错误
```

### 场景 3：多账号轮询

```bash
# 每个账号独立会话
agent-browser --session account1 open xiaohongshu.com && ...
agent-browser --session account2 open xiaohongshu.com && ...
```

---

## 6️⃣ 实施建议

### 阶段 1：试验性集成（1-2 天）

```bash
# 安装 agent-browser
npm install -g agent-browser
agent-browser install

# 测试基本功能
agent-browser open xiaohongshu.com
agent-browser snapshot -i
```

### 阶段 2：OpenClaw 技能封装（2-3 天）

```markdown
# 创建 OpenClaw 技能
~/.openclaw/skills/agent-browser/SKILL.md

# 封装常用命令
- 打开页面
- 获取快照
- 点击/填写
- 截图
- 多账号管理
```

### 阶段 3：CDP 模式集成（可选，1-2 天）

```typescript
// 修改 playwright.ts 启用 CDP
// OpenClaw 可通过 CDP 直接控制
```

### 阶段 4：生产环境评估

- 稳定性测试
- 性能对比
- 决定全面迁移或混合使用

---

## 7️⃣ 常用命令参考

### 核心命令

```bash
# 导航
agent-browser open <url>

# 获取页面快照（AI 优化）
agent-browser snapshot                    # 完整 accessibility tree
agent-browser snapshot -i                 # 仅交互元素
agent-browser snapshot -i -C              # 包含可点击的 div/span

# 交互
agent-browser click @e1                   # 点击
agent-browser fill @e2 "text"             # 填写
agent-browser type @e3 "text"             # 打字
agent-browser press Enter                 # 按键

# 获取信息
agent-browser get text @e1                # 获取文本
agent-browser get html @e2                # 获取 HTML
agent-browser get url                     # 获取当前 URL
agent-browser get title                   # 获取标题

# 截图
agent-browser screenshot page.png         # 截图
agent-browser screenshot --annotate       # 带标注截图

# 等待
agent-browser wait 1000                   # 等待 1 秒
agent-browser wait --text "成功"          # 等待文本出现
agent-browser wait --load networkidle     # 等待网络空闲
```

### 会话管理

```bash
# 独立会话
agent-browser --session account1 open xiaohongshu.com
agent-browser --session account2 open xiaohongshu.com

# 状态持久化
agent-browser --session-name xiaohongshu open xiaohongshu.com

# 列出会话
agent-browser session list
```

### Cookie 和存储

```bash
# 获取 Cookie
agent-browser cookies

# 设置 Cookie
agent-browser cookies set name value

# 获取 localStorage
agent-browser storage local
agent-browser storage local set key value
```

### CDP 模式

```bash
# 连接本地 Chrome
agent-browser connect 9222

# 连接远程浏览器
agent-browser --cdp "wss://your-service.com/cdp?token=xxx" snapshot

# 自动发现 Chrome
agent-browser --auto-connect open xiaohongshu.com
```

### 安全选项

```bash
# 域白名单
agent-browser --allowed-domains "xiaohongshu.com,*.xiaohongshu.com"

# 输出限制
agent-browser --max-output 50000

# 动作确认
agent-browser --confirm-actions eval,download
```

---

## 8️⃣ 评估总结

| 维度 | 评分 | 说明 |
|------|------|------|
| **AI 集成友好度** | ⭐⭐⭐⭐⭐ | 核心优势 |
| **Token 效率** | ⭐⭐⭐⭐⭐ | 减少 80-90% |
| **功能完整性** | ⭐⭐⭐ | 不如 Playwright |
| **稳定性** | ⭐⭐⭐ | 较新，v0.16.3 |
| **迁移成本** | ⭐⭐ | 完全迁移成本高 |
| **混合使用** | ⭐⭐⭐⭐⭐ | 推荐方案 |

---

## 📋 结论

**推荐方案**：**混合架构** - 保留 Playwright 作为底层引擎，**新增 agent-browser 作为 AI 代理接口层**。

**最大价值**：让 OpenClaw 等 AI 代理能够**直接、高效、安全**地控制浏览器，无需封装复杂的 API。

**下一步行动**：
1. 安装 agent-browser 进行试验
2. 创建 OpenClaw 技能封装常用命令
3. 评估是否启用 CDP 模式集成

---

**文档维护者**: HT-PM 📋  
**最后更新**: 2026-03-07 10:31 CST
