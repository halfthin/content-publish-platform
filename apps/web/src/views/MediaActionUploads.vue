<template>
  <div class="media-uploads-page">
    <div class="page-header">
      <h2>回传文件</h2>
      <el-button link @click="refreshAll">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <div class="layout-grid">
      <!-- 左侧边栏：Provider 列表 + 日期树 -->
      <aside class="sidebar-left">
        <!-- Provider 切换 -->
        <section class="card-panel section-panel sidebar-panel">
          <div class="section-header">
            <div>
              <h3>存储源</h3>
              <p class="section-helper">按回传来源分组</p>
            </div>
          </div>
          <div v-if="roots.length > 0" class="provider-list">
            <div
              v-for="root in roots"
              :key="root.id"
              class="provider-item"
              :class="{ active: currentRoot?.id === root.id }"
              @click="selectRoot(root)"
            >
              <span class="provider-icon">📁</span>
              <span class="provider-label">{{ root.label }}</span>
            </div>
          </div>
          <el-empty v-else description="暂无可用的存储源" />
        </section>

        <!-- 日期目录树 -->
        <section v-if="currentRoot" class="card-panel section-panel sidebar-panel">
          <div class="section-header">
            <div>
              <h3>日期目录</h3>
              <p class="section-helper">按年月快速定位</p>
            </div>
            <el-tag size="small">{{ currentRoot.label }}</el-tag>
          </div>

          <el-tree
            v-if="dateTreeNodes.length > 0"
            :data="dateTreeNodes"
            node-key="key"
            :expand-on-click-node="false"
            default-expand-all
            @node-click="handleDateNodeClick"
          />
          <el-empty v-else description="暂无日期目录" />
        </section>
      </aside>

      <!-- 主内容区：文件列表 -->
      <main class="content-area card-panel">
        <div class="workspace-header">
          <div>
            <h3>文件列表</h3>
            <p class="workspace-subcopy">
              <template v-if="currentPath">
                {{ currentRoot?.label }} / {{ currentPath }}
              </template>
              <template v-else-if="currentRoot">
                {{ currentRoot.label }} 根目录
              </template>
              <template v-else>
                请选择左侧存储源
              </template>
            </p>
          </div>
          <div class="workspace-overview">
            <el-tag v-if="loading" type="info">加载中...</el-tag>
            <el-tag v-else type="success">{{ items.length }} 个文件</el-tag>
            <el-button
              v-if="selectedItems.size > 0"
              type="danger"
              size="small"
              @click="deleteSelected"
            >
              删除所选 ({{ selectedItems.size }})
            </el-button>
          </div>
        </div>

        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="items.length === 0" class="empty">
          <el-empty description="该目录下暂无文件" />
        </div>
        <div v-else class="file-grid">
          <div
            v-for="item in items"
            :key="item.relativePath"
            class="file-card"
            :class="{ selected: selectedItems.has(item.relativePath) }"
            @click="toggleItemSelection(item)"
          >
            <div class="file-thumb-wrap">
              <img
                v-if="isImage(item.mimeType)"
                :src="getFileUrl(item.relativePath)"
                :alt="item.filename"
                class="file-thumb"
                loading="lazy"
              />
              <div v-else class="file-icon">{{ getFileIcon(item.mimeType) }}</div>
              <div class="file-card-toolbar">
                <el-checkbox
                  :model-value="selectedItems.has(item.relativePath)"
                  @click.stop
                  @change="toggleItemSelection(item)"
                />
                <el-button link size="small" @click.stop="previewFile(item)">预览</el-button>
                <el-button link type="danger" size="small" @click.stop="deleteFile(item)">删除</el-button>
              </div>
              <div v-if="selectedItems.has(item.relativePath)" class="file-selected-badge">已选</div>
            </div>
            <div class="file-meta">
              <div class="file-name" :title="item.filename">{{ item.filename }}</div>
              <div class="file-info">{{ formatFileSize(item.size) }} · {{ formatDateTime(item.modifiedAt) }}</div>
            </div>
          </div>
        </div>

        <!-- 分页加载 -->
        <div v-if="nextCursor" class="load-more">
          <el-button @click="loadMore">加载更多</el-button>
        </div>
      </main>
    </div>

    <!-- 预览弹窗 -->
    <el-dialog
      v-model="previewVisible"
      :title="previewItem?.filename || '文件预览'"
      width="900px"
    >
      <div v-if="previewItem" class="preview-container">
        <img
          v-if="isImage(previewItem.mimeType)"
          :src="getFileUrl(previewItem.relativePath)"
          :alt="previewItem.filename"
          class="preview-image"
        />
        <div v-else class="preview-placeholder">
          <div class="preview-file-icon">{{ getFileIcon(previewItem.mimeType) }}</div>
          <div>{{ previewItem.filename }}</div>
          <div class="preview-file-meta">
            {{ formatFileSize(previewItem.size) }} · {{ formatDateTime(previewItem.modifiedAt) }}
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button type="danger" @click="deletePreviewFile">删除</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, ref } from 'vue';
import {
  deleteMediaActionUploadFile,
  getMediaActionUploadItems,
  getMediaActionUploadRoots,
  getMediaActionUploadTree,
  getMediaUploadProviderFileUrl,
  type MediaActionUploadDateTreeYear,
  type MediaActionUploadItem,
  type MediaActionUploadRoot,
} from '@/api/media';

interface DateTreeNode {
  key: string;
  label: string;
  isDate?: boolean;
  path?: string;
  children?: DateTreeNode[];
}

