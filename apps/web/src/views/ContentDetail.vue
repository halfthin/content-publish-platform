<template>
  <div class="content-detail-page">
    <!-- 返回按钮 - 固定在顶部 -->
    <div class="back-bar">
      <el-button @click="handleBack">
        <el-icon><ArrowLeft /></el-icon>
        返回列表
      </el-button>
      <div class="status-badge">
        <el-tag :type="getStatusTagType(content?.status || 'PENDING')" size="large">
          {{ getStatusLabel(content?.status || 'PENDING') }}
        </el-tag>
      </div>
    </div>

    <!-- 内容区域 - 分别滚动 -->
    <div v-loading="store.loading" class="content-row">
      <!-- 左侧：媒体预览 -->
      <div class="media-col">
        <div class="media-wrapper">
          <!-- 图片预览 - 缩略图网格 -->
          <div v-if="content?.images && content.images.length > 0" class="image-thumbnail-grid">
            <div
              v-for="(_img, index) in content.images"
              :key="index"
              class="thumbnail-item"
              @click="openImageViewer(index)"
            >
              <el-image
                :src="imagePreviewList[index]"
                fit="cover"
                class="thumbnail-image"
                :preview-teleported="true"
              >
                <template #placeholder>
                  <div class="image-placeholder">
                    <el-icon class="is-loading"><Loading /></el-icon>
                  </div>
                </template>
              </el-image>
              <div class="thumbnail-overlay">
                <el-icon><ZoomIn /></el-icon>
              </div>
            </div>
          </div>

          <!-- 视频预览 -->
          <div v-else-if="content?.video" class="video-preview">
            <video :src="getVideoUrl(content.video)" controls class="video-player" />
          </div>

          <!-- 无媒体 -->
          <div v-else class="no-media">
            <el-empty description="暂无媒体文件" />
          </div>

          <!-- 图片查看器 -->
          <el-image-viewer
            v-if="showImageViewer && content?.images && content.images.length > 0"
            :url-list="imagePreviewList"
            :initial-index="currentImageIndex"
            @close="showImageViewer = false"
            teleported
          />
        </div>
      </div>

      <!-- 右侧：内容信息 -->
      <div class="info-col">
        <div class="info-wrapper">
          <!-- 基本信息 -->
          <el-card class="info-card">
            <template #header>
              <span>📝 基本信息</span>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="标题">{{ content?.title || '-' }}</el-descriptions-item>
              <el-descriptions-item label="类型">
                <el-tag size="small">{{ getTypeLabel(content?.type || 'IMAGE') }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="描述">
                <span class="description-text">{{ content?.description || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="分类">{{ content?.category || '-' }}</el-descriptions-item>
              <el-descriptions-item label="标签">
                <div v-if="content?.tags && content.tags.length > 0" class="tags-list">
                  <el-tag v-for="tag in content.tags" :key="tag" size="small" style="margin-right: 4px; margin-bottom: 4px">
                    {{ tag }}
                  </el-tag>
                </div>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                {{ formatDate(content?.createdAt) }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 审核信息 -->
          <el-card class="info-card" style="margin-top: 12px">
            <template #header>
              <span>✅ 审核信息</span>
            </template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="审核状态">
                <el-tag :type="getStatusTagType(content?.status || 'PENDING')" size="small">
                  {{ getStatusLabel(content?.status || 'PENDING') }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="审核人">
                {{ content?.reviewedBy || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="审核时间">
                {{ content?.reviewedAt ? formatDate(content.reviewedAt) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="审核备注">
                {{ content?.reviewNote || '-' }}
              </el-descriptions-item>
            </el-descriptions>

            <!-- 审核操作 -->
            <div class="review-actions" v-if="content?.status === 'PENDING'">
              <el-button type="success" style="width: 100%" size="small" @click="handleApprove">
                审核通过
              </el-button>
              <el-button type="danger" style="width: 100%; margin-top: 8px" size="small" @click="handleReject">
                审核拒绝
              </el-button>
            </div>
          </el-card>

          <!-- 发布操作 -->
          <el-card class="info-card" style="margin-top: 12px" v-if="content?.status === 'APPROVED'">
            <template #header>
              <span>🚀 发布操作</span>
            </template>
            <el-form :model="publishForm" label-width="60px" size="small">
              <el-form-item label="平台">
                <el-select v-model="publishForm.platform" placeholder="选择平台" style="width: 100%">
                  <el-option label="小红书" value="xiaohongshu" />
                  <el-option label="微博" value="weibo" />
                  <el-option label="抖音" value="douyin" />
                  <el-option label="B 站" value="bilibili" />
                  <el-option label="微信公众号" value="wechat" />
                </el-select>
              </el-form-item>
              <el-form-item label="账号">
                <el-select
                  v-model="publishForm.accountId"
                  placeholder="选择账号"
                  style="width: 100%"
                  :loading="accountsLoading"
                  clearable
                >
                  <el-option
                    v-for="account in availableAccounts"
                    :key="account.id"
                    :label="`${account.name}${account.username ? ` (${account.username})` : ''}`"
                    :value="account.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item v-if="publishForm.platform && availableAccounts.length === 0">
                <el-alert title="当前平台没有可用账号" type="warning" :closable="false" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" style="width: 100%" @click="handlePublish" :loading="publishing">
                  发布内容
                </el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <!-- Markdown 文案 -->
          <el-card class="info-card markdown-card" style="margin-top: 12px">
            <template #header>
              <span>📄 Markdown 文案</span>
            </template>
            <div class="markdown-content" v-if="contentDetail?.mdContent">
              <div class="markdown-body" v-html="renderedMarkdown"></div>
            </div>
            <el-empty v-else description="暂无文案内容" :image-size="60" />
          </el-card>
        </div>
      </div>
    </div>
  </div>

    <!-- 审核对话框 -->
    <el-dialog
      v-model="reviewDialogVisible"
      :title="reviewAction === 'approve' ? '审核通过' : '审核拒绝'"
      width="400px"
    >
      <el-form :model="reviewForm" label-width="70px">
        <el-form-item label="审核人">
          <el-input v-model="reviewForm.reviewedBy" placeholder="请输入审核人" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="reviewForm.note"
            type="textarea"
            :rows="3"
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
</template>

<script setup lang="ts">
/* biome-ignore-all lint/correctness/noUnusedVariables: Vue <script setup> bindings are consumed by the template. */
import { ArrowLeft, Loading, Picture, ZoomIn } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { marked } from 'marked';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { type Account, getAccounts } from '@/api/accounts';
import { type ContentWithPreview, getContentFileUrl } from '@/api/contents';
import { useContentStore } from '@/stores/content.store';
import {
  getContentStatusLabel,
  getContentStatusType,
  getContentTypeLabel,
} from '@/utils/status-labels';

const router = useRouter();
const route = useRoute();
const store = useContentStore();

// 当前显示的图片索引
const currentImageIndex = ref(0);

// 图片查看器显示状态
const showImageViewer = ref(false);

// 打开图片查看器
function openImageViewer(index: number) {
  currentImageIndex.value = index;
  showImageViewer.value = true;
}

const content = computed(() => store.currentContent);
const contentDetail = computed<ContentWithPreview | null>(() => store.currentContent);

// 图片预览列表
const imagePreviewList = computed(() => {
  return contentDetail.value?.previewUrls || [];
});

// 重置图片索引当内容变化时
watch(
  () => content.value?.id,
  () => {
    currentImageIndex.value = 0;
  }
);

// 渲染 Markdown
const renderedMarkdown = computed(() => {
  if (!contentDetail.value?.mdContent) return '';
  return marked(contentDetail.value.mdContent);
});

// 审核对话框
const reviewDialogVisible = ref(false);
const reviewAction = ref<'approve' | 'reject'>('approve');
const reviewForm = ref({
  reviewedBy: '',
  note: '',
});
const submitting = ref(false);

// 发布表单
const publishForm = ref({
  platform: '',
  accountId: '',
});
const publishing = ref(false);
const accountsLoading = ref(false);
const accounts = ref<Account[]>([]);
const availableAccounts = computed(() =>
  accounts.value.filter(
    (account) => account.platform === publishForm.value.platform && account.status === 'ACTIVE'
  )
);

// 获取视频 URL
function getVideoUrl(videoPath: string): string {
  if (!content.value) return '';
  return getContentFileUrl(content.value.id, videoPath);
}

// 使用共享工具函数
const getTypeLabel = getContentTypeLabel;
const getStatusLabel = getContentStatusLabel;
const getStatusTagType = getContentStatusType;

// 格式化日期
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 返回
function handleBack() {
  router.back();
}

// 加载数据
async function loadData() {
  const id = route.params.id as string;
  if (!id) {
    ElMessage.error('内容 ID 不存在');
    router.push('/contents');
    return;
  }

  try {
    await store.fetchContentDetail(id);
  } catch {
    ElMessage.error('加载内容详情失败');
  }
}

async function loadAccounts() {
  accountsLoading.value = true;

  try {
    const result = await getAccounts();
    accounts.value = Array.isArray(result) ? result : [];
  } catch {
    ElMessage.error('加载账号列表失败');
  } finally {
    accountsLoading.value = false;
  }
}

// 审核通过
function handleApprove() {
  reviewAction.value = 'approve';
  reviewForm.value = { reviewedBy: '', note: '' };
  reviewDialogVisible.value = true;
}

// 审核拒绝
function handleReject() {
  reviewAction.value = 'reject';
  reviewForm.value = { reviewedBy: '', note: '' };
  reviewDialogVisible.value = true;
}

// 确认审核
async function confirmReview() {
  if (!content.value) return;

  if (!reviewForm.value.reviewedBy) {
    ElMessage.warning('请输入审核人');
    return;
  }

  submitting.value = true;

  try {
    if (reviewAction.value === 'approve') {
      await store.approveContentAction(
        content.value.id,
        reviewForm.value.reviewedBy,
        reviewForm.value.note || undefined
      );
      ElMessage.success('审核通过');
    } else {
      await store.rejectContentAction(
        content.value.id,
        reviewForm.value.reviewedBy,
        reviewForm.value.note || undefined
      );
      ElMessage.success('已拒绝');
    }

    reviewDialogVisible.value = false;
    await loadData();
  } catch {
    ElMessage.error('操作失败');
  } finally {
    submitting.value = false;
  }
}

// 发布
async function handlePublish() {
  if (!content.value) return;

  if (!publishForm.value.platform) {
    ElMessage.warning('请选择发布平台');
    return;
  }

  if (!publishForm.value.accountId) {
    ElMessage.warning('请选择发布账号');
    return;
  }

  publishing.value = true;

  try {
    await store.publishContentAction(
      content.value.id,
      publishForm.value.platform,
      publishForm.value.accountId
    );
    ElMessage.success('内容已加入发布队列');
    await loadData();
    router.push('/publish-status');
  } catch {
    ElMessage.error('发布失败');
  } finally {
    publishing.value = false;
  }
}

onMounted(() => {
  void loadData();
  void loadAccounts();
});

watch(
  () => publishForm.value.platform,
  () => {
    publishForm.value.accountId = '';
  }
);

void [
  ArrowLeft,
  Loading,
  Picture,
  ZoomIn,
  showImageViewer,
  imagePreviewList,
  renderedMarkdown,
  availableAccounts,
  getVideoUrl,
  getTypeLabel,
  getStatusLabel,
  getStatusTagType,
  formatDate,
  handleBack,
  handleApprove,
  handleReject,
  confirmReview,
  handlePublish,
];
</script>

<style scoped>
.content-detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.back-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  flex-shrink: 0;
  background: #f5f7fa;
}

.status-badge {
  margin-left: auto;
}

.content-row {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  align-items: stretch;
}

/* 左右分栏 - 都被拉伸到同一高度 */
.media-col {
  flex: 0 0 62%;
  min-height: 0;
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.info-col {
  flex: 0 0 38%;
  min-height: 0;
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
}

/* 左侧媒体包装器 */
.media-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.media-wrapper::-webkit-scrollbar {
  width: 6px;
}

.media-wrapper::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}

.media-wrapper::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}

.media-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

/* 右侧信息包装器 */
.info-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 12px;
}

.info-wrapper::-webkit-scrollbar {
  width: 6px;
}

.info-wrapper::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}

.info-wrapper::-webkit-scrollbar-thumb:hover {
  background: #ccc;
}

.info-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

/* 图片预览区域 */
.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.image-placeholder .el-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

/* 缩略图网格 */
.image-thumbnail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px;
  align-content: start;
}

.thumbnail-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #f5f7fa;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.thumbnail-item:hover {
  border-color: #409eff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.thumbnail-image {
  width: 100%;
  height: 100%;
}

.thumbnail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  font-size: 24px;
}

.thumbnail-item:hover .thumbnail-overlay {
  opacity: 1;
}

/* 视频预览 */
.video-preview {
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-player {
  max-width: 100%;
  max-height: 100%;
}

/* 无媒体 */
.no-media {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

/* 右侧信息面板 */
.info-card {
  border-radius: 8px;
  margin-bottom: 12px;
}

.info-card :deep(.el-card__header) {
  padding: 12px 16px;
  font-size: 14px;
}

.info-card :deep(.el-descriptions__label) {
  width: 80px;
}

.description-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
}

.review-actions {
  margin-top: 16px;
}

/* Markdown */
.markdown-card {
  margin-bottom: 16px;
}

.markdown-content {
  max-height: 300px;
  overflow-y: auto;
}

.markdown-body {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin-top: 0;
}

.markdown-body :deep(pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.markdown-body :deep(code) {
  font-family: 'Courier New', monospace;
}
</style>
