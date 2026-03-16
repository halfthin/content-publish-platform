# Cookie自动刷新功能实现指南

**创建日期**: 2026-03-08  
**分配对象**: HT-Fish 🐟  
**项目经理**: HT-PM 📋  
**优先级**: P0 (高)

## 🎯 任务概述 - 小红书优先策略

**策略调整**: 2026-03-08 12:25  
**调整内容**: 专注于小红书相关功能，微博和抖音功能延后

### 方案A: 发布后自动保存Cookie（被动更新）
- **时机**: 每次成功发布后自动保存
- **状态**: ✅ **小红书核心逻辑已实现** (HT-PM)
- **范围**: 仅限小红书平台，微博/抖音延后

### 方案B: 定时主动刷新Cookie（主动维护）
- **时机**: 每天定时检查Cookie健康度
- **状态**: ⏳ **待实现** (HT-Fish负责)
- **范围**: 仅限小红书平台，微博/抖音延后

## 📋 已完成工作 (HT-PM)

### 1. 方案A核心实现
**文件**: `apps/server/src/queues/publish-queue.ts`

#### 新增功能:
1. **通用保存方法** `saveCookiesAfterPublish()`
   ```typescript
   private async saveCookiesAfterPublish(
     publisher: any,
     accountId: string,
     password: string
   ): Promise<void>
   ```

2. **小红书任务增强**
   - 在`processXiaohongshuJob()`的`finally`块中添加保存逻辑
   - 发布后自动保存更新后的Cookie到数据库

3. **微博任务增强**
   - 在`processWeiboJob()`的`finally`块中添加保存逻辑

4. **抖音任务增强**
   - 在`processDouyinJob()`的`finally`块中添加保存逻辑

#### 关键特性:
- ✅ 错误隔离: 保存失败不影响主要发布流程
- ✅ 日志记录: 详细的成功/失败日志
- ✅ 向后兼容: 不影响现有功能

## 🚀 待完成工作 (HT-Fish)

### 阶段一: 完善方案A (预计: 2-3小时)

#### 1. 验证现有实现
```bash
# 1. 检查代码编译
cd ~/dev/content-publish-platform/apps/server
bun run build

# 2. 运行单元测试
bun test src/queues/publish-queue.test.ts

# 3. 验证类型检查
bun run type-check
```

#### 2. 添加缺失的saveCookies方法
**问题**: 微博和抖音发布器可能没有`saveCookies`方法

**解决方案**:
```typescript
// 在 WeiboPublisher 和 DouyinPublisher 中添加
async saveCookies(password: string): Promise<string> {
  if (!this.context) {
    throw new Error('Browser context not initialized');
  }
  
  const cookies = await this.context.cookies();
  return encryptCookies(cookies, password);
}
```

#### 3. 创建测试用例
```typescript
// 测试发布后保存Cookie的功能
describe('Cookie auto-save after publish', () => {
  it('should save cookies after xiaohongshu publish', async () => {
    // 测试逻辑
  });
  
  it('should handle save failure gracefully', async () => {
    // 错误处理测试
  });
});
```

### 阶段二: 实现方案B (预计: 3-4小时)

#### 1. 创建CookieRefreshService
**文件**: `apps/server/src/services/cookie-refresh.service.ts`

```typescript
export class CookieRefreshService {
  private logger = createLogger('cookie-refresh');
  
  constructor(
    private cronExpression = '0 2 * * *', // 每天凌晨2点
    private healthThreshold = 70 // 健康度阈值
  ) {}
  
  async start(): Promise<void> {
    // 启动定时任务
  }
  
  async checkAllAccounts(): Promise<void> {
    // 检查所有账号的Cookie健康度
  }
  
  async refreshAccountCookies(accountId: string): Promise<boolean> {
    // 刷新单个账号的Cookie
  }
  
  async notifyManualRefresh(account: Account): Promise<void> {
    // 通知需要人工介入
  }
}
```

#### 2. 数据库Schema更新
**文件**: `apps/server/prisma/schema.prisma`

```prisma
model Account {
  // 现有字段...
  encryptedCookies   String?
  cookiePassword     String?
  cookieUpdatedAt    DateTime?
  
  // 新增字段
  cookieHealthScore  Int?       @default(100)  // 0-100分
  lastCookieCheckAt  DateTime?                 // 最后检查时间
  cookieExpiryWarning Boolean?  @default(false) // 过期预警
  cookieRefreshAttempts Int?    @default(0)    // 刷新尝试次数
  cookieLastRefreshAt DateTime?                // 最后刷新时间
}
```

