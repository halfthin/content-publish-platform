<template>
  <div class="media-actions-page">
    <div class="page-header">
      <h2>动作管理</h2>
      <el-button link @click="refresh">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <!-- 统计 -->
    <div class="stats-bar">
      <el-statistic title="总数" :value="store.actions.length" />
      <el-statistic title="成功" :value="successCount" />
      <el-statistic title="失败" :value="failedCount" />
      <el-statistic title="进行中" :value="runningCount" />
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-select v-model="statusFilter" placeholder="状态筛选" clearable style="width: 150px">
        <el-option label="全部" value="" />
        <el-option label="QUEUED" value="QUEUED" />
        <el-option label="DISPATCHING" value="DISPATCHING" />
        <el-option label="DISPATCHED" value="DISPATCHED" />
        <el-option label="RUNNING" value="RUNNING" />
        <el-option label="NEEDS_AUTH" value="NEEDS_AUTH" />
        <el-option label="SUCCESS" value="SUCCESS" />
        <el-option label="FAILED" value="FAILED" />
      </el-select>
    </div>

    <!-- 动作列表 -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="filteredActions.length === 0" class="empty">
      <el-empty description="暂无动作记录" />
    </div>
    <div v-else class="action-list">
      <div
        v-for="action in filteredActions"
        :key="action.id"
        class="action-card"
        @click="openDetail(action)"
      >
        <div class="action-card-header">
          <strong>{{ getActionLabel(action.actionType) }}</strong>
          <el-tag :type="getStatusType(action.status)" size="small">{{ action.status }}</el-tag>
        </div>
        <div class="action-card-thumbs">
          <img
            v-for="asset in action.assets.slice(0, 4)"
            :key="asset.assetKey"
            :src="getMediaThumbUrl(asset.assetKey)"
            class="action-card-thumb"
            alt="ref"
          />
          <span v-if="action.assets.length > 4" class="action-card-thumb-more">+{{ action.assets.length - 4 }}</span>
        </div>
        <div class="action-card-meta">
          {{ formatDateTime(action.createdAt) }} · {{ action.operator || '' }}
        </div>
        <div v-if="action.operator" class="action-card-detail">操作人：{{ action.operator }}</div>
        <div v-if="action.externalTaskId" class="action-card-detail">
          外部任务：{{ action.externalTaskId }}
        </div>
        <div v-if="action.error" class="action-card-error">{{ action.error }}</div>
        <div class="action-card-actions">
          <el-button
            v-if="['FAILED', 'NEEDS_AUTH', 'SUCCESS'].includes(action.status)"
            type="warning"
            size="small"
            @click.stop="retryAction(action.id)"
          >
            重试
          </el-button>
          <el-button
            type="danger"
            size="small"
            @click.stop="deleteAction(action.id)"
          >
            删除
          </el-button>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="动作详情" width="700px" style="max-height:80vh;overflow-y:auto">
      <div v-if="currentAction" class="action-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="动作类型">{{ getActionLabel(currentAction.actionType) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(currentAction.status)" size="small">{{ currentAction.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(currentAction.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDateTime(currentAction.updatedAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="currentAction.operator" label="操作人">{{ currentAction.operator }}</el-descriptions-item>
          <el-descriptions-item v-if="currentAction.externalTaskId" label="外部任务ID" :span="2">
            {{ currentAction.externalTaskId }}
          </el-descriptions-item>
          <el-descriptions-item v-if="currentAction.error" label="错误信息" :span="2">
            <div class="error-text">{{ currentAction.error }}</div>
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px">关联图片 ({{ currentAction.assets.length }})</h4>
        <div class="detail-assets">
          <img
            v-for="asset in currentAction.assets"
            :key="asset.assetKey"
            :src="getMediaThumbUrl(asset.assetKey)"
            :alt="asset.filename"
            class="detail-asset-thumb"
          />
        </div>

        <template v-if="currentAction.formData && Object.keys(currentAction.formData).length > 0">
          <h4 style="margin-top: 20px">表单数据</h4>
          <pre class="callback-payload">{{ JSON.stringify(currentAction.formData, null, 2) }}</pre>
        </template>

        <template v-if="currentAction.context">
          <h4 style="margin-top: 20px">上下文</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item v-if="currentAction.context.workspaceDatePath" label="工作区日期">
              {{ currentAction.context.workspaceDatePath }}
            </el-descriptions-item>
            <el-descriptions-item v-if="currentAction.context.favoritePaths?.length" label="收藏路径" :span="2">
              <span v-for="p in currentAction.context.favoritePaths" :key="p" style="margin-right: 8px">
                <el-tag size="small">{{ p }}</el-tag>
              </span>
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <template v-if="currentAction.callbackPayload">
          <h4 style="margin-top: 20px">回调结果</h4>
          <pre class="callback-payload">{{ JSON.stringify(currentAction.callbackPayload, null, 2) }}</pre>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="currentAction && ['FAILED', 'NEEDS_AUTH', 'SUCCESS'].includes(currentAction.status)"
          type="warning"
          :loading="retrying"
          @click="retryCurrentAction"
        >
          重试
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, ref, watch } from 'vue';
import {
  deleteMediaAction,
  getMediaAction,
  getMediaThumbUrl,
  type MediaActionSummary,
  retryMediaAction,
} from '@/api/media';
import { useMediaActionsStore } from '@/stores/media-actions.store';

const store = useMediaActionsStore();
const loading = ref(false);
const statusFilter = ref('');
const detailVisible = ref(false);
const currentAction = ref<MediaActionSummary | null>(null);
const retrying = ref(false);

const filteredActions = computed(() => {
  if (!statusFilter.value) return store.actions;
  return store.actions.filter((a) => a.status === statusFilter.value);
});

const successCount = computed(() => store.actions.filter((a) => a.status === 'SUCCESS').length);
const failedCount = computed(() => store.actions.filter((a) => a.status === 'FAILED').length);
const runningCount = computed(
  () =>
    store.actions.filter((a) =>
      ['QUEUED', 'DISPATCHING', 'DISPATCHED', 'RUNNING', 'NEEDS_AUTH'].includes(a.status)
    ).length
);

function getActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    'wx-work-post': '企业微信群发',
    'wechat-article': '公众号文章',
    'image-to-image': '图生图',
  };
  return labels[actionType] || actionType;
}

function getStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    QUEUED: 'info',
    DISPATCHING: 'warning',
    DISPATCHED: 'warning',
    RUNNING: 'warning',
    NEEDS_AUTH: 'warning',
    SUCCESS: 'success',
    FAILED: 'danger',
  };
  return map[status] || '';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function refresh() {
  loading.value = true;
  try {
    await store.fetchActions(100);
  } catch (err) {
    ElMessage.error('加载失败');
  } finally {
    loading.value = false;
  }
}

