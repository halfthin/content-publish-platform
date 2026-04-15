<template>
  <div :class="['media-library-page', `density-${viewDensity}`]">
    <header class="library-hero card-panel">
      <div class="hero-copy">
        <div class="hero-kicker">Media Library</div>
        <h2>素材库工作台</h2>
        <p>按日期快速切换拍摄目录，跨目录选图，并把收藏目录联动到当前工作区。</p>
      </div>

      <div class="hero-side">
        <div class="toolbar-actions">
          <el-button @click="refreshAll">刷新</el-button>
          <el-button type="primary" :disabled="!mediaStore.currentDatePath" @click="toggleCurrentDateFavorite">
            {{ mediaStore.currentDateFavorite ? '取消收藏当前日期' : '收藏当前日期' }}
          </el-button>
          <el-button :disabled="selectionStore.selectedCount === 0" @click="selectionStore.clearSelections()">
            清空已选
          </el-button>
        </div>
      </div>
    </header>

    <el-alert
      v-if="mediaStore.error"
      type="error"
      :closable="false"
      show-icon
      :title="mediaStore.error"
      class="error-banner"
    />

    <div class="layout-grid">
      <aside class="sidebar-left">
        <section class="card-panel section-panel sidebar-panel" >
          <div class="section-header">
            <div>
              <h3>日期目录</h3>
              <p class="section-helper">按年 / 月 / 日快速进入</p>
            </div>
            <el-tag size="small">{{ mediaStore.rootId }}</el-tag>
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

        <section class="card-panel section-panel sidebar-panel" >
          <div class="section-header">
            <div>
              <h3>共享收藏</h3>
              <p class="section-helper">收藏路径可跨日期联动</p>
            </div>
            <el-button link @click="mediaStore.refreshFavorites()">刷新</el-button>
          </div>

          <div v-if="mediaStore.favorites.length > 0" class="favorite-list">
            <div
              v-for="favorite in mediaStore.favorites"
              :key="favorite.id"
              class="favorite-item"
              :class="{
                active: mediaStore.workspacePaths.includes(favorite.relativePath),
                current: favorite.relativePath === mediaStore.currentDatePath,
                disabled: !favorite.exists,
              }"
            >
              <div class="favorite-main" @click="handleFavoriteWorkspaceToggle(favorite)">
                <div class="favorite-title-row">
                  <strong>{{ favorite.label }}</strong>
                  <div class="favorite-tags">
                    <el-tag v-if="favorite.pinned" size="small" type="warning">置顶</el-tag>
                    <el-tag v-if="favorite.relativePath === mediaStore.currentDatePath" size="small" type="primary">
                      当前日期
                    </el-tag>
                    <el-tag v-if="!favorite.exists" size="small" type="danger">失效</el-tag>
                    <el-tag size="small">{{ favorite.type }}</el-tag>
                  </div>
                </div>
                <div class="favorite-path">{{ favorite.relativePath }}</div>
              </div>
              <div class="favorite-actions">
                <el-button link :disabled="!favorite.exists" @click.stop="handleFavoriteWorkspaceToggle(favorite)">
                  {{ mediaStore.workspacePaths.includes(favorite.relativePath) ? '移出工作区' : '加入工作区' }}
                </el-button>
                <el-button
                  v-if="favorite.type === 'DATE'"
                  link
                  :disabled="!favorite.exists"
                  @click.stop="openDatePath(favorite.relativePath)"
                >
                  打开日期
                </el-button>
                <el-button link @click.stop="handleRenameFavorite(favorite)">重命名</el-button>
                <el-button link @click.stop="mediaStore.toggleFavoritePinned(favorite)">
                  {{ favorite.pinned ? '取消置顶' : '置顶' }}
                </el-button>
                <el-button link type="danger" @click.stop="handleDeleteFavorite(favorite)">删除</el-button>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无共享收藏" />
        </section>
      </aside>

      <main ref="contentAreaRef" class="content-area card-panel">
        <div class="workspace-header">
          <div>
            <h3>工作区</h3>
            <p class="workspace-subcopy">当前日期下所有款式默认展开；收藏目录可随时加入，支持跨年月混选。</p>
          </div>
          <div class="workspace-overview">
            <el-tag v-if="mediaStore.currentDatePath" type="primary" effect="dark">
              {{ currentDateTitle }}
            </el-tag>
            <el-tag type="success">{{ workspaceSections.length }} 个相册</el-tag>
            <el-tag type="info">{{ totalVisibleImageCount }} 张图片</el-tag>
            <div class="workspace-display-controls">
              <div class="display-switch" role="group" aria-label="工作区视图模式">
                <span class="density-switch-label">视图模式</span>
                <div class="density-switch-actions">
                  <el-button
                    size="small"
                    :type="workspaceView === 'stream' ? 'primary' : 'default'"
                    @click="workspaceView = 'stream'"
                  >
                    照片流
                  </el-button>
                  <el-button
                    size="small"
                    :type="workspaceView === 'albums' ? 'primary' : 'default'"
                    @click="workspaceView = 'albums'"
                  >
                    相册
                  </el-button>
                </div>
              </div>

              <div class="density-switch" role="group" aria-label="工作区显示密度">
                <span class="density-switch-label">显示密度</span>
                <div class="density-switch-actions">
                  <el-button
                    size="small"
                    :type="viewDensity === 'compact' ? 'primary' : 'default'"
                    @click="viewDensity = 'compact'"
                  >
                    紧凑
                  </el-button>
                  <el-button
                    size="small"
                    :type="viewDensity === 'comfortable' ? 'primary' : 'default'"
                    @click="viewDensity = 'comfortable'"
                  >
                    舒适
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section class="workspace-ribbon">
          <div class="ribbon-group">
            <div class="ribbon-label">日期快切</div>
            <div class="ribbon-items">
              <button
                v-for="path in quickDatePaths"
                :key="`workspace-date-${path}`"
                type="button"
                class="ribbon-pill"
                :class="{ active: path === mediaStore.currentDatePath }"
                @click="openDatePath(path)"
              >
                <span>{{ formatDateChip(path) }}</span>
                <small>{{ path.slice(0, 4) }}</small>
              </button>
            </div>
          </div>

          <div class="ribbon-group">
            <div class="ribbon-label">收藏联动</div>
            <div class="ribbon-items">
              <button
                v-for="favorite in linkedFavorites"
                :key="favorite.id"
                type="button"
                class="ribbon-pill ribbon-pill-favorite"
                :class="{ active: mediaStore.workspacePaths.includes(favorite.relativePath) }"
                :disabled="!favorite.exists"
                @click="handleFavoriteWorkspaceToggle(favorite)"
              >
                <span>{{ favorite.label }}</span>
                <small>
                  {{ mediaStore.workspacePaths.includes(favorite.relativePath) ? '已加入' : '加入工作区' }}
                </small>
              </button>
            </div>
          </div>
        </section>

        <div class="workspace-chips">
          <el-tag v-if="mediaStore.currentDatePath" type="primary">日期：{{ mediaStore.currentDatePath }}</el-tag>
          <el-tag
            v-for="path in mediaStore.workspacePaths"
            :key="path"
            closable
            @close="mediaStore.removeWorkspacePath(path)"
          >
            {{ favoriteMap.get(path)?.label || path }}
          </el-tag>
        </div>

        <template v-if="workspaceSections.length > 0 && workspaceView === 'stream'">
          <section class="workspace-section workspace-stream-panel">
            <div class="workspace-section-header">
              <div class="album-copy">
                <div class="album-title-row">
                  <h4>照片流视图</h4>
                  <el-tag size="small">{{ workspaceStreamItems.length }} 张</el-tag>
                </div>
                <div class="workspace-section-subtitle">瀑布流布局，按目录分组，适合快速浏览与选片</div>
              </div>
            </div>

            <div class="stream-group-list">
              <section v-for="group in workspaceStreamGroups" :key="group.key" class="stream-group">
                <div class="stream-group-header" :data-path="group.key.substring(group.key.indexOf(':') + 1)" @click="toggleSectionCollapse(group.key)">
                  <div class="stream-group-copy">
                    <div class="album-title-row">
                      <el-icon class="collapse-icon" :class="{ collapsed: collapsedSections.has(group.key) }"><ArrowRight /></el-icon>
                      <h4>{{ group.title }}</h4>
                      <el-tag size="small">{{ group.items.length }} 张</el-tag>
                      <el-tag v-if="group.favorite" size="small" type="warning">收藏</el-tag>
                    </div>
                    <div class="workspace-section-subtitle">{{ group.subtitle }}</div>
                  </div>
                </div>

                <Transition name="collapse">
                  <div v-if="!collapsedSections.has(group.key)" class="media-masonry" :data-path="group.key.substring(group.key.indexOf(':') + 1)">
                  <article
                    v-for="(entry, entryIndex) in group.items"
                    :key="entry.key"
                    class="media-card media-card-stream"
                    :class="{ selected: selectionStore.isSelected(entry.item.assetKey) }"
                    @click="toggleItemSelection(entry.item)"
                  >
                    <div class="media-thumb-wrap media-thumb-wrap-stream">
                      <SmartMediaImage
                        :src="entry.item.thumbUrl"
                        :alt="getStreamMetaText(entry)"
                        :title="getStreamMetaText(entry)"
                        variant="natural"
                        :loading="entryIndex < 8 ? 'eager' : 'lazy'"
                        :fetchpriority="entryIndex < 4 ? 'high' : 'auto'"
                      />
                      <div class="media-card-toolbar">
                        <el-checkbox :model-value="selectionStore.isSelected(entry.item.assetKey)" />
                        <el-button link @click.stop="previewStreamImage(entry)">预览</el-button>
                      </div>
                      <div
                        v-if="selectionStore.isSelected(entry.item.assetKey)"
                        class="media-selected-badge"
                      >
                        已选
                      </div>
                      <div class="media-meta-overlay">
                        <div class="media-section-chip">
                          {{ entry.favorite?.label || entry.sectionTitle }}
                        </div>
                        <div class="media-filename">{{ entry.item.filename }}</div>
                        <div class="media-parent">{{ entry.item.parentPath }}</div>
                      </div>
                    </div>
                  </article>
                </div>
                  </Transition>
              </section>
            </div>
          </section>
        </template>

        <template v-else-if="workspaceSections.length > 0">
          <section v-for="section in workspaceSections" :key="section.key" class="workspace-section">
            <div class="workspace-section-header" @click="toggleSectionCollapse(section.key)">
              <div class="album-meta">
                <div class="album-cover-shell">
                  <img
                    v-if="section.coverUrl"
                    :src="section.coverUrl"
                    :alt="section.title"
                    class="album-cover"
                    loading="lazy"
                  />
                  <div v-else class="album-cover album-cover-placeholder">📁</div>
                </div>
                <div class="album-copy">
                  <div class="album-title-row">
                    <el-icon class="collapse-icon" :class="{ collapsed: collapsedSections.has(section.key) }"><ArrowRight /></el-icon>
                    <h4>{{ section.title }}</h4>
                    <el-tag size="small">{{ section.items.length }} 张</el-tag>
                    <el-tag v-if="section.favorite" size="small" type="warning">已收藏</el-tag>
                  </div>
                  <div class="workspace-section-subtitle">{{ section.subtitle }}</div>
                </div>
              </div>

              <div class="workspace-section-actions">
                <el-button link @click.stop="handleFavoritePath(section.relativePath, section.title)">收藏目录</el-button>
                <el-button
                  v-if="mediaStore.workspacePaths.includes(section.relativePath)"
                  link
                  @click.stop="mediaStore.removeWorkspacePath(section.relativePath)"
                >
                  移出工作区
                </el-button>
              </div>
            </div>

            <div v-if="section.loading" class="section-loading">
              <el-skeleton :rows="3" animated />
            </div>
            <div v-else-if="section.items.length > 0 && !collapsedSections.has(section.key)" class="media-grid">
              <article
                v-for="(item, itemIndex) in section.items"
                :key="item.assetKey"
                class="media-card"
                :class="{ selected: selectionStore.isSelected(item.assetKey) }"
                @click="toggleItemSelection(item)"
              >
                <div class="media-thumb-wrap">
                  <SmartMediaImage
                    :src="item.thumbUrl"
                    :alt="getMediaMetaText(item)"
                    :title="getMediaMetaText(item)"
                    variant="square"
                    :loading="itemIndex < 8 ? 'eager' : 'lazy'"
                    :fetchpriority="itemIndex < 4 ? 'high' : 'auto'"
                  />
                  <div class="media-card-toolbar">
                    <el-checkbox :model-value="selectionStore.isSelected(item.assetKey)" />
                    <el-button link @click.stop="previewImage(section, item)">预览</el-button>
                  </div>
                  <div v-if="selectionStore.isSelected(item.assetKey)" class="media-selected-badge">已选</div>
                  <div class="media-meta-overlay">
                    <div class="media-filename">{{ item.filename }}</div>
                    <div class="media-parent">{{ item.parentPath }}</div>
                  </div>
                </div>
              </article>
            </div>
            <el-empty v-else description="该目录暂无图片" />
          </section>
        </template>
        <el-empty v-else description="请选择左侧日期目录或将收藏加入工作区" />
      </main>

      <aside class="sidebar-right">
        <section class="card-panel section-panel sidebar-panel basket-panel" >
          <div class="section-header">
            <div>
              <h3>选片篮</h3>
              <p class="section-helper">支持跨日期、跨收藏目录同时选图，也可拖拽排序</p>
            </div>
            <el-tag size="small" type="success">{{ selectionStore.selectedCount }} 张</el-tag>
          </div>

          <div v-if="selectionGroups.length > 0" class="selection-summary">
            <el-tag v-for="group in selectionGroups" :key="group.path" size="small" effect="plain">
              {{ group.label }} · {{ group.count }} 张
            </el-tag>
          </div>

          <div class="action-buttons">
            <el-dropdown @command="(type: string) => openActionDialog(type as MediaActionDefinition['type'])">
              <el-button type="primary" :disabled="selectionStore.selectedCount === 0">
                动作派发 <el-icon class="el-icon--right"><arrow-down /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="definition in mediaStore.actionDefinitions"
                    :key="definition.type"
                    :command="definition.type"
                  >
                    {{ getActionButtonLabel(definition.type) }}
                  </el-dropdown-item>
                  <el-dropdown-item command="image-recognition">
                    图片识别
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button @click="selectionStore.clearSelections()" :disabled="selectionStore.selectedCount === 0">
              清空
            </el-button>
          </div>

          <div
            v-if="selectionStore.selectedItems.length > 0"
            ref="selectionListRef"
            class="selection-list"
            style="flex: 1; overflow-y: auto; min-height: 0;"
          >
            <div
              v-for="(item, itemIndex) in selectionStore.selectedItems"
              :key="item.assetKey"
              :data-asset-key="item.assetKey"
              class="selection-item"
              :class="{
                dragging: draggedSelectionAssetKey === item.assetKey,
                'drop-before':
                  selectionDropTarget?.assetKey === item.assetKey &&
                  selectionDropTarget.position === 'before',
                'drop-after':
                  selectionDropTarget?.assetKey === item.assetKey &&
                  selectionDropTarget.position === 'after',
              }"
            >
              <img
                :src="item.thumbUrl"
                :alt="item.filename"
                class="selection-thumb"
                loading="lazy"
                draggable="false"
              />
              <div class="selection-order-badge">{{ itemIndex + 1 }}</div>
              <div class="selection-meta">
                <div class="selection-name">{{ item.filename }}</div>
                <div class="selection-path">{{ item.parentPath }}</div>
              </div>
              <div class="selection-item-actions">
                <button
                  class="selection-drag-handle"
                  type="button"
                  title="拖拽调整顺序"
                  @pointerdown="handleSelectionHandlePointerDown(item.assetKey, $event)"
                >
                  ⋮⋮
                </button>
                <el-button link @click="previewStandalone(item)">预览</el-button>
                <el-button link type="danger" @click="selectionStore.removeSelection(item.assetKey)">移除</el-button>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂未选择图片" />
        </section>

        <section class="card-panel section-panel sidebar-panel recent-panel" >
          <div class="section-header">
            <div>
              <h3>最近动作</h3>
              <p class="section-helper">仅负责创建和跟踪外部任务状态</p>
            </div>
            <el-button link @click="mediaStore.refreshRecentActions()">刷新</el-button>
          </div>
          <div v-if="mediaStore.recentActions.length > 0" class="recent-actions" style="flex: 1; overflow-y: auto; min-height: 0;">
            <div v-for="action in mediaStore.recentActions" :key="action.id" class="recent-action-item">
              <div class="recent-action-top">
                <strong>{{ getActionLabel(action.actionType) }}</strong>
                <el-tag :type="getActionStatusType(action.status)" size="small">{{ action.status }}</el-tag>
              </div>
              <div class="recent-action-meta">
                {{ formatDateTime(action.createdAt) }} · {{ action.assets.length }} 张
              </div>
              <div v-if="action.operator" class="recent-action-detail">操作人：{{ action.operator }}</div>
              <div v-if="action.externalTaskId" class="recent-action-detail">
                外部任务：{{ action.externalTaskId }}
              </div>
              <div v-if="action.error" class="recent-action-error">{{ action.error }}</div>
            </div>
          </div>
          <el-empty v-else description="暂无动作记录" />
        </section>
      </aside>
    </div>

    <el-dialog v-model="actionDialogVisible" :title="activeActionDefinition?.label || '动作派发'" width="520px">
      <el-form label-width="96px">
        <el-form-item label="操作人">
          <el-input v-model="actionForm.operator" placeholder="可选，记录是谁发起的" />
        </el-form-item>
        <el-form-item v-for="field in activeActionDefinition?.fields || []" :key="field.key" :label="field.label">
          <el-input
            v-if="field.type === 'text'"
            v-model="actionForm.formData[field.key]"
            :placeholder="field.placeholder"
          />
          <el-input
            v-else
            v-model="actionForm.formData[field.key]"
            type="textarea"
            :rows="4"
            :placeholder="field.placeholder"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="actionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingAction" @click="submitAction">提交动作</el-button>
      </template>
    </el-dialog>

    <!-- 图片识别对话框 -->
    <el-dialog v-model="imageRecognitionVisible" title="图片识别" width="600px">
      <el-form label-width="100px">
        <el-form-item label="选中的图片">
          <div class="recognition-images">
            <div
              v-for="item in selectionStore.selectedItems"
              :key="item.assetKey"
              class="recognition-image-item"
            >
              <img :src="item.thumbUrl" :alt="item.filename" class="recognition-thumb" />
              <div class="recognition-image-name">{{ item.filename }}</div>
            </div>
          </div>
          <div class="recognition-count">共 {{ selectionStore.selectedCount }} 张图片</div>
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="imageRecognitionForm.operator" placeholder="可选，记录是谁发起的" />
        </el-form-item>
        <el-form-item label="提示词覆盖">
          <el-input
            v-model="imageRecognitionForm.promptOverride"
            type="textarea"
            :rows="3"
            placeholder="可选，临时覆盖默认提示词"
          />
        </el-form-item>
        <el-form-item label="识别方式">
          <el-switch
            v-model="imageRecognitionForm.useApiMode"
            active-text="API 识别"
            inactive-text="浏览器识别"
            :disabled="true"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="imageRecognitionVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingAction" @click="submitImageRecognitionAction">
          提交识别
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      :title="previewCurrentItem ? `${previewSectionTitle} · ${previewCurrentItem.filename}` : '图片预览'"
      width="1080px"
      @closed="resetPreview"
    >
      <template v-if="previewCurrentItem">
        <div class="preview-stage-toolbar">
          <div class="preview-stage-meta">
            <strong>{{ previewCurrentItem.filename }}</strong>
            <span>{{ previewCurrentItem.parentPath }}</span>
          </div>
          <div class="preview-stage-actions">
            <el-button :disabled="previewIndex === 0" @click="shiftPreview(-1)">上一张</el-button>
            <el-button :disabled="previewIndex >= previewItems.length - 1" @click="shiftPreview(1)">
              下一张
            </el-button>
            <el-button type="primary" plain @click="togglePreviewSelection">
              {{ selectionStore.isSelected(previewCurrentItem.assetKey) ? '取消选中' : '加入选片篮' }}
            </el-button>
          </div>
        </div>

        <div class="preview-wrapper">
          <img :src="previewCurrentItem.fileUrl" :alt="previewCurrentItem.filename" class="preview-image" />
        </div>

        <div v-if="previewItems.length > 1" class="preview-filmstrip">
          <button
            v-for="(item, index) in previewItems"
            :key="item.assetKey"
            type="button"
            class="filmstrip-item"
            :class="{ active: index === previewIndex }"
            @click="setPreviewIndex(index)"
          >
            <img :src="item.thumbUrl" :alt="item.filename" class="filmstrip-thumb" loading="lazy" />
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/* biome-ignore-all lint/correctness/noUnusedVariables lint/correctness/noUnusedImports: Vue <script setup> bindings are consumed by the template. */

