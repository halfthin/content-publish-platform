<template>
  <div class="accounts">
    <div class="toolbar">
      <h2>👥 账号管理</h2>
      <el-button type="primary" @click="showAddDialog">+ 添加账号</el-button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select v-model="filterPlatform" placeholder="平台筛选" clearable @change="loadAccounts">
        <el-option label="小红书" value="xiaohongshu" />
        <el-option label="微博" value="weibo" />
        <el-option label="抖音" value="douyin" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态筛选" clearable @change="loadAccounts">
        <el-option label="已启用" value="ACTIVE" />
        <el-option label="已禁用" value="INACTIVE" />
      </el-select>
    </div>

    <!-- 账号列表 -->
    <el-table :data="accounts" v-loading="loading" stripe style="width: 100%">
      <el-table-column prop="platform" label="平台" width="100">
        <template #default="{ row }">
          <el-tag :type="getPlatformTagType(row.platform)">
            {{ getPlatformName(row.platform) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="账号名称" min-width="150" />
      <el-table-column prop="username" label="用户名" width="150" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">
            {{ row.status === 'ACTIVE' ? '已启用' : '已禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="loginStatus" label="登录状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getLoginStatusTagType(row.loginStatus)">
            {{ getLoginStatusName(row.loginStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="cookieUpdatedAt" label="Cookie 更新" width="160">
        <template #default="{ row }">
          {{ row.cookieUpdatedAt ? formatDate(row.cookieUpdatedAt) : '未配置' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="340" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editAccount(row)">编辑</el-button>
          <el-button size="small" @click="toggleStatus(row)">
            {{ row.status === 'ACTIVE' ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="primary" @click="goToCookieConfig(row)">
            Cookie
          </el-button>
          <el-button size="small" @click="showCallbackDialog(row)">回调</el-button>
          <el-button size="small" type="danger" @click="deleteAccount(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="callbackDialogVisible" title="检查登录回调详情" width="760px">
      <el-skeleton v-if="callbackLoading" :rows="6" animated />
      <template v-else-if="selectedAccountDetail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="账号名称">
            {{ selectedAccountDetail.name }}
          </el-descriptions-item>
          <el-descriptions-item label="平台">
            {{ getPlatformName(selectedAccountDetail.platform) }}
          </el-descriptions-item>
          <el-descriptions-item label="登录状态">
            {{ getLoginStatusName(selectedAccountDetail.loginStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="最近回调时间">
            {{
              selectedAccountDetail.lastCheckLoginCallback?.updatedAt
                ? formatDate(selectedAccountDetail.lastCheckLoginCallback.updatedAt)
                : '暂无'
            }}
          </el-descriptions-item>
          <el-descriptions-item label="最近任务 ID">
            {{ selectedAccountDetail.lastCheckLoginCallback?.taskId || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="callback-sections">
          <section class="callback-section">
            <div class="callback-section-title">原始 payload</div>
            <pre>{{ formatJson(selectedAccountDetail.lastCheckLoginCallback?.callbackPayload?.raw) }}</pre>
          </section>

          <section class="callback-section">
            <div class="callback-section-title">归一化 payload</div>
            <pre>
{{ formatJson(selectedAccountDetail.lastCheckLoginCallback?.callbackPayload?.normalized) }}
            </pre>
          </section>
        </div>
      </template>
      <el-empty v-else description="暂无回调记录" :image-size="72" />
    </el-dialog>

    <!-- 添加/编辑账号对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑账号' : '添加账号'"
      width="500px"
      @close="resetForm"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="平台" prop="platform">
          <el-select v-model="form.platform" placeholder="请选择平台" style="width: 100%">
            <el-option label="小红书" value="xiaohongshu" />
            <el-option label="微博" value="weibo" />
            <el-option label="抖音" value="douyin" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入账号名称" />
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名（可选）" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  type Account,
  type CreateAccountDto,
  createAccount as createAccountApi,
  deleteAccount as deleteAccountApi,
  getAccount as getAccountApi,
  getAccounts as getAccountsApi,
  toggleAccountStatus as toggleAccountStatusApi,
  type UpdateAccountDto,
  updateAccount as updateAccountApi,
} from '@/api/accounts';

const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const callbackDialogVisible = ref(false);
const callbackLoading = ref(false);
const formRef = ref<FormInstance>();

const filterPlatform = ref<string>('');
const filterStatus = ref<string>('');

const accounts = ref<Account[]>([]);
const selectedAccountDetail = ref<Account | null>(null);

const form = reactive<CreateAccountDto & { id?: string }>({
  name: '',
  platform: 'xiaohongshu',
  username: '',
  remark: '',
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入账号名称', trigger: 'blur' }],
  platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
};
void rules;

type LoginStatusTagType = 'success' | 'warning' | 'info';
type PlatformTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

// 加载账号列表
async function loadAccounts() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (filterPlatform.value) params.platform = filterPlatform.value;
    if (filterStatus.value) params.status = filterStatus.value;

    const result = await getAccountsApi(params);
    accounts.value = Array.isArray(result) ? result : [];
  } catch (error: unknown) {
    ElMessage.error(`加载账号列表失败：${getErrorMessage(error)}`);
  } finally {
    loading.value = false;
  }
}

// 显示添加对话框
function showAddDialog() {
  isEdit.value = false;
  dialogVisible.value = true;
}

// 编辑账号
function editAccount(account: Account) {
  isEdit.value = true;
  form.id = account.id;
  form.name = account.name;
  form.platform = account.platform;
  form.username = account.username || '';
  form.remark = account.remark || '';
  dialogVisible.value = true;
}

// 切换账号状态
async function toggleStatus(account: Account) {
  try {
    await ElMessageBox.confirm(
      `确定要${account.status === 'ACTIVE' ? '禁用' : '启用'}账号"${account.name}"吗？`,
      '确认操作',
      { type: 'warning' }
    );

    await toggleAccountStatusApi(account.id);
    ElMessage.success('操作成功');
    await loadAccounts();
  } catch (error: unknown) {
    if (error !== 'cancel') {
      ElMessage.error(`操作失败：${getErrorMessage(error)}`);
    }
  }
}

// 删除账号
async function deleteAccount(account: Account) {
  try {
    await ElMessageBox.confirm(`确定要删除账号"${account.name}"吗？此操作不可恢复！`, '删除确认', {
      type: 'error',
    });

    await deleteAccountApi(account.id);
    ElMessage.success('删除成功');
    await loadAccounts();
  } catch (error: unknown) {
    if (error !== 'cancel') {
      ElMessage.error(`删除失败：${getErrorMessage(error)}`);
    }
  }
}

// 跳转到 Cookie 配置页面
function goToCookieConfig(account: Account) {
  router.push(`/cookie-config?accountId=${account.id}`);
}

async function showCallbackDialog(account: Account) {
  callbackDialogVisible.value = true;
  callbackLoading.value = true;

  try {
    selectedAccountDetail.value = await getAccountApi(account.id);
  } catch (error: unknown) {
    ElMessage.error(`加载账号回调详情失败：${getErrorMessage(error)}`);
    selectedAccountDetail.value = {
      ...account,
      lastCheckLoginCallback: null,
    };
  } finally {
    callbackLoading.value = false;
  }
}

// 提交表单
async function submitForm() {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      if (isEdit.value && form.id) {
        const data: UpdateAccountDto = {
          name: form.name,
          platform: form.platform,
          username: form.username,
          remark: form.remark,
        };
        await updateAccountApi(form.id, data);
        ElMessage.success('更新成功');
      } else {
        await createAccountApi(form as CreateAccountDto);
        ElMessage.success('创建成功');
      }

      dialogVisible.value = false;
      await loadAccounts();
    } catch (error: unknown) {
      ElMessage.error(`${isEdit.value ? '更新' : '创建'}失败：${getErrorMessage(error)}`);
    } finally {
      submitting.value = false;
    }
  });
}

// 重置表单
function resetForm() {
  form.id = undefined;
  form.name = '';
  form.platform = 'xiaohongshu';
  form.username = '';
  form.remark = '';
  formRef.value?.resetFields();
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

function getPlatformTagType(platform: string): PlatformTagType {
  const map: Record<string, PlatformTagType> = {
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

function getLoginStatusTagType(status: string): LoginStatusTagType {
  const map: Record<string, LoginStatusTagType> = {
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

function formatJson(value: unknown): string {
  if (!value) {
    return '暂无数据';
  }

  return JSON.stringify(value, null, 2);
}

void [
  showAddDialog,
  editAccount,
  toggleStatus,
  deleteAccount,
  goToCookieConfig,
  showCallbackDialog,
  submitForm,
  resetForm,
  getPlatformName,
  getPlatformTagType,
  getLoginStatusName,
  getLoginStatusTagType,
  formatDate,
  formatJson,
];

onMounted(() => {
  loadAccounts();
});
</script>

<style scoped>
.accounts {
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.toolbar h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #1f2937;
}

.filter-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.filter-bar .el-select {
  width: 160px;
}

.callback-sections {
  margin-top: 16px;
  display: grid;
  gap: 16px;
}

.callback-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.callback-section-title {
  font-weight: 600;
  color: #303133;
}

.callback-section pre {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  max-height: 320px;
}
</style>