async function openDetail(action: MediaActionSummary) {
  try {
    currentAction.value = await getMediaAction(action.id);
    detailVisible.value = true;
  } catch (err) {
    ElMessage.error('加载详情失败');
  }
}

async function retryCurrentAction() {
  if (!currentAction.value) return;
  retrying.value = true;
  try {
    currentAction.value = await retryMediaAction(currentAction.value.id);
    await refresh();
    ElMessage.success('重试成功');
  } catch (err) {
    ElMessage.error('重试失败');
  } finally {
    retrying.value = false;
  }
}

async function retryAction(id: string) {
  try {
    await retryMediaAction(id);
    await refresh();
    ElMessage.success('重试成功');
  } catch (err) {
    ElMessage.error('重试失败');
  }
}

async function deleteAction(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除这个动作吗？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await deleteMediaAction(id);
    await refresh();
    ElMessage.success('删除成功');
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
}

// 当 store.actions 中的项目被 WebSocket 更新时，同步到 currentAction
watch(
  () => store.actions,
  (newActions) => {
    if (!currentAction.value) return;
    const updated = newActions.find((a) => a.id === currentAction.value?.id);
    if (updated) {
      currentAction.value = updated;
    }
  },
  { deep: true }
);

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.media-actions-page {
  max-width: 1200px;
  overflow-y: auto;
  max-height: calc(100vh - 60px);
  padding: 20px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.stats-bar {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.filter-bar {
  margin-bottom: 16px;
}

.loading,
.empty {
  text-align: center;
  padding: 40px;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.action-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.action-card-thumbs {
  display: flex;
  gap: 4px;
  margin: 6px 0;
  align-items: center;
}
.action-card-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}
.action-card-thumb-more {
  font-size: 11px;
  color: #909399;
  padding-left: 2px;
}

.action-card-detail {
  font-size: 12px;
  color: #64748b;
}

.action-card-error {
  font-size: 12px;
  color: #f56c6c;
  margin-top: 4px;
}

.action-card-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.action-detail {
  padding: 8px 0;
  overflow-y: auto;
  max-height: 60vh;
}

.action-detail .error-text {
  color: #f56c6c;
  word-break: break-all;
}

.detail-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.detail-asset-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.callback-payload {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
}
</style>