import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { MediaActionDefinition, MediaFavoritePath, MediaItem } from '@/api/media';
import { getMediaFileUrl, getMediaThumbUrl } from '@/api/media';
import SmartMediaImage from '@/components/media/SmartMediaImage.vue';
import { useMediaLibraryStore } from '@/stores/media-library.store';
import { type SelectedMediaItem, useMediaSelectionStore } from '@/stores/media-selection.store';

interface DateTreeNode {
  key: string;
  label: string;
  isDate?: boolean;
  datePath?: string;
  isFolder?: boolean;
  children?: DateTreeNode[];
  loading?: boolean;
}

interface WorkspaceSection {
  key: string;
  title: string;
  subtitle: string;
  relativePath: string;
  items: SelectedMediaItem[];
  loading: boolean;
  coverUrl: string | null;
  favorite: MediaFavoritePath | null;
  collapsed?: boolean;
}

interface WorkspaceStreamItem {
  key: string;
  sectionTitle: string;
  sectionSubtitle: string;
  relativePath: string;
  item: SelectedMediaItem;
  favorite: MediaFavoritePath | null;
}

interface WorkspaceStreamGroup {
  key: string;
  title: string;
  subtitle: string;
  favorite: MediaFavoritePath | null;
  items: WorkspaceStreamItem[];
}