**迁移命令**:
```bash
cd apps/server
bunx prisma migrate dev --name add_cookie_health_fields
```

#### 3. 健康度评估算法
```typescript
interface CookieHealthMetrics {
  ageScore: number;          // Cookie年龄 (0-30分)
  usageScore: number;        // 使用频率 (0-30分)
  successRateScore: number;  // 发布成功率 (0-40分)
  totalScore: number;        // 总分 (0-100分)
}

class CookieHealthEvaluator {
  evaluate(account: Account, publishLogs: PublishLog[]): CookieHealthMetrics {
    // 实现健康度评估逻辑
  }
}
```

### 阶段三: 前端集成 (预计: 3-5小时)

#### 1. 账号健康度显示
**文件**: `apps/web/src/views/Accounts.vue`

```vue
<template>
  <el-table-column label="健康度" width="120">
    <template #default="{ row }">
      <el-tag :type="getHealthTagType(row.cookieHealthScore)">
        {{ row.cookieHealthScore }}分
      </el-tag>
    </template>
  </el-table-column>
  
  <el-table-column label="最后检查" width="150">
    <template #default="{ row }">
      {{ formatDate(row.lastCookieCheckAt) }}
      <el-tooltip v-if="row.cookieExpiryWarning" content="Cookie即将过期，建议刷新">
        <el-icon><Warning /></el-icon>
      </el-tooltip>
    </template>
  </el-table-column>
</template>
```

#### 2. 健康度仪表盘
**文件**: `apps/web/src/components/AccountHealthDashboard.vue`

功能:
- ✅ 整体健康度统计
- ✅ 即将过期账号列表
- ✅ 一键刷新按钮
- ✅ 健康趋势图表

#### 3. 通知系统集成
```typescript
// WebSocket通知
interface CookieHealthNotification {
  type: 'WARNING' | 'CRITICAL' | 'EXPIRED';
  accountId: string;
  accountName: string;
  healthScore: number;
  message: string;
  actionUrl?: string;
}

// 邮件/消息通知模板
const notificationTemplates = {
  WARNING: '账号 {name} 的Cookie健康度较低 ({score}分)，建议检查',
  CRITICAL: '⚠️ 账号 {name} 的Cookie即将过期，请立即刷新',
  EXPIRED: '❌ 账号 {name} 的Cookie已过期，发布功能已禁用'
};
```

## 🔧 技术实现细节

### 1. 加密安全
```typescript
// 使用AES-256-GCM加密
import { encryptCookies, decryptCookies } from '../utils/encryption';

// 保存时加密
const encrypted = await encryptCookies(cookies, password);

// 使用时解密
const decrypted = await decryptCookies(encrypted, password);
```

### 2. 错误处理策略
```typescript
class CookieRefreshError extends Error {
  constructor(
    message: string,
    public code: 'EXPIRED' | 'INVALID' | 'NETWORK' | 'CAPTCHA',
    public accountId: string
  ) {
    super(message);
  }
}

// 指数退避重试
const retryWithBackoff = async (
  operation: () => Promise<any>,
  maxRetries = 3
): Promise<any> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // 1s, 2s, 4s
    }
  }
};
```

### 3. 性能优化
```typescript
// 批量处理
async function refreshCookiesInBatch(
  accounts: Account[],
  batchSize = 5
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(account => this.refreshAccountCookies(account.id))
    );
    results.push(...batchResults);
    
    // 批次间延迟，避免请求过于密集
    if (i + batchSize < accounts.length) {
      await sleep(1000);
    }
  }
  
  return results;
}
```

## 📊 测试计划

### 单元测试
```bash
# 运行所有相关测试
bun test src/services/cookie-refresh.service.test.ts
bun test src/queues/publish-queue.cookie.test.ts
```

### 集成测试
```typescript
describe('End-to-end cookie refresh flow', () => {
  it('should complete full cookie lifecycle', async () => {
    // 1. 初始Cookie设置
    // 2. 发布内容（触发方案A）
    // 3. 定时检查（触发方案B）
    // 4. 健康度评估
    // 5. 过期处理
  });
});
```

