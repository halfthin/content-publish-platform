<template>
  <div class="content-detail-page">
    <!-- 返回按钮 -->
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

    <el-row :gutter="20" v-loading="store.loading">
      <!-- 左侧：媒体预览 -->
      <el-col :span="14">
        <el-card class="media-card">
          <template #header>
            <span>📸 媒体预览</span>
          </template>

          <!-- 图片轮播 -->
          <div v-if="content?.images && content.images.length > 0" class="image-carousel">
            <el-carousel :autoplay="false" arrow="always" height="400px">
              <el-carousel-item v-for="(img, index) in content.images" :key="index">
                <div class="carousel-item">
                  <el-image
                    :src="getImageUrl(img)"
                    fit="contain"
                    :preview-src-list="imagePreviewList"
                    :initial-index="index"
                    class="carousel-image"
                  >
                    <template #placeholder>
                      <div class="image-placeholder">
                        <el-icon><Picture /></el-icon>
                        <span>加载中...</span>
                      </div>
                    </template>
                  </el-image>
                  <div class="image-index">{{ index + 1 }} / {{ content.images.length }}</div>
                </div>
              </el-carousel-item>
            </el-carousel>
          </div>

          <!-- 视频预览 -->
          <div v-else-if="content?.video" class="video-preview">
            <video :src="getVideoUrl(content.video)" controls class="video-player" />
          </div>

          <!-- 无媒体 -->
          <div v-else class="no-media">
            <el-empty description="暂无媒体文件" />
          </div>

          <!-- 媒体文件列表 -->
          <div class="media-list" v-if="content?.images && content.images.length > 0">
            <h4>媒体文件列表</h4>
            <el-table :data="mediaTableData" style="width: 100%" size="small">
              <el-table-column prop="name" label="文件名" />
              <el-table-column prop="type" label="类型" width="80" />
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button link type="primary" @click="previewMedia(row.url)">
                    预览
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：内容信息 -->
      <el-col :span="10">
        <!-- 基本信息 -->
        <el-card class="info-card">
          <template #header>
            <span>📝 基本信息</span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="标题">{{ content?.title || '-' }}</el-descriptions-item>
            <el-descriptions-item label="类型">
              <el-tag>{{ getTypeLabel(content?.type || 'IMAGE') }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="分类">{{ content?.category || '-' }}</el-descriptions-item>
            <el-descriptions-item label="标签">
              <div v-if="content?.tags && content.tags.length > 0" class="tags-list">
                <el-tag v-for="tag in content.tags" :key="tag" size="small" style="margin-right: 6px">
                  {{ tag }}
                </el-tag>
              </div>
              <span v-else>-</span>
            </el-descriptions-item>
            <el-descriptions-item label="发布次数">{{ content?.publishCount || 0 }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatDate(content?.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="更新时间">
              {{ formatDate(content?.updatedAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 审核信息 -->
        <el-card class="info-card" style="margin-top: 20px">
          <template #header>
            <span>✅ 审核信息</span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="审核状态">
              <el-tag :type="getStatusTagType(content?.status || 'PENDING')">
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
            <el-button type="success" style="width: 100%" @click="handleApprove">
              审核通过
            </el-button>
            <el-button type="danger" style="width: 100%; margin-top: 10px" @click="handleReject">
              审核拒绝
            </el-button>
          </div>
        </el-card>

        <!-- 审核历史 -->
        <el-card class="info-card" style="margin-top: 20px">
          <template #header>
            <span>📜 审核历史</span>
          </template>
          <ReviewHistory :history="mockReviewHistory" />
        </el-card>

        <!-- 发布操作 -->
        <el-card class="info-card" style="margin-top: 20px" v-if="content?.status === 'APPROVED'">
          <template #header>
            <span>🚀 发布操作</span>
          </template>
          <el-form :model="publishForm" label-width="80px">
            <el-form-item label="平台">
              <el-select v-model="publishForm.platform" placeholder="选择发布平台" style="width: 100%">
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
                placeholder="选择发布账号"
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
              <el-alert title="当前平台没有可用账号，请先在账号管理中配置 Cookie 并保持账号启用。" type="warning" :closable="false" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" style="width: 100%" @click="handlePublish" :loading="publishing">
                发布内容
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- Markdown 文案 -->
    <el-card class="markdown-card" style="margin-top: 20px">
      <template #header>
        <span>📄 Markdown 文案</span>
      </template>
      <div class="markdown-content" v-if="contentDetail?.mdContent">
        <div class="markdown-body" v-html="renderedMarkdown"></div>
      </div>
      <el-empty v-else description="暂无文案内容" />
    </el-card>

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
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Picture } from '@element-plus/icons-vue';
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

type ReviewHistoryItem = {
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'published';
  timestamp: string;
  reviewer: string;
  note?: string;
  status?: string;
};

const router = useRouter();
const route = useRoute();
const store = useContentStore();

// 模拟审核历史数据（实际应从 API 获取）
const mockReviewHistory = computed(() => {
  if (!content.value) return [];

  const history: ReviewHistoryItem[] = [];

  // 创建时间
  history.push({
    action: 'created' as const,
    timestamp: content.value.createdAt,
    reviewer: '系统',
    status: content.value.status,
  });

  // 审核时间
  if (content.value.reviewedAt) {
    history.push({
      action: content.value.status === 'APPROVED' ? 'approved' : ('rejected' as const),
      timestamp: content.value.reviewedAt,
      reviewer: content.value.reviewedBy || '未知',
      note: content.value.reviewNote,
      status: content.value.status,
    });
  }

  return history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
});

const content = computed(() => store.currentContent);
const contentDetail = computed<ContentWithPreview | null>(() => store.currentContent);

// 图片预览列表
const imagePreviewList = computed(() => {
  if (!content.value?.images) return [];
  return content.value.images.map((img: string) => getImageUrl(img));
});

// 媒体表格数据
const mediaTableData = computed(() => {
  if (!content.value?.images) return [];
  return content.value.images.map((img: string, index: number) => ({
    name: img.split('/').pop() || `image-${index + 1}`,
    type: '图片',
    url: getImageUrl(img),
  }));
});

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

// 获取图片 URL
function getImageUrl(imgPath: string): string {
  if (!content.value) return '';
  return getContentFileUrl(content.value.id, imgPath);
}

// 获取视频 URL
function getVideoUrl(videoPath: string): string {
  if (!content.value) return '';
  return getContentFileUrl(content.value.id, videoPath);
}

// 预览媒体
function previewMedia(url: string) {
  window.open(url, '_blank');
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
  Picture,
  mockReviewHistory,
  imagePreviewList,
  mediaTableData,
  renderedMarkdown,
  availableAccounts,
  getVideoUrl,
  previewMedia,
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
  padding: 20px;
}

.back-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.status-badge {
  margin-left: auto;
}

.media-card,
.info-card,
.markdown-card {
  border-radius: 4px;
}

.image-carousel {
  margin-bottom: 20px;
}

.carousel-item {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.carousel-image {
  max-width: 100%;
  max-height: 100%;
}

.image-index {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

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

.video-preview {
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.video-player {
  width: 100%;
  max-height: 400px;
}

.no-media {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-list {
  margin-top: 20px;
}

.media-list h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #303133;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
}

.review-actions {
  margin-top: 20px;
}

.markdown-content {
  max-height: 600px;
  overflow-y: auto;
}

.markdown-body {
  padding: 20px;
  background: #f5f7fa;
  border-radius: 4px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin-top: 0;
}

.markdown-body :deep(pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
}

.markdown-body :deep(code) {
  font-family: 'Courier New', monospace;
}
</style>