const mediaStore = useMediaLibraryStore();
const selectionStore = useMediaSelectionStore();
const router = useRouter();
const actionDialogVisible = ref(false);
const previewDialogVisible = ref(false);
const selectionListRef = ref<HTMLElement | null>(null);
const previewItems = ref<SelectedMediaItem[]>([]);
const previewIndex = ref(0);
const previewSectionTitle = ref('预览');
const viewDensity = ref<'compact' | 'comfortable'>('compact');
const workspaceView = ref<'stream' | 'albums'>('stream');
const activeActionType = ref<MediaActionDefinition['type'] | null>(null);
const submittingAction = ref(false);
const draggedSelectionAssetKey = ref<string | null>(null);
const selectionDropTarget = ref<{
  assetKey: string;
  position: 'before' | 'after';
} | null>(null);
const collapsedSections = ref(new Set<string>());
const selectionAutoScrollVelocity = ref(0);
const contentAreaRef = ref<HTMLElement | null>(null);
const actionForm = reactive({
  operator: '',
  formData: {} as Record<string, string>,
});
const imageRecognitionVisible = ref(false);
const imageRecognitionForm = reactive({
  operator: '',
  promptOverride: '',
  useApiMode: true,
});
const thumbPreloadCache = new Set<string>();
let selectionAutoScrollFrame: number | null = null;
let selectionPointerDragState: {
  assetKey: string;
  pointerId: number;
  startY: number;
} | null = null;
const actionButtonLabelMap: Record<string, string> = {
  'wx-work-post': '企业微信',
  'wechat-article': '公众号',
  'image-to-image': '图生图',
  'image-recognition': '图片识别',
};

