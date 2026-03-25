<template>
  <div class="contents-page">
    <div class="page-header">
      <h2>📋 内容管理</h2>
      <div class="header-actions">
        <el-button type="primary" @click="handleScanInbox">
          <el-icon><Refresh /></el-icon>
          扫描收件箱
        </el-button>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="filter-bar">
      <el-form :inline="true" :model="filterForm">
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部状态" clearable @change="applyFilter">
            <el-option label="待审核" value="PENDING" />
            <el-option label="已通过" value="APPROVED" />
            <el-option label="已拒绝" value="REJECTED" />
            <el-option label="发布中" value="PUBLISHING" />
            <el-option label="已发布" value="PUBLISHED" />
            <el-option label="发布失败" value="FAILED" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filterForm.type" placeholder="全部类型" clearable @change="applyFilter">
            <el-option label="图片" value="IMAGE" />
            <el-option label="视频" value="VIDEO" />
            <el-option label="混合" value="MIXED" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索">
          <el-input
            v-model="filterForm.search"
            placeholder="搜索标题/描述/标签"
            clearable
            @keyup.enter="applyFilter"
          >
            <template #append>
              <el-button @click="applyFilter">
                <el-icon><Search /></el-icon>
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
    </div>

    <!-- 操作栏 -->
    <div class="action-bar" v-if="selectedRows.length > 0">
      <span class="selected-count">已选择 {{ selectedRows.length }} 项</span>
      <el-button type="success" size="small" @click="handleBatchApprove">
        批量通过
      </el-button>
      <el-button type="danger" size="small" @click="handleBatchReject">
        批量拒绝
      </el-button>
      <el-button size="small" @click="clearSelection">
        取消选择
      </el-button>
    </div>

    <!-- 内容表格 -->
    <div class="table-container">
      <el-table
        :data="store.contents"
        v-loading="store.loading"
        style="width: 100%"
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)">
              {{ getTypeLabel(row.type) }}
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
        <el-table-column prop="category" label="分类" width="120" show-overflow-tooltip />
        <el-table-column prop="tags" label="标签" width="150">
          <template #default="{ row }">
            <div class="tags-cell">
              <el-tag v-for="tag in row.tags.slice(0, 3)" :key="tag" size="small" style="margin-right: 4px">
                {{ tag }}
              </el-tag>
              <el-tag v-if="row.tags.length > 3" size="small">+{{ row.tags.length - 3 }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="publishCount" label="发布次数" width="80" align="center" />
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="handleView(row)">
              查看
            </el-button>
            <el-button
              v-if="row.status === 'PENDING'"
              link
              type="success"
              @click.stop="handleApprove(row)"
            >
              通过
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
        :total="store.pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 审核对话框 -->
    <el-dialog
      v-model="reviewDialogVisible"
      :title="reviewAction === 'approve' ? '审核通过' : '审核拒绝'"
      width="500px"
    >
      <el-form :model="reviewForm" label-width="80px">
        <el-form-item label="审核人">
          <el-input v-model="reviewForm.reviewedBy" placeholder="请输入审核人" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="reviewForm.note"
            type="textarea"
            :rows="4"
            placeholder="请输入审核备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button
          :type="reviewAction === 'approve' ? 'success' : 'danger'"
          @click="confirmReview"
          :loading="submitting"
        >
          确认
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量审核对话框 -->
    <el-dialog
      v-model="batchReviewDialogVisible"
      :title="reviewAction === 'approve' ? '批量审核通过' : '批量审核拒绝'"
      width="500px"
    >
      <el-alert
        :title="`将对选中的 ${selectedRows.length} 项内容执行${reviewAction === 'approve' ? '通过' : '拒绝'}操作`"
        type="info"
        show-icon
        style="margin-bottom: 16px"
      />
      <el-form :model="batchReviewForm" label-width="80px">
        <el-form-item label="审核人">
          <el-input v-model="batchReviewForm.reviewedBy" placeholder="请输入审核人" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="batchReviewForm.note"
            type="textarea"
            :rows="4"
            placeholder="请输入审核备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchReviewDialogVisible = false">取消</el-button>
        <el-button
          :type="reviewAction === 'approve' ? 'success' : 'danger'"
          @click="confirmBatchReview"
          :loading="batchSubmitting"
        >
          确认执行
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Content } from '@/api/contents';
import { useContentStore } from '@/stores/content.store';
import {
  getContentStatusLabel,
  getContentStatusType,
  getContentTypeLabel,
  getContentTypeType,
} from '@/utils/status-labels';

const router = useRouter();
const store = useContentStore();

// 过滤表单
const filterForm = reactive({
  status: '',
  type: '',
  search: '',
});

// 分页
const currentPage = ref(1);
const pageSize = ref(20);

// 批量选择
const selectedRows = ref<Content[]>([]);

// 审核对话框
const reviewDialogVisible = ref(false);
const reviewAction = ref<'approve' | 'reject'>('approve');
const currentReviewContent = ref<Content | null>(null);
const reviewForm = reactive({
  reviewedBy: '',
  note: '',
});
const submitting = ref(false);

// 批量审核对话框
const batchReviewDialogVisible = ref(false);
const batchReviewForm = reactive({
  reviewedBy: '',
  note: '',
});
const batchSubmitting = ref(false);

