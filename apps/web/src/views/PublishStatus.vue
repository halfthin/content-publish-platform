<template>
  <div class="publish-status-page">
    <div class="page-header">
      <h2>📊 发布状态</h2>
      <div class="header-actions">
        <el-button type="primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-cards">
      <el-card shadow="hover">
        <div class="stat-card">
          <div class="stat-icon today">📅</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.today }}</div>
            <div class="stat-label">今日发布</div>
          </div>
        </div>
      </el-card>
      <el-card shadow="hover">
        <div class="stat-card">
          <div class="stat-icon week">📆</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.thisWeek }}</div>
            <div class="stat-label">本周发布</div>
          </div>
        </div>
      </el-card>
      <el-card shadow="hover">
        <div class="stat-card">
          <div class="stat-icon month">📅</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.thisMonth }}</div>
            <div class="stat-label">本月发布</div>
          </div>
        </div>
      </el-card>
      <el-card shadow="hover">
        <div class="stat-card">
          <div class="stat-icon success">✅</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.byStatus.SUCCESS || 0 }}</div>
            <div class="stat-label">成功</div>
          </div>
        </div>
      </el-card>
      <el-card shadow="hover">
        <div class="stat-card">
          <div class="stat-icon failed">❌</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.byStatus.FAILED || 0 }}</div>
            <div class="stat-label">失败</div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 发布日志表格 -->
    <div class="table-container">
      <el-table :data="publishLogs" v-loading="loading" style="width: 100%">
        <el-table-column prop="content.title" label="内容标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="account.name" label="账号" width="120" />
        <el-table-column prop="platform" label="平台" width="100">
          <template #default="{ row }">
            <el-tag :type="getPlatformTagType(row.platform)">
              {{ getPlatformLabel(row.platform) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="jobState" label="队列状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.jobState" :type="getJobStateTagType(row.jobState)" size="small">
              {{ row.jobState }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="publishedUrl" label="发布链接" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.publishedUrl" :href="row.publishedUrl" target="_blank" class="publish-link">
              {{ row.publishedUrl }}
            </a>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip v-if="row.errorMessage" :content="row.errorMessage" placement="top">
              <el-tag type="danger" size="small">查看错误</el-tag>
            </el-tooltip>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'FAILED'"
              link
              type="warning"
              @click="handleRetry(row)"
              :loading="retryingIds.includes(row.id)"
            >
              重试
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { onMounted, ref } from 'vue';
import {
  getAllPublishLogs,
  getPublishStats,
  type PublishLog,
  type PublishStats,
  retryPublish,
} from '@/api/publish-status';

// 统计数据
const stats = ref<PublishStats>({
  today: 0,
  thisWeek: 0,
  thisMonth: 0,
  byStatus: {} as Record<string, number>,
  byPlatform: {} as Record<string, number>,
});

// 发布日志
const publishLogs = ref<PublishLog[]>([]);
const loading = ref(false);
const retryingIds = ref<string[]>([]);

// 分页
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

// 平台标签
const platformLabels: Record<string, string> = {
  xiaohongshu: '小红书',
  weibo: '微博',
  douyin: '抖音',
  bilibili: 'B 站',
  wechat: '微信公众号',
};

const platformTagTypes: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  xiaohongshu: 'danger',
  weibo: 'primary',
  douyin: 'success',
  bilibili: 'info',
  wechat: 'warning',
};

// 状态标签
const statusLabels: Record<string, string> = {
  QUEUED: '等待中',
  PUBLISHING: '发布中',
  SUCCESS: '成功',
  FAILED: '失败',
};

const statusTagTypes: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  QUEUED: 'info',
  PUBLISHING: 'warning',
  SUCCESS: 'success',
  FAILED: 'danger',
};

// 队列状态标签
const jobStateTagTypes: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  waiting: 'info',
  active: 'warning',
  completed: 'success',
  failed: 'danger',
  delayed: 'warning',
};

function getPlatformLabel(platform: string): string {
  return platformLabels[platform] || platform;
}

function getPlatformTagType(platform: string): string {
  return platformTagTypes[platform] || 'info';
}

function getStatusLabel(status: string): string {
  return statusLabels[status] || status;
}

function getStatusTagType(status: string): string {
  return statusTagTypes[status] || 'info';
}

function getJobStateTagType(state: string): string {
  return jobStateTagTypes[state] || 'info';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 加载统计数据
async function loadStats() {
  try {
    stats.value = await getPublishStats();
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// 加载发布日志
async function loadPublishLogs() {
  loading.value = true;
  try {
    const response = await getAllPublishLogs(
      pageSize.value,
      (currentPage.value - 1) * pageSize.value
    );
    publishLogs.value = response.publishLogs;
    total.value = response.pagination.total;
  } catch (error) {
    console.error('Failed to load publish logs:', error);
    ElMessage.error('加载发布日志失败');
  } finally {
    loading.value = false;
  }
}

// 刷新数据
function refreshData() {
  loadStats();
  loadPublishLogs();
}

// 重试发布
async function handleRetry(log: PublishLog) {
  if (retryingIds.value.includes(log.id)) return;

  try {
    retryingIds.value.push(log.id);
    await retryPublish(log.id);
    ElMessage.success('已重新加入发布队列');
    refreshData();
  } catch (error) {
    console.error('Failed to retry:', error);
    ElMessage.error('重试失败');
  } finally {
    retryingIds.value = retryingIds.value.filter((id) => id !== log.id);
  }
}

// 分页处理
function handlePageChange(page: number) {
  currentPage.value = page;
  loadPublishLogs();
}

function handleSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadPublishLogs();
}

onMounted(() => {
  loadStats();
  loadPublishLogs();
});

void [
  Refresh,
  getPlatformLabel,
  getPlatformTagType,
  getStatusLabel,
  getStatusTagType,
  getJobStateTagType,
  formatDate,
  handleRetry,
  handlePageChange,
  handleSizeChange,
];
</script>

<style scoped>
.publish-status-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  font-size: 40px;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f5f7fa;
}

.stat-icon.today { background: #e3f2fd; }
.stat-icon.week { background: #e8f5e9; }
.stat-icon.month { background: #fff3e0; }
.stat-icon.success { background: #e8f5e9; }
.stat-icon.failed { background: #ffebee; }

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  line-height: 1;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.table-container {
  background: #fff;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.pagination-bar {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.publish-link {
  color: #409eff;
  text-decoration: none;
}

.publish-link:hover {
  text-decoration: underline;
}
</style>