const dateTreeNodes = computed<DateTreeNode[]>(() => {
  return mediaStore.dateTree.map((year) => ({
    key: year.path,
    label: year.label,
    children: year.months.map((month) => ({
      key: month.path,
      label: month.label,
      children: month.dates.map((date) => {
        const summary = mediaStore.getFolderSummaryForPath(date.path);
        const folderChildren: DateTreeNode[] =
          summary?.folders.map((folder) => ({
            key: folder.relativePath,
            label: folder.name,
            isFolder: true,
            datePath: date.path,
          })) || [];

        return {
          key: date.path,
          label: date.label,
          isDate: true,
          datePath: date.path,
          children: folderChildren,
        };
      }),
    })),
  }));
});

const favoriteMap = computed(() => {
  return new Map(mediaStore.favorites.map((favorite) => [favorite.relativePath, favorite]));
});

const activeActionDefinition = computed(() => {
  return (
    mediaStore.actionDefinitions.find((definition) => definition.type === activeActionType.value) ||
    null
  );
});

const currentDateTitle = computed(() => {
  if (!mediaStore.currentDatePath) {
    return '未选择日期';
  }

  return mediaStore.currentDatePath.split('/').join(' / ');
});

const quickDatePaths = computed<string[]>(() => {
  const paths = mediaStore.availableDatePaths;
  if (paths.length === 0) {
    return [];
  }

  const currentIndex = paths.indexOf(mediaStore.currentDatePath);
  if (currentIndex === -1) {
    return paths.slice(0, 8);
  }

  const start = Math.max(0, currentIndex - 2);
  const end = Math.min(paths.length, currentIndex + 4);
  return paths.slice(start, end);
});

const linkedFavorites = computed(() => {
  const favorites: MediaFavoritePath[] = [];
  const seenIds = new Set<string>();
  const currentDatePath = mediaStore.currentDatePath;

  if (currentDatePath) {
    for (const favorite of mediaStore.favorites) {
      if (
        favorite.relativePath === currentDatePath ||
        favorite.relativePath.startsWith(`${currentDatePath}/`)
      ) {
        favorites.push(favorite);
        seenIds.add(favorite.id);
      }
    }
  }

  for (const favorite of mediaStore.favorites) {
    if (seenIds.has(favorite.id)) {
      continue;
    }
    if (favorite.pinned || favorite.type === 'DATE') {
      favorites.push(favorite);
      seenIds.add(favorite.id);
    }
  }

  return favorites.slice(0, 10);
});

function toSelectedMediaItem(item: MediaItem): SelectedMediaItem {
  return {
    assetKey: item.assetKey,
    rootId: item.rootId,
    relativePath: item.relativePath,
    filename: item.filename,
    parentPath: item.parentPath,
    thumbUrl: getMediaThumbUrl(item.assetKey),
    fileUrl: getMediaFileUrl(item.assetKey),
    mimeType: item.mimeType,
  };
}

function getMediaMetaText(item: SelectedMediaItem) {
  return `${item.filename} · ${item.parentPath}`;
}

function getStreamMetaText(entry: WorkspaceStreamItem) {
  return `${entry.item.filename} · ${entry.sectionTitle} · ${entry.item.parentPath}`;
}

function preloadThumbs(urls: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  for (const url of urls) {
    if (!url || thumbPreloadCache.has(url)) {
      continue;
    }

    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    thumbPreloadCache.add(url);
  }
}

function buildSectionsForPath(path: string, sourceLabel: string): WorkspaceSection[] {
  if (!path) {
    return [];
  }

  if (mediaStore.isDatePath(path)) {
    const summary = mediaStore.getFolderSummaryForPath(path);
    if (!summary) {
      return [
        {
          key: `loading:${path}`,
          title: sourceLabel,
          subtitle: path,
          relativePath: path,
          items: [],
          loading: true,
          coverUrl: null,
          favorite: favoriteMap.value.get(path) || null,
        },
      ];
    }

    return summary.folders.map((folder) => {
      const items = mediaStore.getItemsForPath(folder.relativePath).map(toSelectedMediaItem);
      return {
        key: `${sourceLabel}:${folder.relativePath}`,
        title: folder.name,
        subtitle: `${sourceLabel} · ${path}`,
        relativePath: folder.relativePath,
        items,
        loading: Boolean(mediaStore.loadingPaths[path]),
        coverUrl: items[0]?.thumbUrl || null,
        favorite: favoriteMap.value.get(folder.relativePath) || null,
      } satisfies WorkspaceSection;
    });
  }

  const items = mediaStore.getItemsForPath(path).map(toSelectedMediaItem);
  return [
    {
      key: `${sourceLabel}:${path}`,
      title: sourceLabel,
      subtitle: path,
      relativePath: path,
      items,
      loading: Boolean(mediaStore.loadingPaths[path]),
      coverUrl: items[0]?.thumbUrl || null,
      favorite: favoriteMap.value.get(path) || null,
    },
  ];
}