const roots = ref<MediaActionUploadRoot[]>([]);
const currentRoot = ref<MediaActionUploadRoot | null>(null);
const dateTreeNodes = ref<DateTreeNode[]>([]);
const items = ref<MediaActionUploadItem[]>([]);
const loading = ref(false);
const currentPath = ref('');
const nextCursor = ref<string | null>(null);
const selectedItems = ref(new Set<string>());
const previewVisible = ref(false);
const previewItem = ref<MediaActionUploadItem | null>(null);

function buildDateTree(years: MediaActionUploadDateTreeYear[]): DateTreeNode[] {
  return years.map((year) => ({
    key: `year-${year.year}`,
    label: year.label,
    path: year.path,
    children: year.months.map((month) => ({
      key: `month-${year.year}-${month.month}`,
      label: `${year.label}-${month.label}`,
      path: month.path,
      children:
        month.days?.map((day) => ({
          key: `day-${year.year}-${month.month}-${day.day}`,
          label: `${month.label}-${day.label}`,
          path: day.path,
          isDate: true,
        })) || [],
    })),
  }));
}

async function selectRoot(root: MediaActionUploadRoot) {
  currentRoot.value = root;
  currentPath.value = '';
  selectedItems.value.clear();
  await Promise.all([loadDateTree(), loadItems()]);
}

async function loadDateTree() {
  if (!currentRoot.value) return;
  try {
    const tree = await getMediaActionUploadTree(currentRoot.value.id, '');
    dateTreeNodes.value = buildDateTree(tree);
  } catch {
    dateTreeNodes.value = [];
  }
}

async function loadItems(cursor?: string) {
  if (!currentRoot.value) return;
  loading.value = true;
  try {
    const result = await getMediaActionUploadItems({
      provider: currentRoot.value.id,
      path: currentPath.value,
      recursive: true,
      limit: 120,
      cursor,
    });
    const imageItems = result.items.filter((item) => item.mimeType.startsWith('image/'));
    if (cursor) {
      items.value.push(...imageItems);
    } else {
      items.value = imageItems;
    }
    nextCursor.value = result.nextCursor;
  } catch {
    ElMessage.error('加载文件列表失败');
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (nextCursor.value) {
    await loadItems(nextCursor.value);
  }
}

function handleDateNodeClick(node: DateTreeNode) {
  if (node.path !== undefined) {
    currentPath.value = node.path;
    selectedItems.value.clear();
    loadItems();
  }
}

async function refreshAll() {
  if (currentRoot.value) {
    await Promise.all([loadDateTree(), loadItems()]);
  }
}

function toggleItemSelection(item: MediaActionUploadItem) {
  if (selectedItems.value.has(item.relativePath)) {
    selectedItems.value.delete(item.relativePath);
  } else {
    selectedItems.value.add(item.relativePath);
  }
  selectedItems.value = new Set(selectedItems.value);
}

function previewFile(item: MediaActionUploadItem) {
  previewItem.value = item;
  previewVisible.value = true;
}

async function deleteFile(item: MediaActionUploadItem) {
  if (!currentRoot.value) return;
  const rootId = currentRoot.value.id;

  try {
    await ElMessageBox.confirm(`确定要删除文件 "${item.filename}" 吗？`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await deleteMediaActionUploadFile(rootId, item.relativePath);
    items.value = items.value.filter((i) => i.relativePath !== item.relativePath);
    selectedItems.value.delete(item.relativePath);
    ElMessage.success('删除成功');
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
}

async function deletePreviewFile() {
  if (!previewItem.value) return;
  await deleteFile(previewItem.value);
  previewVisible.value = false;
}

async function deleteSelected() {
  if (!currentRoot.value || selectedItems.value.size === 0) return;
  const rootId = currentRoot.value.id;

  try {
    await ElMessageBox.confirm(
      `确定要删除所选的 ${selectedItems.value.size} 个文件吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    for (const relativePath of selectedItems.value) {
      await deleteMediaActionUploadFile(rootId, relativePath);
    }
    items.value = items.value.filter((i) => !selectedItems.value.has(i.relativePath));
    selectedItems.value.clear();
    ElMessage.success('删除成功');
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
}

function getFileUrl(relativePath: string): string {
  if (!currentRoot.value) return '';
  return getMediaUploadProviderFileUrl(currentRoot.value.id, relativePath);
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('json')) return '📋';
  return '📁';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

onMounted(async () => {
  try {
    roots.value = await getMediaActionUploadRoots();
    if (roots.value.length > 0) {
      await selectRoot(roots.value[0]);
    }
  } catch {
    ElMessage.error('加载存储源失败');
  }
});
</script>

<style scoped>
.media-uploads-page {
  max-width: 1400px;
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

.layout-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: start;
}

.sidebar-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-panel {
  padding: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
}

.section-helper {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.provider-item:hover {
  background: #f1f5f9;
}

.provider-item.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.provider-icon {
  font-size: 16px;
}

.provider-label {
  font-size: 13px;
}

.content-area {
  padding: 16px;
  min-height: 500px;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.workspace-header h3 {
  margin: 0 0 4px 0;
}

.workspace-subcopy {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.workspace-overview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading,
.empty {
  text-align: center;
  padding: 40px;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.file-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.file-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.file-card.selected {
  border-color: #409eff;
  background: #f0f7ff;
}

.file-thumb-wrap {
  position: relative;
  aspect-ratio: 1;
  background: #f5f7fa;
  overflow: hidden;
}

.file-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
}

.file-card-toolbar {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.file-card:hover .file-card-toolbar {
  opacity: 1;
}

.file-selected-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: #409eff;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.file-meta {
  padding: 8px;
}

.file-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-info {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.load-more {
  text-align: center;
  margin-top: 16px;
}

.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.preview-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.preview-placeholder {
  text-align: center;
  padding: 40px;
}

.preview-file-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.preview-file-meta {
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
}
</style>