### 性能测试
```typescript
// 模拟大量账号的Cookie刷新
test('should handle 100 accounts efficiently', async () => {
  const startTime = Date.now();
  await refreshService.checkAllAccounts();
  const duration = Date.now() - startTime;
  
  expect(duration).toBeLessThan(300000); // 5分钟以内
});
```

## 📝 部署说明

### 1. 环境变量配置
```bash
# .env 新增配置
COOKIE_HEALTH_CHECK_CRON="0 2 * * *"
COOKIE_HEALTH_THRESHOLD=70
COOKIE_REFRESH_MAX_ATTEMPTS=3
COOKIE_EXPIRY_WARNING_DAYS=3
```

### 2. 服务启动
```typescript
// 在应用启动时初始化
const cookieRefreshService = new CookieRefreshService();
cookieRefreshService.start();

// 优雅关闭
process.on('SIGTERM', async () => {
  await cookieRefreshService.stop();
});
```

### 3. 监控指标
```prometheus
# Prometheus指标
cookie_health_score{account="*"}
cookie_refresh_attempts_total
cookie_refresh_success_rate
cookie_expiry_warnings_total
```

## 🎯 验收标准

### 功能验收
- [ ] 发布后Cookie自动保存到数据库
- [ ] 定时任务能检测Cookie健康度
- [ ] 前端显示账号健康状态
- [ ] 过期提醒功能正常
- [ ] 完整的错误处理和日志

### 性能验收
- [ ] 100个账号的健康检查在5分钟内完成
- [ ] 内存使用稳定，无内存泄漏
- [ ] 数据库查询优化，无慢查询

### 安全验收
- [ ] Cookie加密存储，无明文泄露风险
- [ ] 访问控制，防止未授权刷新
- [ ] 请求频率限制，防止滥用

## 📅 时间安排

| 阶段 | 任务 | 预计工时 | 负责人 | 截止时间 |
|------|------|----------|--------|----------|
| 阶段一 | 完善方案A | 2-3小时 | HT-Fish | 2026-03-08 |
| 阶段二 | 实现方案B | 3-4小时 | HT-Fish | 2026-03-09 |
| 阶段三 | 前端集成 | 3-5小时 | HT-Fish | 2026-03-10 |
| 测试 | 完整测试 | 2小时 | HT-Testor | 2026-03-11 |
| 部署 | 生产部署 | 1小时 | HT-OM | 2026-03-12 |

## 🔗 相关资源

### 代码文件
1. `apps/server/src/queues/publish-queue.ts` - 方案A核心
2. `apps/server/src/services/cookie-refresh.service.ts` - 方案B核心
3. `apps/server/prisma/schema.prisma` - 数据库Schema
4. `apps/web/src/views/Accounts.vue` - 前端集成

### 文档参考
1. `docs/TECHNICAL_SPEC.md` - 技术规范
2. `docs/API_DOCUMENTATION.md` - API文档
3. `docs/DEPLOYMENT_GUIDE.md` - 部署指南

### 测试文件
1. `tests/cookie-refresh.e2e.test.ts` - 端到端测试
2. `tests/cookie-health.test.ts` - 健康度测试
3. `tests/performance/cookie-refresh.perf.test.ts` - 性能测试

## 📞 沟通机制

### 每日站会
- **时间**: 每天 10:00
- **内容**: 进度汇报、问题讨论、下一步计划

### 问题上报
1. **技术问题**: 直接向HT-PM汇报
2. **需求变更**: 记录到`docs/CHANGELOG.md`
3. **阻塞问题**: 立即沟通，寻求协助

### 代码审查
- **审查人**: HT-PM + HT-Master
- **标准**: 代码质量、安全性、性能
- **工具**: GitHub PR / 本地审查

---

## 🚨 紧急联系人

| 角色 | 负责人 | 联系方式 | 职责 |
|------|--------|----------|------|
| 项目经理 | HT-PM | 本会话 | 任务分配、进度跟踪 |
| 技术指导 | HT-Master | 待上线 | 技术方案审核 |
| 测试验证 | HT-Testor | 待上线 | 功能测试验证 |
| 运维部署 | HT-OM | 待上线 | 生产环境部署 |

---

**最后更新**: 2026-03-08  
**文档状态**: ✅ 方案A部分完成，方案B待实现  
**下一步**: HT-Fish开始执行阶段一任务

> **HT-Fish注意**: 请按照本指南逐步执行，每完成一个阶段立即向HT-PM汇报。遇到任何问题不要犹豫，立即沟通！ 🐟