const workspaceSections = computed(() => {
  const sections: WorkspaceSection[] = [];
  const seenPaths = new Set<string>();

  if (mediaStore.currentDatePath) {
    for (const section of buildSectionsForPath(mediaStore.currentDatePath, '当前日期')) {
      sections.push(section);
      seenPaths.add(section.relativePath);
    }
  }

  for (const path of mediaStore.workspacePaths) {
    const favorite = favoriteMap.value.get(path);
    for (const section of buildSectionsForPath(path, favorite?.label || '收藏目录')) {
      if (seenPaths.has(section.relativePath)) {
        continue;
      }
      sections.push(section);
      seenPaths.add(section.relativePath);
    }
  }

  return sections;
});

const workspaceStreamItems = computed<WorkspaceStreamItem[]>(() => {
  return workspaceSections.value.flatMap((section) =>
    section.items.map((item) => ({
      key: item.assetKey,
      sectionTitle: section.title,
      sectionSubtitle: section.subtitle,
      relativePath: section.relativePath,
      item,
      favorite: section.favorite,
    }))
  );
});

const workspaceStreamGroups = computed<WorkspaceStreamGroup[]>(() => {
  return workspaceSections.value
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      key: section.key,
      title: section.favorite?.label || section.title,
      subtitle: section.subtitle,
      favorite: section.favorite,
      items: section.items.map((item) => ({
        key: item.assetKey,
        sectionTitle: section.title,
        sectionSubtitle: section.subtitle,
        relativePath: section.relativePath,
        item,
        favorite: section.favorite,
      })),
    }));
});

const totalVisibleImageCount = computed(() => {
  return workspaceSections.value.reduce((sum, section) => sum + section.items.length, 0);
});

const selectionGroups = computed(() => {
  const groupMap = new Map<string, { path: string; label: string; count: number }>();

  for (const item of selectionStore.selectedItems) {
    const current = groupMap.get(item.parentPath);
    if (current) {
      current.count += 1;
      continue;
    }

    groupMap.set(item.parentPath, {
      path: item.parentPath,
      label: item.parentPath.split('/').pop() || item.parentPath,
      count: 1,
    });
  }

  return Array.from(groupMap.values()).sort(
    (left, right) => right.count - left.count || left.path.localeCompare(right.path, 'zh-CN')
  );
});

const previewCurrentItem = computed(() => {
  return previewItems.value[previewIndex.value] || null;
});

function handleDateNodeClick(node: DateTreeNode) {
  if (node.isFolder && node.datePath) {
    // First scroll to the target (it may not exist yet)
    scrollToFolder(node.key);
    // Open the date (async) - after it completes, scroll again
    void mediaStore.openDate(node.datePath).then(() => {
      // After date is loaded, scroll again to ensure we're at the right position
      setTimeout(() => scrollToFolder(node.key), 400);
    });
  } else if (node.isDate && node.datePath) {
    void mediaStore.openDate(node.datePath);
  }
}

async function openDatePath(path: string) {
  await mediaStore.openDate(path);
}

function scrollToFolder(relativePath: string) {
  setTimeout(() => {
    const contentArea = contentAreaRef.value;
    const masonry = contentArea?.querySelector(
      `.media-masonry[data-path="${CSS.escape(relativePath)}"]`
    );
    if (masonry) {
      masonry.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 300);
}

async function refreshAll() {
  await mediaStore.initialize();
}

function toggleItemSelection(item: SelectedMediaItem) {
  selectionStore.toggleSelection(item);
}

function previewImage(section: WorkspaceSection, item: SelectedMediaItem) {
  previewItems.value = section.items;
  previewIndex.value = Math.max(
    0,
    section.items.findIndex((currentItem) => currentItem.assetKey === item.assetKey)
  );
  previewSectionTitle.value = section.title;
  previewDialogVisible.value = true;
}

function previewStreamImage(entry: WorkspaceStreamItem) {
  previewItems.value = workspaceStreamItems.value.map((streamItem) => streamItem.item);
  previewIndex.value = Math.max(
    0,
    workspaceStreamItems.value.findIndex(
      (streamItem) => streamItem.item.assetKey === entry.item.assetKey
    )
  );
  previewSectionTitle.value = '照片流';
  previewDialogVisible.value = true;
}

function previewStandalone(item: SelectedMediaItem) {
  previewItems.value = [item];
  previewIndex.value = 0;
  previewSectionTitle.value = item.parentPath.split('/').pop() || item.parentPath;
  previewDialogVisible.value = true;
}

function stopSelectionAutoScroll() {
  selectionAutoScrollVelocity.value = 0;

  if (selectionAutoScrollFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(selectionAutoScrollFrame);
    selectionAutoScrollFrame = null;
  }
}

function runSelectionAutoScroll() {
  if (selectionAutoScrollFrame !== null || typeof window === 'undefined') {
    return;
  }

  const tick = () => {
    const listElement = selectionListRef.value;
    const velocity = selectionAutoScrollVelocity.value;

    if (!listElement || !velocity) {
      selectionAutoScrollFrame = null;
      return;
    }

    listElement.scrollTop += velocity;
    selectionAutoScrollFrame = window.requestAnimationFrame(tick);
  };

  selectionAutoScrollFrame = window.requestAnimationFrame(tick);
}

function updateSelectionAutoScroll(clientY: number) {
  const listElement = selectionListRef.value;
  if (!listElement || !draggedSelectionAssetKey.value) {
    stopSelectionAutoScroll();
    return;
  }

  const rect = listElement.getBoundingClientRect();
  const threshold = 72;
  const maxVelocity = 18;
  let nextVelocity = 0;

  if (clientY < rect.top + threshold) {
    nextVelocity = -Math.ceil(((rect.top + threshold - clientY) / threshold) * maxVelocity);
  } else if (clientY > rect.bottom - threshold) {
    nextVelocity = Math.ceil(((clientY - (rect.bottom - threshold)) / threshold) * maxVelocity);
  }

  selectionAutoScrollVelocity.value = nextVelocity;

  if (nextVelocity === 0) {
    stopSelectionAutoScroll();
    return;
  }

  runSelectionAutoScroll();
}

function cleanupSelectionPointerListeners() {
  if (typeof window === 'undefined') {
    return;
  }

  window.removeEventListener('pointermove', handleSelectionPointerMove);
  window.removeEventListener('pointerup', handleSelectionPointerUp);
  window.removeEventListener('pointercancel', handleSelectionPointerUp);
}

function resetSelectionDragState() {
  cleanupSelectionPointerListeners();
  selectionPointerDragState = null;
  draggedSelectionAssetKey.value = null;
  selectionDropTarget.value = null;
  stopSelectionAutoScroll();
}

function updateSelectionDropTargetFromPointer(sourceAssetKey: string, clientY: number) {
  const listElement = selectionListRef.value;
  if (!listElement) {
    selectionDropTarget.value = null;
    return;
  }

  const candidateElements = Array.from(
    listElement.querySelectorAll<HTMLElement>('.selection-item[data-asset-key]')
  ).filter((element) => element.dataset.assetKey && element.dataset.assetKey !== sourceAssetKey);

  if (candidateElements.length === 0) {
    selectionDropTarget.value = null;
    return;
  }

  const firstElement = candidateElements[0];
  const lastElement = candidateElements[candidateElements.length - 1];

  if (clientY <= firstElement.getBoundingClientRect().top) {
    selectionDropTarget.value = {
      assetKey: firstElement.dataset.assetKey || '',
      position: 'before',
    };
    return;
  }

  if (lastElement && clientY >= lastElement.getBoundingClientRect().bottom) {
    selectionDropTarget.value = {
      assetKey: lastElement.dataset.assetKey || '',
      position: 'after',
    };
    return;
  }

  for (const element of candidateElements) {
    const assetKey = element.dataset.assetKey;
    if (!assetKey) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) {
      continue;
    }

    selectionDropTarget.value = {
      assetKey,
      position: clientY >= rect.top + rect.height / 2 ? 'after' : 'before',
    };
    return;
  }

  let nearestElement: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const element of candidateElements) {
    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - centerY);

    if (distance < nearestDistance) {
      nearestElement = element;
      nearestDistance = distance;
    }
  }

  if (!nearestElement || !nearestElement.dataset.assetKey) {
    selectionDropTarget.value = null;
    return;
  }

  const nearestRect = nearestElement.getBoundingClientRect();
  selectionDropTarget.value = {
    assetKey: nearestElement.dataset.assetKey,
    position: clientY >= nearestRect.top + nearestRect.height / 2 ? 'after' : 'before',
  };
}