// 使用共享工具函数
const getTypeLabel = getContentTypeLabel;
const getTypeTagType = getContentTypeType;
const getStatusLabel = getContentStatusLabel;
const getStatusTagType = getContentStatusType;

// 格式化日期
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

// 加载数据
async function loadData() {
  try {
    await store.fetchContents({
      page: currentPage.value,
      limit: pageSize.value,
      status: filterForm.status || undefined,
      type: filterForm.type || undefined,
      search: filterForm.search || undefined,
    });
  } catch (error: unknown) {
    ElMessage.error(`加载内容列表失败：${getErrorMessage(error)}`);
  }
}

// 应用过滤
function applyFilter() {
  currentPage.value = 1;
  loadData();
}

// 页面变化
function handlePageChange(page: number) {
  currentPage.value = page;
  loadData();
}

// 每页数量变化
function handleSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadData();
}

// 行点击
function handleRowClick(row: Content) {
  router.push(`/contents/${row.id}`);
}

// 查看
function handleView(row: Content) {
  router.push(`/contents/${row.id}`);
}

// 扫描收件箱
async function handleScanInbox() {
  try {
    await store.scanInboxAction();
    ElMessage.success('收件箱扫描完成');
  } catch (error: unknown) {
    ElMessage.error(`扫描收件箱失败：${getErrorMessage(error)}`);
  }
}

// 选择变化
function handleSelectionChange(selection: Content[]) {
  selectedRows.value = selection;
}

// 清除选择
function clearSelection() {
  selectedRows.value = [];
}

// 批量审核通过
function handleBatchApprove() {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要审核的内容');
    return;
  }

  batchReviewForm.reviewedBy = '';
  batchReviewForm.note = '';
  reviewAction.value = 'approve';
  batchReviewDialogVisible.value = true;
}

// 批量审核拒绝
function handleBatchReject() {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要审核的内容');
    return;
  }

  batchReviewForm.reviewedBy = '';
  batchReviewForm.note = '';
  reviewAction.value = 'reject';
  batchReviewDialogVisible.value = true;
}

// 确认批量审核
async function confirmBatchReview() {
  if (selectedRows.value.length === 0) return;

  if (!batchReviewForm.reviewedBy) {
    ElMessage.warning('请输入审核人');
    return;
  }

  batchSubmitting.value = true;

  try {
    const pendingIds = selectedRows.value.filter((c) => c.status === 'PENDING').map((c) => c.id);

    if (pendingIds.length === 0) {
      ElMessage.warning('所选内容中没有待审核的项目');
      batchReviewDialogVisible.value = false;
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const id of pendingIds) {
      try {
        if (reviewAction.value === 'approve') {
          await store.approveContentAction(
            id,
            batchReviewForm.reviewedBy,
            batchReviewForm.note || undefined
          );
        } else {
          await store.rejectContentAction(
            id,
            batchReviewForm.reviewedBy,
            batchReviewForm.note || undefined
          );
        }
        successCount++;
      } catch {
        failCount++;
      }
    }

    ElMessage.success(`批量审核完成：成功 ${successCount} 项，失败 ${failCount} 项`);
    batchReviewDialogVisible.value = false;
    clearSelection();
    loadData();
  } catch {
    ElMessage.error('批量审核失败');
  } finally {
    batchSubmitting.value = false;
  }
}

// 审核通过
function handleApprove(row: Content) {
  currentReviewContent.value = row;
  reviewAction.value = 'approve';
  reviewForm.reviewedBy = '';
  reviewForm.note = '';
  reviewDialogVisible.value = true;
}

// 确认审核
async function confirmReview() {
  if (!currentReviewContent.value) return;

  if (!reviewForm.reviewedBy) {
    ElMessage.warning('请输入审核人');
    return;
  }

  submitting.value = true;

  try {
    if (reviewAction.value === 'approve') {
      await store.approveContentAction(
        currentReviewContent.value.id,
        reviewForm.reviewedBy,
        reviewForm.note || undefined
      );
      ElMessage.success('审核通过');
    } else {
      await store.rejectContentAction(
        currentReviewContent.value.id,
        reviewForm.reviewedBy,
        reviewForm.note || undefined
      );
      ElMessage.success('已拒绝');
    }

    reviewDialogVisible.value = false;
    loadData();
  } catch {
    ElMessage.error('操作失败');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadData();
});

void [
  Refresh,
  Search,
  getTypeLabel,
  getTypeTagType,
  getStatusLabel,
  getStatusTagType,
  formatDate,
  applyFilter,
  handlePageChange,
  handleSizeChange,
  handleRowClick,
  handleView,
  handleScanInbox,
  handleSelectionChange,
  handleBatchApprove,
  handleBatchReject,
  confirmBatchReview,
  handleApprove,
  confirmReview,
];
</script>

<style scoped>
.contents-page {
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

.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #ecf5ff;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  border: 1px solid #d9ecff;
}

.selected-count {
  font-size: 14px;
  color: #409eff;
  font-weight: 500;
}

.filter-bar {
  background: #fff;
  padding: 20px;
  border-radius: 4px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
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

.tags-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
</style>
