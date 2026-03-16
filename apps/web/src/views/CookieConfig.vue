<template>
  <div class="cookie-config">
    <div class="header">
      <el-button type="text" @click="goBack" class="back-btn">← 返回</el-button>
      <h2>🍪 Cookie 配置</h2>
    </div>

    <el-card class="config-card">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item label="选择账号" prop="accountId">
          <el-select
            v-model="form.accountId"
            placeholder="请选择账号"
            style="width: 100%"
            @change="onAccountChange"
            :disabled="!!accountIdFromQuery"
          >
            <el-option
              v-for="acc in accounts"
              :key="acc.id"
              :label="`${acc.name} (${getPlatformName(acc.platform)})`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Cookie JSON" prop="cookieJson">
          <el-input
            v-model="form.cookieJson"
            type="textarea"
            :rows="12"
            placeholder='[{"name": "SUB", "value": "...", "domain": ".xiaohongshu.com"}]'
          />
          <div class="form-tip">
            请输入 Cookie 数组的 JSON 格式，可以从浏览器开发者工具复制
          </div>
        </el-form-item>

        <el-form-item label="加密密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="设置加密密码（可选，默认使用环境变量）"
            show-password
          />
          <div class="form-tip">
            Cookie 将使用此密码加密存储，请妥善保管
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveCookie" :loading="saving">
            💾 保存配置
          </el-button>
          <el-button @click="testCookie" :loading="testing">
            🔍 测试连接
          </el-button>
          <el-button type="danger" @click="deleteCookie" :loading="deleting">
            🗑️ 删除 Cookie
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 当前账号信息 -->
    <el-card v-if="currentAccount" class="info-card">
      <template #header>
        <div class="card-header">
          <span>📊 账号信息</span>
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="账号名称">{{ currentAccount.name }}</el-descriptions-item>
        <el-descriptions-item label="平台">
          <el-tag :type="getPlatformTagType(currentAccount.platform)">
            {{ getPlatformName(currentAccount.platform) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="用户名">{{ currentAccount.username || '-' }}</el-descriptions-item>
        <el-descriptions-item label="登录状态">
          <el-tag :type="getLoginStatusTagType(currentAccount.loginStatus)">
            {{ getLoginStatusName(currentAccount.loginStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Cookie 更新时间">
          {{ currentAccount.cookieUpdatedAt ? formatDate(currentAccount.cookieUpdatedAt) : '未配置' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="currentAccount.status === 'active' ? 'success' : 'info'">
            {{ currentAccount.status === 'active' ? '已启用' : '已禁用' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 测试结果显示 -->
    <el-alert
      v-if="testResult"
      :title="testResult.isLoggedIn ? '✅ Cookie 验证成功' : '❌ Cookie 验证失败'"
      :type="testResult.isLoggedIn ? 'success' : 'error'"
      show-icon
      class="test-result"
    >
      <template #default>
        <div v-if="testResult">
          <p>验证时间：{{ formatDate(testResult.verifiedAt) }}</p>
          <p>平台：{{ getPlatformName(testResult.platform) }}</p>
          <p>登录状态：{{ testResult.isLoggedIn ? '已登录' : '未登录' }}</p>
        </div>
      </template>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import {
  getAccounts as getAccountsApi,
  getAccount as getAccountApi,
  saveCookie as saveCookieApi,
  verifyCookie as verifyCookieApi,
  deleteCookie as deleteCookieApi,
  type Account,
} from '@/api/accounts';

const route = useRoute();
const router = useRouter();

const saving = ref(false);
const testing = ref(false);
const deleting = ref(false);
const formRef = ref<FormInstance>();

const accounts = ref<Account[]>([]);
const currentAccount = ref<Account | null>(null);
const testResult = ref<{
  isLoggedIn: boolean;
  verifiedAt: string;
  platform: string;
} | null>(null);

const accountIdFromQuery = computed(() => route.query.accountId as string);

const form = reactive({
  accountId: '',
  cookieJson: '',
  password: '',
});

const rules: FormRules = {
  accountId: [{ required: true, message: '请选择账号', trigger: 'change' }],
  cookieJson: [
    { required: true, message: '请输入 Cookie JSON', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) {
            callback(new Error('Cookie 必须是数组格式'));
          } else if (parsed.length === 0) {
            callback(new Error('Cookie 数组不能为空'));
          } else {
            callback();
          }
        } catch {
          callback(new Error('无效的 JSON 格式'));
        }
      },
      trigger: 'blur',
    },
  ],
};

// 加载账号列表
async function loadAccounts() {
  try {
    const result = await getAccountsApi();
    accounts.value = (result as any[]) || [];

    // 如果有 query 参数，自动选择账号
    if (accountIdFromQuery.value) {
      form.accountId = accountIdFromQuery.value;
      await onAccountChange();
    }
  } catch (error: any) {
    ElMessage.error('加载账号列表失败：' + (error.message || '未知错误'));
  }
}

// 账号变化时加载详情
async function onAccountChange() {
  if (!form.accountId) {
    currentAccount.value = null;
    form.cookieJson = '';
    return;
  }

  try {
    const result = await getAccountApi(form.accountId);
    currentAccount.value = result as any;
    testResult.value = null;
  } catch (error: any) {
    ElMessage.error('加载账号详情失败：' + (error.message || '未知错误'));
  }
}

// 保存 Cookie
async function saveCookie() {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    saving.value = true;
    try {
      let cookies: any[];
      try {
        cookies = JSON.parse(form.cookieJson);
      } catch {
        ElMessage.error('Cookie JSON 格式无效');
        return;
      }

      await saveCookieApi(form.accountId, {
        cookies,
        password: form.password || undefined,
      });

      ElMessage.success('Cookie 保存成功');
      await onAccountChange();
    } catch (error: any) {
      ElMessage.error('保存失败：' + (error.message || '未知错误'));
    } finally {
      saving.value = false;
    }
  });
}

// 测试 Cookie
async function testCookie() {
  if (!form.accountId) {
    ElMessage.warning('请先选择账号');
    return;
  }

  testing.value = true;
  try {
    const result = await verifyCookieApi(form.accountId, form.password || undefined);
    const testData = (result as any).data || result;
    testResult.value = testData;

    if (testData.isLoggedIn) {
      ElMessage.success('Cookie 验证成功，账号已登录');
    } else {
      ElMessage.warning('Cookie 验证失败，账号未登录或已过期');
    }

    await onAccountChange();
  } catch (error: any) {
    ElMessage.error('测试失败：' + (error.message || '未知错误'));
  } finally {
    testing.value = false;
  }
}

// 删除 Cookie
async function deleteCookie() {
  if (!form.accountId) {
    ElMessage.warning('请先选择账号');
    return;
  }

  try {
    await ElMessageBox.confirm('确定要删除此账号的 Cookie 吗？', '删除确认', { type: 'warning' });

    deleting.value = true;
    await deleteCookieApi(form.accountId);
    ElMessage.success('Cookie 删除成功');
    testResult.value = null;
    await onAccountChange();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败：' + (error.message || '未知错误'));
    }
  } finally {
    deleting.value = false;
  }
}

// 返回
function goBack() {
  router.back();
}

// 工具函数
function getPlatformName(platform: string): string {
  const map: Record<string, string> = {
    xiaohongshu: '小红书',
    weibo: '微博',
    douyin: '抖音',
  };
  return map[platform] || platform;
}

function getPlatformTagType(platform: string): 'primary' | 'success' | 'warning' | 'danger' {
  const map: Record<string, any> = {
    xiaohongshu: 'danger',
    weibo: 'warning',
    douyin: 'primary',
  };
  return map[platform] || 'info';
}

function getLoginStatusName(status: string): string {
  const map: Record<string, string> = {
    LOGGED_IN: '已登录',
    EXPIRED: '已过期',
    UNKNOWN: '未知',
  };
  return map[status] || status;
}

function getLoginStatusTagType(status: string): 'success' | 'warning' | 'info' {
  const map: Record<string, any> = {
    LOGGED_IN: 'success',
    EXPIRED: 'warning',
    UNKNOWN: 'info',
  };
  return map[status] || 'info';
}

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(() => {
  loadAccounts();
});
</script>

<style scoped>
.cookie-config {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #1f2937;
}

.back-btn {
  font-size: 1rem;
  padding: 8px 12px;
}

.config-card,
.info-card {
  margin-bottom: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.form-tip {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  line-height: 1.5;
}

.card-header {
  font-weight: 600;
  font-size: 1rem;
}

.test-result {
  margin-top: 20px;
}

:deep(.el-descriptions__label) {
  font-weight: 500;
}
</style>