function handleSelectionHandlePointerDown(assetKey: string, event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  selectionPointerDragState = {
    assetKey,
    pointerId: event.pointerId,
    startY: event.clientY,
  };
  selectionDropTarget.value = null;

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', handleSelectionPointerMove);
    window.addEventListener('pointerup', handleSelectionPointerUp);
    window.addEventListener('pointercancel', handleSelectionPointerUp);
  }

  const handleElement = event.currentTarget;
  if (handleElement instanceof HTMLElement && handleElement.setPointerCapture) {
    handleElement.setPointerCapture(event.pointerId);
  }

  event.preventDefault();
}

function handleSelectionPointerMove(event: PointerEvent) {
  const pointerState = selectionPointerDragState;
  if (!pointerState || event.pointerId !== pointerState.pointerId) {
    return;
  }

  if (!draggedSelectionAssetKey.value) {
    const moveDistance = Math.abs(event.clientY - pointerState.startY);
    if (moveDistance < 4) {
      return;
    }
    draggedSelectionAssetKey.value = pointerState.assetKey;
  }

  updateSelectionAutoScroll(event.clientY);
  updateSelectionDropTargetFromPointer(pointerState.assetKey, event.clientY);
  event.preventDefault();
}

function handleSelectionPointerUp(event: PointerEvent) {
  const pointerState = selectionPointerDragState;
  if (!pointerState || event.pointerId !== pointerState.pointerId) {
    return;
  }

  if (draggedSelectionAssetKey.value && selectionDropTarget.value?.assetKey) {
    selectionStore.moveSelection(
      draggedSelectionAssetKey.value,
      selectionDropTarget.value.assetKey,
      selectionDropTarget.value.position
    );
  }

  resetSelectionDragState();
}

function setPreviewIndex(index: number) {
  if (index < 0 || index >= previewItems.value.length) {
    return;
  }
  previewIndex.value = index;
}

function shiftPreview(step: number) {
  setPreviewIndex(previewIndex.value + step);
}

function resetPreview() {
  previewItems.value = [];
  previewIndex.value = 0;
  previewSectionTitle.value = '预览';
}

function togglePreviewSelection() {
  if (!previewCurrentItem.value) {
    return;
  }
  toggleItemSelection(previewCurrentItem.value);
}

async function handleFavoritePath(path: string, defaultLabel?: string) {
  if (!path) {
    return;
  }

  const existing = favoriteMap.value.get(path);
  if (existing) {
    ElMessage.info('该路径已在共享收藏中');
    return;
  }

  await mediaStore.createFavorite(path, defaultLabel);
  ElMessage.success('已加入共享收藏');
}

async function toggleCurrentDateFavorite() {
  if (!mediaStore.currentDatePath) {
    return;
  }

  if (mediaStore.currentDateFavorite) {
    await mediaStore.removeFavorite(mediaStore.currentDateFavorite.id);
    mediaStore.removeWorkspacePath(mediaStore.currentDatePath);
    ElMessage.success('已取消当前日期收藏');
    return;
  }

  await handleFavoritePath(mediaStore.currentDatePath, currentDateTitle.value);
}

async function handleFavoriteWorkspaceToggle(favorite: MediaFavoritePath) {
  if (!favorite.exists) {
    ElMessage.warning('该收藏路径已失效');
    return;
  }

  if (favorite.relativePath === mediaStore.currentDatePath) {
    ElMessage.info('当前日期已在工作台展示');
    return;
  }

  if (mediaStore.workspacePaths.includes(favorite.relativePath)) {
    mediaStore.removeWorkspacePath(favorite.relativePath);
    return;
  }

  await mediaStore.addWorkspacePath(favorite.relativePath);
}

async function handleRenameFavorite(favorite: MediaFavoritePath) {
  try {
    const promptResult = await ElMessageBox.prompt('请输入新的收藏名称', '重命名收藏', {
      inputValue: favorite.label,
    });
    if (typeof promptResult !== 'object' || !('value' in promptResult)) {
      return;
    }
    await mediaStore.renameFavorite(favorite.id, promptResult.value);
    ElMessage.success('收藏名称已更新');
  } catch (error) {
    if (!isDialogDismissed(error)) {
      ElMessage.error('更新收藏名称失败');
    }
  }
}

async function handleDeleteFavorite(favorite: MediaFavoritePath) {
  try {
    await ElMessageBox.confirm(`确定删除共享收藏“${favorite.label}”吗？`, '删除收藏', {
      type: 'warning',
    });
    await mediaStore.removeFavorite(favorite.id);
    mediaStore.removeWorkspacePath(favorite.relativePath);
    ElMessage.success('收藏已删除');
  } catch (error) {
    if (!isDialogDismissed(error)) {
      ElMessage.error('删除收藏失败');
    }
  }
}

function openActionDialog(actionType: MediaActionDefinition['type']) {
  if (actionType === 'image-to-image') {
    void router.push({ name: 'MediaImageToImage' });
    return;
  }

  if (actionType === 'image-recognition') {
    imageRecognitionForm.operator = '';
    imageRecognitionForm.promptOverride = '';
    imageRecognitionForm.useApiMode = true;
    imageRecognitionVisible.value = true;
    return;
  }

  activeActionType.value = actionType;
  actionForm.operator = '';
  actionForm.formData = {};
  for (const field of activeActionDefinition.value?.fields || []) {
    actionForm.formData[field.key] = '';
  }
  actionDialogVisible.value = true;
}

