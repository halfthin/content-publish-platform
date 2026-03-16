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
        <el-option label="已启用" value="active" />
        <el-option label="已禁用" value="inactive" />
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
          <el-tag :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '已启用' : '已禁用' }}
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
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editAccount(row)">编辑</el-button>
          <el-button size="small" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="primary" @click="goToCookieConfig(row)">
            Cookie
          </el-button>
          <el-button size="small" type="danger" @click="deleteAccount(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

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
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import {
  getAccounts as getAccountsApi,
  createAccount as createAccountApi,
  updateAccount as updateAccountApi,
  deleteAccount as deleteAccountApi,
  toggleAccountStatus as toggleAccountStatusApi,
  type Account,
  type CreateAccountDto,
  type UpdateAccountDto,
} from '@/api/accounts';

const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const formRef = ref<FormInstance>();

const filterPlatform = ref<string>('');
const filterStatus = ref<string>('');

const accounts = ref<Account[]>([]);

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

// 加载账号列表
async function loadAccounts() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (filterPlatform.value) params.platform = filterPlatform.value;
    if (filterStatus.value) params.status = filterStatus.value;

    const result = await getAccountsApi(params);
    accounts.value = (result as any) || [];
  } catch (error: any) {
    ElMessage.error('加载账号列表失败：' + (error.message || '未知错误'));
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
      `确定要${account.status === 'active' ? '禁用' : '启用'}账号"${account.name}"吗？`,
      '确认操作',
      { type: 'warning' }
    );

    await toggleAccountStatusApi(account.id);
    ElMessage.success('操作成功');
    await loadAccounts();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败：' + (error.message || '未知错误'));
    }
  }
}

// 删除账号
async function deleteAccount(account: Account) {
  try {
    await ElMessageBox.confirm(
      `确定要删除账号"${account.name}"吗？此操作不可恢复！`,
      '删除确认',
      { type: 'error' }
    );

    await deleteAccountApi(account.id);
    ElMessage.success('删除成功');
    await loadAccounts();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败：' + (error.message || '未知错误'));
    }
  }
}

// 跳转到 Cookie 配置页面
function goToCookieConfig(account: Account) {
  router.push(`/cookie-config?accountId=${account.id}`);
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
    } catch (error: any) {
      ElMessage.error((isEdit.value ? '更新' : '创建') + '失败：' + (error.message || '未知错误'));
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
</style>