async function submitImageRecognitionAction() {
  if (selectionStore.selectedCount === 0) {
    ElMessage.warning('请先选择至少一张图片');
    return;
  }

  submittingAction.value = true;
  try {
    const formData: Record<string, unknown> = {
      promptOverride: imageRecognitionForm.promptOverride || null,
      useApiMode: imageRecognitionForm.useApiMode,
    };

    await mediaStore.submitAction({
      actionType: 'image-recognition',
      operator: imageRecognitionForm.operator || undefined,
      assets: selectionStore.selectedItems.map((item) => ({
        rootId: item.rootId,
        relativePath: item.relativePath,
      })),
      formData,
      context: {
        workspaceDatePath: mediaStore.currentDatePath || undefined,
        favoritePaths: mediaStore.workspacePaths,
      },
    });

    imageRecognitionVisible.value = false;
    ElMessage.success('图片识别任务已提交');
    await mediaStore.refreshRecentActions();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '提交失败');
  } finally {
    submittingAction.value = false;
  }
}

async function submitAction() {
  if (!activeActionDefinition.value) {
    return;
  }

  if (selectionStore.selectedCount === 0) {
    ElMessage.warning('请先选择至少一张图片');
    return;
  }

  const missingField = activeActionDefinition.value.fields.find(
    (field) => field.required && !String(actionForm.formData[field.key] || '').trim()
  );
  if (missingField) {
    ElMessage.warning(`请填写：${missingField.label}`);
    return;
  }

  submittingAction.value = true;
  try {
    await mediaStore.submitAction({
      actionType: activeActionDefinition.value.type,
      operator: actionForm.operator || undefined,
      assets: selectionStore.selectedItems.map((item) => ({
        rootId: item.rootId,
        relativePath: item.relativePath,
      })),
      formData: actionForm.formData,
      context: {
        workspaceDatePath: mediaStore.currentDatePath || undefined,
        favoritePaths: mediaStore.workspacePaths,
      },
    });
    actionDialogVisible.value = false;
    selectionStore.clearSelections();
    ElMessage.success('动作任务已创建');
  } finally {
    submittingAction.value = false;
  }
}

function getActionLabel(actionType: string) {
  return (
    mediaStore.actionDefinitions.find((definition) => definition.type === actionType)?.label ||
    actionType
  );
}

function getActionButtonLabel(actionType: MediaActionDefinition['type']) {
  return actionButtonLabelMap[actionType] || getActionLabel(actionType);
}

function getActionStatusType(status: string) {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'RUNNING':
    case 'DISPATCHING':
      return 'warning';
    default:
      return 'info';
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function toggleSectionCollapse(key: string) {
  if (collapsedSections.value.has(key)) {
    collapsedSections.value.delete(key);
  } else {
    collapsedSections.value.add(key);
  }
  collapsedSections.value = new Set(collapsedSections.value);
}

function formatDateChip(path: string) {
  return path.split('/').slice(-2).join(' / ');
}

function isDialogDismissed(error: unknown) {
  return error === 'cancel' || error === 'close';
}

watch(
  [workspaceView, workspaceSections, workspaceStreamItems],
  () => {
    if (workspaceView.value === 'stream') {
      preloadThumbs(workspaceStreamItems.value.slice(0, 120).map((entry) => entry.item.thumbUrl));
      return;
    }

    preloadThumbs(
      workspaceSections.value.flatMap((section) =>
        section.items.slice(0, 32).map((item) => item.thumbUrl)
      )
    );
  },
  { immediate: true }
);

onMounted(() => {
  void mediaStore.initialize();
});

onBeforeUnmount(() => {
  stopSelectionAutoScroll();
});
</script>

<style scoped>
.media-library-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  --workspace-section-padding: 14px;
  --workspace-section-gap: 12px;
  --album-cover-size: 64px;
  --album-cover-radius: 16px;
  --album-meta-gap: 12px;
  --media-grid-min-width: 168px;
  --media-grid-gap: 12px;
  --media-card-radius: 14px;
  --media-toolbar-inset: 8px;
  --stream-column-width: 172px;
  --stream-column-gap: 10px;
  --stream-header-top: 14px;
}

.media-library-page.density-comfortable {
  --workspace-section-padding: 18px;
  --workspace-section-gap: 14px;
  --album-cover-size: 72px;
  --album-cover-radius: 18px;
  --album-meta-gap: 14px;
  --media-grid-min-width: 190px;
  --media-grid-gap: 16px;
  --media-card-radius: 16px;
  --media-toolbar-inset: 10px;
  --stream-column-width: 210px;
  --stream-column-gap: 14px;
  --stream-header-top: 16px;
}

@media (max-width: 1440px) {
  .media-library-page {
    --stream-column-width: 160px;
  }

  .media-library-page.density-comfortable {
    --stream-column-width: 196px;
  }
}

@media (min-width: 1800px) {
  .media-library-page {
    --stream-column-width: 184px;
  }

  .media-library-page.density-comfortable {
    --stream-column-width: 224px;
  }
}

.card-panel {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.library-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(360px, 1fr);
  gap: 20px;
  padding: 16px 24px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 40%),
    linear-gradient(135deg, #ffffff 0%, #f8fbff 55%, #eef5ff 100%);
}

.hero-kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #2563eb;
}

.library-hero h2 {
  margin: 4px 0;
  font-size: 22px;
}

.library-hero p {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.hero-copy,
.hero-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.hero-stat {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(191, 219, 254, 0.8);
}

.hero-stat-label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}

.hero-stat strong {
  font-size: 18px;
  color: #0f172a;
}

.hero-date-switch {
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.hero-switch-label {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  color: #475569;
}

.hero-date-controls,
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.hero-current-date-tag {
  padding-inline: 10px;
}

.error-banner {
  margin-bottom: 4px;
}

.layout-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 340px;
  gap: 16px;
  height: calc(100vh - 60px);
  overflow: hidden;
}

.sidebar-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

.sidebar-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-panel > .section-header {
  flex-shrink: 0;
}

.sidebar-panel > .el-tree,
.sidebar-panel > .favorite-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.content-area {
  height: 100%;
  overflow-y: auto !important;
  scrollbar-gutter: stable;
  
}

.sidebar-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

.section-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.basket-panel,
.recent-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.basket-panel {
  flex: 3;
  min-height: 0;
}

.recent-panel {
  flex: 2;
  min-height: 0;
}

.selection-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.recognition-images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.recognition-image-item {
  text-align: center;
}

.recognition-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.recognition-image-name {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recognition-count {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.recent-actions {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.basket-panel :deep(.el-empty),
.recent-panel :deep(.el-empty) {
  margin: auto 0;
}

.content-area {
  padding: 18px;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workspace-display-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.display-switch,
.density-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.9);
}

.density-switch-label {
  padding-inline: 8px 2px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.density-switch-actions {
  display: inline-flex;
  gap: 6px;
}

.workspace-section-header {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.workspace-section-header:hover {
  background: #f1f5f9;
}

.section-header,
.workspace-header,
.favorite-title-row,
.recent-action-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.collapse-icon {
  transition: transform 0.3s ease;
  color: #64748b;
  margin-right: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  padding: 2px;
}

.collapse-icon.collapsed {
  transform: rotate(90deg);
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.35s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 2000px;
  opacity: 1;
  margin-top: 16px;
}

.workspace-section-header,
.album-title-row,
.preview-stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-header {
  align-items: flex-start;
}

.section-header h3,
.workspace-header h3,
.album-title-row h4 {
  margin: 0;
}

.section-helper,
.workspace-subcopy,
.favorite-path,
.selection-path,
.workspace-section-subtitle,
.recent-action-meta,
.recent-action-detail,
.media-parent,
.preview-stage-meta span {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}

.mini-ribbon,
.workspace-chips,
.favorite-tags,
.favorite-actions,
.selection-summary,
.workspace-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-buttons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.action-buttons :deep(.el-button) {
  margin: 0;
}

.workspace-ribbon {
  display: grid;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%);
  border: 1px solid rgba(191, 219, 254, 0.7);
}

.ribbon-group {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.ribbon-label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding-top: 9px;
}

.ribbon-items {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ribbon-pill,
.mini-ribbon-pill {
  appearance: none;
  border: 1px solid rgba(191, 219, 254, 0.95);
  background: #fff;
  color: #0f172a;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.ribbon-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 96px;
}

.ribbon-pill small,
.mini-ribbon-pill {
  font-size: 12px;
  color: #64748b;
}

.ribbon-pill:hover,
.mini-ribbon-pill:hover {
  transform: translateY(-1px);
  border-color: #60a5fa;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.1);
}

.ribbon-pill.active,
.mini-ribbon-pill.active {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  border-color: #2563eb;
  color: #fff;
}

.ribbon-pill.active small {
  color: rgba(255, 255, 255, 0.85);
}

.favorite-list,
.selection-list,
.recent-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.selection-list,
.recent-actions {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.favorite-item,
.selection-item,
.recent-action-item {
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 12px;
  background: #fff;
}

.favorite-item.active {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.12);
}

.favorite-item.current {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.95), #fff);
}

.favorite-item.disabled {
  opacity: 0.72;
}

.favorite-main {
  cursor: pointer;
}

.workspace-section {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-section-gap);
  padding: var(--workspace-section-padding);
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  border: 1px solid rgba(226, 232, 240, 0.95);
}

.album-meta {
  display: flex;
  gap: var(--album-meta-gap);
  align-items: center;
}

.album-cover-shell {
  flex-shrink: 0;
}

.album-cover {
  width: var(--album-cover-size);
  height: var(--album-cover-size);
  border-radius: var(--album-cover-radius);
  object-fit: cover;
  background: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.album-cover-placeholder {
  display: grid;
  place-items: center;
  font-size: 28px;
}

.album-copy {
  min-width: 0;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--media-grid-min-width), 1fr));
  gap: var(--media-grid-gap);
}

.workspace-stream-panel {
  gap: 18px;
  overflow: visible;
}

.stream-group-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stream-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
}

.stream-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: var(--stream-header-top);
  z-index: 4;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(191, 219, 254, 0.65);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.stream-group-copy {
  min-width: 0;
}

.media-masonry {
  display: flex;
  flex-wrap: wrap;
  gap: var(--stream-column-gap);
}

.media-card {
  position: relative;
  border: 1px solid #dbe7f4;
  border-radius: var(--media-card-radius);
  overflow: hidden;
  background: #fff;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.media-card-stream {
  flex: 0 0 var(--stream-column-width);
  width: var(--stream-column-width);
  margin: 0;
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
}

.media-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.12);
  border-color: #93c5fd;
}

.media-card.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.72), #fff);
}

.media-thumb-wrap {
  position: relative;
  overflow: hidden;
  background: #f8fafc;
}

.media-thumb-wrap-stream {
  border-radius: inherit;
}

.media-thumb-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.02), rgba(37, 99, 235, 0.16));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.media-card.selected .media-thumb-wrap::after {
  opacity: 1;
}

.media-card-toolbar {
  position: absolute;
  inset: var(--media-toolbar-inset) var(--media-toolbar-inset) auto var(--media-toolbar-inset);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
}

.media-card:hover .media-card-toolbar,
.media-card:focus-within .media-card-toolbar {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.media-selected-badge {
  position: absolute;
  right: var(--media-toolbar-inset);
  bottom: var(--media-toolbar-inset);
  z-index: 3;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
}

.media-meta-overlay {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 28px 12px 12px;
  background: linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.08) 30%, rgba(15, 23, 42, 0.82) 100%);
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
}

.media-card:hover .media-meta-overlay,
.media-card:focus-within .media-meta-overlay {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.selection-thumb,
.filmstrip-thumb {
  width: 100%;
  object-fit: cover;
  background: #f1f5f9;
}

.media-thumb-wrap :deep(.smart-media-image-element) {
  position: relative;
  z-index: 0;
}

.media-card:hover :deep(.smart-media-image-element),
.media-card:focus-within :deep(.smart-media-image-element) {
  transform: scale(1.035);
}

.media-filename,
.selection-name {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.45;
}

.media-meta-overlay .media-filename,
.media-meta-overlay .media-parent {
  color: #fff;
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.35);
}

.media-section-chip {
  align-self: flex-start;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.95);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.media-meta-overlay .media-filename {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.media-meta-overlay .media-parent {
  margin-top: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.82);
}

.selection-item {
  position: relative;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  user-select: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.selection-item.dragging {
  opacity: 0.56;
  cursor: grabbing;
}

.selection-item.drop-before::before,
.selection-item.drop-after::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  height: 3px;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.selection-item.drop-before::before {
  top: -2px;
}

.selection-item.drop-after::after {
  bottom: -2px;
}

.selection-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
}

.selection-order-badge {
  position: absolute;
  top: 8px;
  left: 44px;
  z-index: 1;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
  pointer-events: none;
}

.selection-item-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.selection-item-actions :deep(.el-button) {
  user-select: none;
}

.selection-drag-handle {
  appearance: none;
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
  padding: 2px 4px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.selection-drag-handle:hover {
  color: #475569;
}

.selection-drag-handle:active {
  cursor: grabbing;
}

.recent-action-error {
  margin-top: 6px;
  color: #dc2626;
  font-size: 12px;
}

.preview-stage-toolbar {
  margin-bottom: 14px;
  align-items: flex-start;
}

.preview-stage-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-stage-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.preview-wrapper {
  display: flex;
  justify-content: center;
  padding: 16px;
  border-radius: 18px;
  background: #f8fafc;
}

.preview-image {
  max-width: 100%;
  max-height: 68vh;
  object-fit: contain;
}

.preview-filmstrip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  margin-top: 16px;
  padding-bottom: 4px;
}

.filmstrip-item {
  appearance: none;
  border: 2px solid transparent;
  border-radius: 12px;
  background: transparent;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.filmstrip-item.active {
  border-color: #2563eb;
}

.filmstrip-thumb {
  width: 72px;
  height: 72px;
  border-radius: 10px;
}

@media (max-width: 1500px) {
  .layout-grid {
    grid-template-columns: 280px minmax(0, 1fr) 320px;
  }
}

@media (max-width: 1280px) {
  .library-hero {
    grid-template-columns: 1fr;
  }

  .layout-grid {
    grid-template-columns: 1fr;
  }

  .sidebar-left,
  .sidebar-right {
    position: static;
  }

  .sidebar-right {
    height: auto;
  }

  .basket-panel,
  .recent-panel {
    min-height: unset;
  }
}

@media (max-width: 900px) {
  .hero-stats {
    grid-template-columns: 1fr;
  }

  .ribbon-group {
    grid-template-columns: 1fr;
  }

  .selection-item {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .selection-item-actions {
    grid-column: 1 / -1;
    flex-direction: row;
    justify-content: flex-end;
  }
}
</style>
