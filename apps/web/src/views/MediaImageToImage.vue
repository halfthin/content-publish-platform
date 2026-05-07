<template>
  <div class="image-to-image-page">
    <header class="page-hero card-panel">
      <div>
        <div class="page-kicker">Image to Image</div>
        <h2>图生图任务</h2>
        <p>第 1 张选图自动映射到 product，第 2 张自动映射到 outfit，并把参数一起提交给 OpenClaw hook。</p>
      </div>
      <div class="page-actions">
        <el-button @click="goBackToLibrary">返回素材库</el-button>
        <el-button :disabled="!currentActionId" @click="refreshCurrentAction">刷新状态</el-button>
      </div>
    </header>

    <el-alert
      v-if="pageError"
      type="error"
      :closable="false"
      show-icon
      :title="pageError"
      class="page-alert"
    />

    <el-alert
      v-if="selectionStore.selectedCount === 0 && !submittedAction"
      type="warning"
      :closable="false"
      show-icon
      title="当前没有选中的图片。你可以先回到素材库选图，或直接在下方结果查看区打开最近的图生图任务。"
      class="page-alert"
    />

    <el-alert
      v-if="selectionStore.selectedCount > 2"
      type="info"
      :closable="false"
      show-icon
      :title="`当前选中了 ${selectionStore.selectedCount} 张图片。图生图 payload 只会使用前 2 张：第 1 张 = product，第 2 张 = outfit。`"
      class="page-alert"
    />

    <div class="page-grid">
      <!-- 拖拽分配 UI -->
      <section class="card-panel page-panel">
        <div class="section-header">
          <div>
            <h3>参考图映射</h3>
            <p class="section-helper">把左侧选片篮的图片拖入下方用途槽位</p>
          </div>
        </div>

        <!-- 用途槽位 -->
        <div class="use-slots">
          <div class="use-slot use-slot--product" :class="{ 'use-slot--filled': mappedProduct }">
            <div class="use-slot-label">产品图（product）<el-tag type="primary" size="small" style="margin-left:6px">单张</el-tag></div>
            <div
              class="use-slot-dropzone"
              :class="{ 'dropzone--empty': !mappedProduct }"
              @dragover.prevent="onDragOver($event, 'product')"
              @drop="onDropToSlot($event, 'product')"
            >
              <div v-if="mappedProduct" class="use-slot-item">
                <SmartMediaImage :src="mappedProduct.thumbUrl" :alt="mappedProduct.filename" variant="square" />
                <button class="use-slot-remove" @click="removeFromSlot(mappedProduct, 'product')">×</button>
              </div>
              <div v-else class="use-slot-placeholder">拖入产品图</div>
            </div>
          </div>

          <div class="use-slot use-slot--outfit" :class="{ 'use-slot--filled': mappedOutfit }">
            <div class="use-slot-label">搭配图（outfit）<el-tag size="small" style="margin-left:6px">单张</el-tag></div>
            <div
              class="use-slot-dropzone"
              :class="{ 'dropzone--empty': !mappedOutfit }"
              @dragover.prevent="onDragOver($event, 'outfit')"
              @drop="onDropToSlot($event, 'outfit')"
            >
              <div v-if="mappedOutfit" class="use-slot-item">
                <SmartMediaImage :src="mappedOutfit.thumbUrl" :alt="mappedOutfit.filename" variant="square" />
                <button class="use-slot-remove" @click="removeFromSlot(mappedOutfit, 'outfit')">×</button>
              </div>
              <div v-else class="use-slot-placeholder">拖入搭配图</div>
            </div>
          </div>

          <div class="use-slot use-slot--detail" :class="{ 'use-slot--filled': mappedDetail.length > 0 }">
            <div class="use-slot-label">细节图（detail）<el-tag size="small" style="margin-left:6px">多张</el-tag></div>
            <div
              class="use-slot-dropzone use-slot-dropzone--multi"
              :class="{ 'dropzone--empty': mappedDetail.length === 0 }"
              @dragover.prevent="onDragOver($event, 'detail')"
              @drop="onDropToSlot($event, 'detail')"
            >
              <div v-if="mappedDetail.length > 0" class="use-slot-items">
                <div v-for="element in mappedDetail" :key="element.assetKey" class="use-slot-item">
                  <SmartMediaImage :src="element.thumbUrl" :alt="element.filename" variant="square" />
                  <button class="use-slot-remove" @click="removeFromSlot(element, 'detail')">×</button>
                </div>
              </div>
              <div v-else class="use-slot-placeholder">拖入细节图</div>
            </div>
          </div>
        </div>

        <!-- 场景图（scene）URL 输入 -->
        <div class="scene-input-card">
          <div class="scene-input-header">
            <strong>场景图（scene）</strong>
            <el-tag size="small" type="info">与场景描述二选一</el-tag>
          </div>
          <el-input
            v-model="form.scene_file"
            placeholder="支持公网 URL / 绝对路径 / 相对路径；填写后场景描述自动清空"
            clearable
            @input="handleSceneFileChange"
          />
        </div>

        <!-- 选片篮（来源区） -->
        <div class="selection-basket">
          <div class="basket-header">
            <strong>选片篮</strong>
            <el-tag type="success" size="small">{{ selectionBasket.length }} 张</el-tag>
          </div>
          <div class="basket-grid">
            <div
              v-for="element in selectionBasket"
              :key="element.assetKey"
              class="basket-item"
              draggable="true"
              @dragstart="onDragStart($event, element)"
            >
              <SmartMediaImage :src="element.thumbUrl" :alt="element.filename" :title="element.parentPath" variant="square" />
              <div class="basket-item-name">{{ element.filename }}</div>
            </div>
          </div>
          <div v-if="selectionBasket.length === 0" class="basket-empty">
            <el-empty description="请在素材库选择图片" :image-size="48" />
          </div>
        </div>
      </section>

      <section class="card-panel page-panel">
        <div class="section-header">
          <div>
            <h3>参数编辑</h3>
            <p class="section-helper">表单项会被规范化后提交；空字符串会自动转换为 null。</p>
          </div>
        </div>

        <el-form label-position="top" class="param-form">
          <div class="param-grid">
            <el-form-item label="mode" required>
              <el-select v-model="form.mode" placeholder="请选择模式">
                <el-option
                  v-for="option in imageToImageModeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="count">
              <el-input-number v-model="form.count" :min="1" :max="20" :step="1" controls-position="right" />
            </el-form-item>

            <el-form-item label="person">
              <el-select
                v-model="form.personValues"
                multiple
                collapse-tags
                collapse-tags-tooltip
                clearable
                placeholder="可多选人物"
              >
                <el-option
                  v-for="option in imageToImagePersonOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="productCode">
              <el-select
                v-model="form.productCode"
                clearable
                filterable
                :disabled="productCodeOptions.length === 0"
                :placeholder="productCodeOptions.length > 0 ? '请选择款号' : '未从所选图片中识别到款号'"
              >
                <el-option
                  v-for="option in productCodeOptions"
                  :key="option"
                  :label="option"
                  :value="option"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="scene">
              <el-input v-model="form.scene" clearable placeholder="场景描述，如：咖啡馆、街道、影棚" />
            </el-form-item>

            <el-form-item label="style">
              <el-input v-model="form.style" clearable placeholder="风格，如：日系、韩系、复古" />
            </el-form-item>

            <el-form-item label="mood">
              <el-input v-model="form.mood" clearable placeholder="氛围，如：清新、浪漫、神秘" />
            </el-form-item>

            <el-form-item label="lighting">
              <el-input v-model="form.lighting" clearable placeholder="光线，如：自然光、暖色调、冷色调" />
            </el-form-item>

            <el-form-item label="composition">
              <el-input v-model="form.composition" clearable placeholder="构图，如：中心构图、三分法" />
            </el-form-item>

            <el-form-item label="dryRun">
              <el-switch v-model="form.dryRun" />
            </el-form-item>

            <el-form-item label="description" class="param-grid-full">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="5"
                maxlength="2000"
                show-word-limit
                resize="vertical"
                placeholder="填写本次图生图的整体描述、风格要求、场景氛围、目标人群等补充说明"
              />
            </el-form-item>
          </div>
        </el-form>
      </section>

      <aside class="page-side">
        <section class="card-panel page-panel side-panel">
          <div class="section-header">
            <div>
              <h3>提交任务</h3>
              <p class="section-helper">提交后会由 OpenClaw 异步执行，完成后通过 callback 回写状态。</p>
            </div>
          </div>

          <el-button
            type="primary"
            size="large"
            class="submit-button"
            :disabled="selectionStore.selectedCount === 0"
            :loading="submitting"
            @click="submitImageToImageAction"
          >
            提交图生图
          </el-button>

          <div class="dispatch-target-card">
            <div class="payload-preview-header">
              <strong>OpenClaw 请求路径</strong>
              <span>用于核对当前图生图 dispatch 目标</span>
            </div>
            <div class="dispatch-target-copy">
              <el-tag size="small" type="warning">{{ imageToImageDispatchMethod }}</el-tag>
              <code>{{ imageToImageDispatchPathname }}</code>
            </div>
          </div>

          <div class="payload-preview">
            <div class="payload-preview-header">
              <strong>Payload 预览</strong>
              <span>最终由后端组装 callback/taskId</span>
            </div>
            <pre>{{ payloadPreviewJson }}</pre>
          </div>
        </section>
      </aside>
    </div>

    <section class="card-panel page-panel">
      <div class="section-header">
        <div>
          <h3>任务状态</h3>
          <p class="section-helper">提交后会自动轮询；结果图会在下方"结果查看区"集中展示。</p>
        </div>
        <el-tag v-if="submittedAction" :type="statusTagType" effect="dark">{{ submittedAction.status }}</el-tag>
      </div>

      <el-skeleton v-if="loadingAction" :rows="4" animated />
      <template v-else-if="submittedAction">
        <el-descriptions :column="1" border size="small" class="status-descriptions">
          <el-descriptions-item label="任务 ID">{{ submittedAction.id }}</el-descriptions-item>
          <el-descriptions-item label="外部任务">
            {{ submittedAction.externalTaskId || '等待 Gateway 返回' }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(submittedAction.updatedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="结果摘要">
            {{ resultView.summary || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="错误信息">
            {{ submittedAction.error || '—' }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="resultView.upload" class="status-upload-tip">
          <span>已回流 {{ resultView.upload.fileCount }} 个结果文件</span>
          <span class="status-upload-dir">{{ resultView.upload.directory || '—' }}</span>
        </div>

        <div v-else-if="resultView.images.length > 0" class="status-upload-tip">
          <span>已解析到 {{ resultView.images.length }} 张可预览结果图</span>
        </div>

        <div v-if="resultView.upload?.manifestUrl" class="status-link-row">
          <a
            :href="resultView.upload?.manifestUrl"
            target="_blank"
            rel="noreferrer"
            class="result-link"
          >
            查看 manifest.json
          </a>
        </div>

        <div class="task-action-row">
          <el-button
            v-if="canRetrySubmittedAction"
            size="small"
            type="primary"
            :loading="retryingActionId === submittedAction.id"
            @click="retryCurrentAction"
          >
            重新提交
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :loading="deletingActionId === submittedAction.id"
            @click="deleteCurrentAction"
          >
            删除任务
          </el-button>
        </div>

        <div v-if="callbackPayloadJson" class="callback-block">
          <div class="payload-preview-header">
            <strong>Callback 原始结果</strong>
            <span>可用于排查 OpenClaw 返回内容</span>
          </div>
          <pre>{{ callbackPayloadJson }}</pre>
        </div>
      </template>
      <el-empty v-else description="尚未提交图生图任务" :image-size="72" />
    </section>

    <section class="card-panel page-panel result-viewer-panel">
      <div class="section-header">
        <div>
          <h3>结果查看区</h3>
          <p class="section-helper">集中查看最近图生图任务、回流图片、上传目录与 manifest 文件。</p>
        </div>
        <div class="result-viewer-actions">
          <el-button size="small" @click="refreshRecentActions">刷新任务列表</el-button>
          <a
            v-if="resultView.upload?.manifestUrl"
            :href="resultView.upload?.manifestUrl"
            target="_blank"
            rel="noreferrer"
            class="result-link"
          >
            打开 manifest.json
          </a>
        </div>
      </div>

      <div class="result-viewer-layout">
        <div class="result-viewer-main" style="width: 100%">
          <template v-if="submittedAction">
            <div class="result-summary-grid">
              <article class="result-summary-card">
                <span class="result-summary-label">状态</span>
                <strong>{{ formatActionStatus(submittedAction.status) }}</strong>
                <small>{{ submittedAction.status }}</small>
              </article>
              <article class="result-summary-card">
                <span class="result-summary-label">结果图</span>
                <strong>{{ resultView.images.length }}</strong>
                <small>可预览图片数</small>
              </article>
              <article class="result-summary-card">
                <span class="result-summary-label">上传文件</span>
                <strong>{{ resultView.upload?.fileCount || 0 }}</strong>
                <small>{{ resultView.upload ? '已回流到 CPP' : '暂无上传回流' }}</small>
              </article>
              <article class="result-summary-card">
                <span class="result-summary-label">最近更新</span>
                <strong>{{ formatDateTime(submittedAction.updatedAt) }}</strong>
                <small>{{ submittedAction.externalTaskId || submittedAction.id }}</small>
              </article>
            </div>

            <div v-if="resultView.summary" class="result-summary-text">
              <strong>结果摘要：</strong>{{ resultView.summary }}
            </div>

            <div v-if="resultView.images.length > 0" class="result-viewer-gallery">
              <article
                v-for="image in resultView.images"
                :key="image.key"
                class="result-viewer-card"
              >
                <SmartMediaImage
                  :src="image.url"
                  :alt="image.caption"
                  :title="image.title"
                  variant="natural"
                />
                <div class="result-viewer-card-copy">
                  <div class="result-viewer-card-title">{{ image.caption }}</div>
                  <div class="result-viewer-card-meta">
                    {{ image.relativePath || image.title }}
                  </div>
                </div>
                <div class="result-viewer-card-actions">
                  <a :href="image.url" target="_blank" rel="noreferrer" class="result-link">
                    打开原图
                  </a>
                </div>
              </article>
            </div>
            <el-empty v-else description="当前任务还没有返回可预览结果图" :image-size="72" />

            <div v-if="resultView.upload" class="upload-detail-card">
              <div class="upload-detail-grid">
                <div class="upload-detail-item">
                  <span>上传目录</span>
                  <strong>{{ resultView.upload.directory || '—' }}</strong>
                </div>
                <div class="upload-detail-item">
                  <span>文件数</span>
                  <strong>{{ resultView.upload.fileCount }}</strong>
                </div>
                <div class="upload-detail-item">
                  <span>manifest</span>
                  <strong>{{ resultView.upload.manifestPath || '—' }}</strong>
                </div>
              </div>

              <div v-if="resultView.upload.files.length > 0" class="upload-file-list">
                <a
                  v-for="file in resultView.upload.files"
                  :key="file.key"
                  :href="file.url"
                  target="_blank"
                  rel="noreferrer"
                  class="upload-file-item"
                >
                  <span class="upload-file-name">{{ file.originalName }}</span>
                  <span class="upload-file-meta">{{ file.relativePath }}</span>
                </a>
              </div>
            </div>
          </template>
          <el-empty
            v-else
            description="尚未选中图生图任务。请从右侧最近任务中选择，或先提交一个新任务。"
            :image-size="72"
          />
        </div>

      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/* biome-ignore-all lint/correctness/noUnusedVariables lint/correctness/noUnusedImports: Vue <script setup> bindings are consumed by the template. */
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ImageToImageMode, MediaActionAssetSnapshot, MediaActionSummary } from '@/api/media';
import * as mediaApi from '@/api/media';
import SmartMediaImage from '@/components/media/SmartMediaImage.vue';
import {
  IMAGE_TO_IMAGE_MODE_OPTIONS,
  IMAGE_TO_IMAGE_PERSON_OPTIONS,
} from '@/config/image-to-image';
import { registerMediaActionNotifications } from '@/services/media-action-notification.service';
import { useMediaLibraryStore } from '@/stores/media-library.store';
import { useMediaSelectionStore } from '@/stores/media-selection.store';
import { extractMediaActionResultView } from '@/utils/media-action-result';
import { collectProductCodesFromPaths } from '@/utils/product-code';

type ReferenceAssetLike = Pick<
  MediaActionAssetSnapshot,
  'assetKey' | 'filename' | 'parentPath' | 'rootId' | 'thumbUrl' | 'fileUrl' | 'relativePath'
> & {
  sourcePath?: string;
};

const imageToImageModeOptions = IMAGE_TO_IMAGE_MODE_OPTIONS;
const imageToImageModes = imageToImageModeOptions.map((option) => option.value);
const imageToImagePersonOptions = IMAGE_TO_IMAGE_PERSON_OPTIONS;

const route = useRoute();
const router = useRouter();
const mediaStore = useMediaLibraryStore();
const selectionStore = useMediaSelectionStore();
const submitting = ref(false);
const loadingAction = ref(false);
const retryingActionId = ref<string | null>(null);
const deletingActionId = ref<string | null>(null);
const highlightedActionId = ref<string | null>(null);
const pageError = ref('');
const currentActionId = ref<string | null>(null);
const submittedAction = ref<MediaActionSummary | null>(null);
const lastAppliedActionId = ref<string | null>(null);
const form = reactive({
  mode: 'lifestyle' as ImageToImageMode,
  personValues: [] as string[],
  productCode: '',
  count: 1 as number | null,
  dryRun: false,
  scene: '',
  scene_file: '',
  style: '',
  mood: '',
  lighting: '',
  composition: '',
  description: '',
});

// 拖拽映射列表
const mappedProductList = ref<ReferenceAssetLike[]>([]);
const mappedOutfitList = ref<ReferenceAssetLike[]>([]);
const mappedDetailList = ref<ReferenceAssetLike[]>([]);
const mappedProduct = computed(() => mappedProductList.value[0] || null);
const mappedOutfit = computed(() => mappedOutfitList.value[0] || null);
const mappedDetail = computed(() => mappedDetailList.value);

let stopWsListening: (() => void) | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

const currentReferenceAssets = computed<ReferenceAssetLike[]>(() => {
  if (submittedAction.value?.assets?.length) {
    return submittedAction.value.assets;
  }

  if (selectionStore.selectedItems.length > 0) {
    return selectionStore.selectedItems;
  }

  return submittedAction.value?.assets || [];
});

// 选片篮：排除已映射到槽位的图片
const selectionBasket = computed(() => {
  const usedKeys = new Set([
    ...mappedProductList.value.map((a) => a.assetKey),
    ...mappedOutfitList.value.map((a) => a.assetKey),
    ...mappedDetailList.value.map((a) => a.assetKey),
  ]);
  return currentReferenceAssets.value.filter((a) => !usedKeys.has(a.assetKey));
});
const productCodeOptions = computed(() => {
  const optionSet = new Set(
    collectProductCodesFromPaths(
      currentReferenceAssets.value.map((asset) => asset.relativePath || asset.parentPath)
    )
  );

  if (form.productCode && !optionSet.has(form.productCode)) {
    optionSet.add(form.productCode);
  }

  return Array.from(optionSet);
});

const statusTagType = computed(() => {
  switch (submittedAction.value?.status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'NEEDS_AUTH':
    case 'RUNNING':
    case 'DISPATCHING':
      return 'warning';
    default:
      return 'info';
  }
});
const imageToImageDefinition = computed(
  () => mediaStore.actionDefinitions.find((item) => item.type === 'image-to-image') || null
);
const imageToImageDispatchMethod = computed(
  () => imageToImageDefinition.value?.dispatchMethod || 'POST'
);
const imageToImageDispatchPathname = computed(
  () => imageToImageDefinition.value?.dispatchPathname || '/webhooks/cpp/oc/vd-shoot'
);
const canRetrySubmittedAction = computed(
  () => submittedAction.value?.status === 'FAILED' || submittedAction.value?.status === 'NEEDS_AUTH'
);
const resultView = computed(() => extractMediaActionResultView(submittedAction.value));

const payloadPreview = computed(() => {
  const base = {
    taskId: currentActionId.value || '<提交后生成>',
    callback: {
      url: '<由后端自动拼装 callback url>',
      token: '<由后端自动填充 callback token>',
    },
    mode: form.mode,
    person: form.personValues.length > 0 ? form.personValues.join(',') : null,
    productCode: normalizeOptionalString(form.productCode),
    count: normalizeCount(form.count),
    dryRun: form.dryRun,
    referenceImages: {
      product: mappedProductList.value[0]
        ? getReferencePayloadPath(mappedProductList.value[0])
        : undefined,
      outfit: mappedOutfitList.value[0]
        ? getReferencePayloadPath(mappedOutfitList.value[0])
        : undefined,
      detail:
        mappedDetailList.value.length > 0
          ? mappedDetailList.value.map(getReferencePayloadPath)
          : undefined,
      scene: normalizeOptionalString(form.scene_file),
    },
  };
  // 只添加有值的可选字段
  const optional: Record<string, unknown> = {};
  if (normalizeOptionalString(form.scene)) optional.scene = normalizeOptionalString(form.scene);
  if (normalizeOptionalString(form.style)) optional.style = normalizeOptionalString(form.style);
  if (normalizeOptionalString(form.mood)) optional.mood = normalizeOptionalString(form.mood);
  if (normalizeOptionalString(form.lighting))
    optional.lighting = normalizeOptionalString(form.lighting);
  if (normalizeOptionalString(form.composition))
    optional.composition = normalizeOptionalString(form.composition);
  if (normalizeOptionalString(form.description))
    optional.description = normalizeOptionalString(form.description);
  return { ...base, ...optional };
});

const payloadPreviewJson = computed(() => JSON.stringify(payloadPreview.value, null, 2));
const callbackPayloadJson = computed(() =>
  submittedAction.value?.callbackPayload
    ? JSON.stringify(submittedAction.value.callbackPayload, null, 2)
    : ''
);

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCount(value: number | null): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

function readActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message.includes('not a function')) {
      return '前端页面已更新，但当前浏览器里的旧脚本还没完全刷新。现在已自动走兼容逻辑；若仍异常，请手动刷新页面后再试。';
    }

    return error.message;
  }

  return fallback;
}

function toFormDataPayload() {
  const raw: Record<string, unknown> = {
    mode: form.mode,
    person: form.personValues.length > 0 ? form.personValues.join(',') : null,
    productCode: normalizeOptionalString(form.productCode),
    count: normalizeCount(form.count),
    dryRun: form.dryRun,
    scene: normalizeOptionalString(form.scene),
    style: normalizeOptionalString(form.style),
    mood: normalizeOptionalString(form.mood),
    lighting: normalizeOptionalString(form.lighting),
    composition: normalizeOptionalString(form.composition),
    description: normalizeOptionalString(form.description),
  };
  // 过滤掉所有 null/undefined 值
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null));
}

function applyActionToForm(action: MediaActionSummary) {
  if (lastAppliedActionId.value === action.id) {
    return;
  }

  const formData = action.formData || {};
  form.mode =
    typeof formData.mode === 'string' &&
    imageToImageModes.includes(formData.mode as ImageToImageMode)
      ? (formData.mode as ImageToImageMode)
      : 'lifestyle';
  form.personValues =
    typeof formData.person === 'string' && formData.person.trim()
      ? formData.person
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  form.productCode = typeof formData.productCode === 'string' ? formData.productCode : '';
  const nextCount =
    typeof formData.count === 'number'
      ? formData.count
      : typeof formData.count === 'string' && formData.count.trim()
        ? Number(formData.count)
        : 1;
  form.count = Number.isFinite(nextCount) ? nextCount : 1;
  form.dryRun = Boolean(formData.dryRun);
  form.scene = typeof formData.scene === 'string' ? formData.scene : '';
  form.style = typeof formData.style === 'string' ? formData.style : '';
  form.mood = typeof formData.mood === 'string' ? formData.mood : '';
  form.lighting = typeof formData.lighting === 'string' ? formData.lighting : '';
  form.composition = typeof formData.composition === 'string' ? formData.composition : '';
  form.description = typeof formData.description === 'string' ? formData.description : '';
  lastAppliedActionId.value = action.id;
}

// Native HTML5 drag-drop handlers
let draggedAsset: ReferenceAssetLike | null = null;

function onDragStart(event: DragEvent, asset: ReferenceAssetLike) {
  draggedAsset = asset;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', asset.assetKey);
  }
}

function onDragOver(event: DragEvent, _slot: 'product' | 'outfit' | 'detail') {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDropToSlot(event: DragEvent, slot: 'product' | 'outfit' | 'detail') {
  event.preventDefault();
  if (!draggedAsset) return;
  const asset = draggedAsset;
  draggedAsset = null;

  if (slot === 'product') {
    if (!mappedProductList.value.find((a) => a.assetKey === asset.assetKey)) {
      mappedProductList.value = [asset];
    }
  } else if (slot === 'outfit') {
    if (!mappedOutfitList.value.find((a) => a.assetKey === asset.assetKey)) {
      mappedOutfitList.value = [asset];
    }
  } else if (slot === 'detail') {
    if (!mappedDetailList.value.find((a) => a.assetKey === asset.assetKey)) {
      mappedDetailList.value = [...mappedDetailList.value, asset];
    }
  }
}

function removeFromSlot(asset: ReferenceAssetLike, slot: 'product' | 'outfit' | 'detail') {
  if (slot === 'product') {
    mappedProductList.value = mappedProductList.value.filter((a) => a.assetKey !== asset.assetKey);
  } else if (slot === 'outfit') {
    mappedOutfitList.value = mappedOutfitList.value.filter((a) => a.assetKey !== asset.assetKey);
  } else {
    mappedDetailList.value = mappedDetailList.value.filter((a) => a.assetKey !== asset.assetKey);
  }
}

function handleSceneFileChange() {
  if (normalizeOptionalString(form.scene_file)) {
    form.scene = '';
  }
}

function getReferencePayloadPath(asset: ReferenceAssetLike) {
  return asset.sourcePath || asset.relativePath;
}

function clearHighlight() {
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }

  highlightedActionId.value = null;
}

function highlightAction(actionId: string) {
  clearHighlight();
  highlightedActionId.value = actionId;
  highlightTimer = setTimeout(() => {
    highlightedActionId.value = null;
    highlightTimer = null;
  }, 2200);
}

async function focusRecentActionCard(actionId: string) {
  await nextTick();

  const actionCard = document.querySelector<HTMLElement>(
    `.recent-action-item[data-action-id="${actionId}"]`
  );

  actionCard?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  });
}

async function emphasizeAction(actionId: string) {
  highlightAction(actionId);
  await focusRecentActionCard(actionId);
}

function resolveQueryJobId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0];
  }

  return null;
}

async function loadAction(jobId: string | undefined = currentActionId.value || undefined) {
  if (!jobId) {
    submittedAction.value = null;
    return;
  }

  loadingAction.value = true;
  pageError.value = '';

  try {
    const action = await mediaApi.getMediaAction(jobId);
    submittedAction.value = action;
    currentActionId.value = action.id;
    applyActionToForm(action);
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '加载图生图任务失败';
  } finally {
    loadingAction.value = false;
  }
}

async function refreshCurrentAction() {
  await Promise.all([loadAction(), mediaStore.refreshRecentActions()]);
}

async function retryActionRequest(actionId: string) {
  if (typeof mediaStore.retryAction === 'function') {
    return await mediaStore.retryAction(actionId);
  }

  const action = await mediaApi.retryMediaAction(actionId);
  await mediaStore.refreshRecentActions();
  return action;
}

async function deleteActionRequest(actionId: string) {
  if (typeof mediaStore.deleteAction === 'function') {
    return await mediaStore.deleteAction(actionId);
  }

  const result = await mediaApi.deleteMediaAction(actionId);
  await mediaStore.refreshRecentActions();
  return result;
}

async function retryActionById(actionId: string) {
  retryingActionId.value = actionId;
  pageError.value = '';

  try {
    const action = await retryActionRequest(actionId);
    submittedAction.value = action;
    currentActionId.value = action.id;
    lastAppliedActionId.value = null;
    applyActionToForm(action);
    await router.replace({
      name: 'MediaImageToImage',
      query: {
        jobId: action.id,
      },
    });
    await emphasizeAction(action.id);
    ElMessage.success('已重新提交图生图任务');
  } catch (error) {
    pageError.value = readActionErrorMessage(error, '重试图生图任务失败');
  } finally {
    retryingActionId.value = null;
  }
}

async function retryCurrentAction() {
  if (!submittedAction.value || !canRetrySubmittedAction.value) {
    return;
  }

  await retryActionById(submittedAction.value.id);
}

async function deleteActionById(actionId: string) {
  try {
    await ElMessageBox.confirm(
      '删除后将移除该任务记录；如果已回流结果文件，也会一并删除。是否继续？',
      '删除图生图任务',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      }
    );
  } catch {
    return;
  }

  deletingActionId.value = actionId;
  pageError.value = '';

  try {
    await deleteActionRequest(actionId);

    if (currentActionId.value === actionId) {
      const nextAction = mediaStore.recentActions.find(
        (action) => action.actionType === 'image-to-image' && action.id !== actionId
      );

      if (nextAction) {
        await router.replace({
          name: 'MediaImageToImage',
          query: {
            jobId: nextAction.id,
          },
        });
        await emphasizeAction(nextAction.id);
      } else {
        currentActionId.value = null;
        submittedAction.value = null;
        lastAppliedActionId.value = null;
        await router.replace({
          name: 'MediaImageToImage',
          query: {},
        });
        clearHighlight();
      }
    }

    ElMessage.success('图生图任务已删除');
  } catch (error) {
    pageError.value = readActionErrorMessage(error, '删除图生图任务失败');
  } finally {
    deletingActionId.value = null;
  }
}

async function deleteCurrentAction() {
  if (!submittedAction.value) {
    return;
  }

  await deleteActionById(submittedAction.value.id);
}

async function submitImageToImageAction() {
  if (!mappedProduct.value) {
    ElMessage.warning('请拖入至少一张产品图到产品图槽位');
    return;
  }

  if (!form.mode) {
    ElMessage.warning('请选择图生图模式 mode');
    return;
  }

  submitting.value = true;
  pageError.value = '';

  try {
    const action = await mediaStore.submitAction({
      actionType: 'image-to-image',
      assets: [
        ...mappedProductList.value,
        ...mappedOutfitList.value,
        ...mappedDetailList.value,
      ].map((item) => ({
        rootId: item.rootId,
        relativePath: item.relativePath,
      })),
      formData: toFormDataPayload(),
      context: {
        workspaceDatePath: mediaStore.currentDatePath || undefined,
        favoritePaths: mediaStore.workspacePaths,
      },
    });

    submittedAction.value = action;
    currentActionId.value = action.id;
    lastAppliedActionId.value = action.id;
    await router.replace({
      name: 'MediaImageToImage',
      query: {
        jobId: action.id,
      },
    });
    await mediaStore.refreshRecentActions();
    ElMessage.success('图生图任务已提交');
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '提交图生图任务失败';
  } finally {
    submitting.value = false;
  }
}

function goBackToLibrary() {
  void router.push({ name: 'MediaLibrary' });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function formatActionStatus(status: MediaActionSummary['status']) {
  switch (status) {
    case 'QUEUED':
      return '等待中';
    case 'DISPATCHING':
      return '派发中';
    case 'DISPATCHED':
      return '已派发';
    case 'RUNNING':
      return '执行中';
    case 'NEEDS_AUTH':
      return '需要认证';
    case 'SUCCESS':
      return '成功';
    case 'FAILED':
      return '失败';
    default:
      return status;
  }
}

async function refreshRecentActions() {
  await mediaStore.refreshRecentActions();
}

watch(
  productCodeOptions,
  (options) => {
    if (options.length === 0) {
      form.productCode = '';
      return;
    }

    if (!form.productCode || !options.includes(form.productCode)) {
      form.productCode = options[0] || '';
    }
  },
  { immediate: true }
);

watch(
  () => route.query.jobId,
  (jobId) => {
    currentActionId.value = resolveQueryJobId(jobId);
    if (currentActionId.value) {
      void loadAction(currentActionId.value);
      return;
    }

    submittedAction.value = null;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearHighlight();
  stopWsListening?.();
});

function handleWsActionUpdate(message: { data: { jobId: string } }) {
  const { jobId } = message.data;
  if (jobId !== submittedAction.value?.id) return;
  // 刷新任务状态
  void refreshCurrentAction();
}

onMounted(() => {
  stopWsListening = registerMediaActionNotifications(handleWsActionUpdate);
  void Promise.all([refreshRecentActions(), mediaStore.refreshActionDefinitions()]);
  // tag → 槽位映射
  const tagToSlots: Record<string, 'product' | 'outfit' | 'detail'> = {
    product: 'product',
    outfit: 'outfit',
    flat_main: 'detail',
    sku_color: 'detail',
    detail: 'detail',
  };

  for (const item of selectionStore.selectedItems) {
    const itemTags: string[] = (item as { tags?: string[] }).tags || [];
    for (const tag of itemTags) {
      const slot = tagToSlots[tag];
      if (
        slot === 'product' &&
        !mappedProductList.value.find((a) => a.assetKey === item.assetKey)
      ) {
        mappedProductList.value = [item];
      } else if (
        slot === 'outfit' &&
        !mappedOutfitList.value.find((a) => a.assetKey === item.assetKey)
      ) {
        mappedOutfitList.value = [item];
      } else if (
        slot === 'detail' &&
        !mappedDetailList.value.find((a) => a.assetKey === item.assetKey)
      ) {
        mappedDetailList.value = [...mappedDetailList.value, item];
      }
    }
  }
});
</script>

<style scoped>
.image-to-image-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.page-kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #2563eb;
}

.page-hero h2 {
  margin: 8px 0;
  font-size: 30px;
}

.page-hero p,
.section-helper,
.reference-path,
.ordered-reference-path,
.payload-preview-header span {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.page-alert {
  margin-top: -4px;
}

.page-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.1fr) 360px;
  gap: 16px;
  align-items: start;
}

.page-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-panel {
  padding: 18px;
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header,
.reference-card-top,
.payload-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header h3,
.payload-preview-header strong {
  margin: 0 0 4px;
}

.reference-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.reference-card,
.dispatch-target-card,
.payload-preview,
.callback-block {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
}

.reference-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.mutual-exclusive-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  font-size: 13px;
}

.reference-copy {
  min-width: 0;
}

.reference-name,
.ordered-reference-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.param-form {
  margin-top: 14px;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.param-grid-full {
  grid-column: 1 / -1;
}

.submit-button {
  width: 100%;
}

.payload-preview pre,
.callback-block pre {
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}

.dispatch-target-copy {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dispatch-target-copy code {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.ordered-reference-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.ordered-reference-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 120px) minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.ordered-reference-index {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.status-descriptions {
  margin-top: 6px;
}

.result-gallery {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.result-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 10px;
  background: #fff;
}

.result-link {
  color: #2563eb;
  font-size: 12px;
  text-decoration: none;
}

.result-link:hover {
  text-decoration: underline;
}

.status-upload-tip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 13px;
}

.status-upload-dir {
  color: #475569;
  word-break: break-word;
}

.status-link-row {
  display: flex;
  justify-content: flex-end;
}

.task-action-row {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.result-viewer-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.result-viewer-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.result-viewer-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.result-viewer-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.result-summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #fff, #f8fafc);
}

.result-summary-card strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.3;
}

.result-summary-card small,
.result-summary-label,
.recent-action-meta,
.result-viewer-card-meta,
.upload-file-meta {
  color: #64748b;
  font-size: 12px;
}

.result-summary-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.result-summary-text,
.upload-detail-card {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.result-summary-text {
  color: #334155;
  line-height: 1.7;
}

.result-viewer-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.result-viewer-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.result-viewer-card-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.result-viewer-card-title,
.upload-file-name,
.recent-action-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}

.result-viewer-card-meta,
.upload-file-meta {
  word-break: break-word;
}

.result-viewer-card-actions {
  display: flex;
  justify-content: flex-end;
}

.upload-detail-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.upload-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.upload-detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.upload-detail-item span {
  color: #64748b;
  font-size: 12px;
}

.upload-detail-item strong {
  color: #0f172a;
  font-size: 13px;
  word-break: break-word;
}

.upload-file-list,
.recent-action-list,
.result-viewer-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-file-item,
.recent-action-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #fff;
  text-align: left;
  text-decoration: none;
}

.recent-action-item {
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.recent-action-item:hover {
  transform: translateY(-1px);
  border-color: #93c5fd;
  box-shadow: 0 12px 30px rgba(37, 99, 235, 0.08);
}

.recent-action-top,
.result-side-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.recent-action-title-block {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.recent-action-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 2px;
  opacity: 0;
  pointer-events: none;
  max-height: 0;
  overflow: hidden;
  transform: translateY(-4px);
  transition:
    opacity 0.16s ease,
    max-height 0.16s ease,
    transform 0.16s ease;
}

.recent-action-item:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.recent-action-item:hover .recent-action-actions,
.recent-action-item:focus-within .recent-action-actions,
.recent-action-item.active .recent-action-actions,
.recent-action-item--highlight .recent-action-actions {
  opacity: 1;
  pointer-events: auto;
  max-height: 40px;
  transform: translateY(0);
}

.recent-action-item.active {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow:
    0 0 0 1px rgba(37, 99, 235, 0.08),
    0 16px 36px rgba(37, 99, 235, 0.12);
}

.recent-action-item--highlight {
  animation: recent-action-highlight 1.8s ease;
}

@keyframes recent-action-highlight {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.28);
    border-color: #4ade80;
    background: #f0fdf4;
  }

  45% {
    box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.12);
    border-color: #22c55e;
    background: #f0fdf4;
  }

  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

/* 拖拽分配 UI */
.use-slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.use-slot {
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s;
}

.use-slot--filled {
  border-color: #22c55e;
  background: #f0fdf4;
}

.use-slot-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
}

.use-slot-dropzone {
  min-height: 80px;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.use-slot-dropzone--multi {
  min-height: 100px;
}

.dropzone--empty {
  border: 1px dashed #e2e8f0;
}

.use-slot-item {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  border: 1px solid #e4e7ed;
}

.use-slot-item:active {
  cursor: grabbing;
}

.use-slot-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.use-slot-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border: none;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.use-slot-item:hover .use-slot-remove {
  opacity: 1;
}

.use-slot-placeholder {
  width: 100%;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  padding: 20px 0;
}

/* 场景图 */
.scene-input-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 20px;
}

.scene-input-header {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

/* 选片篮 */
.selection-basket {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
}

.basket-header {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.basket-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
  min-height: 72px;
}

.basket-item {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  border: 1px solid #e4e7ed;
  position: relative;
}

.basket-item:active {
  cursor: grabbing;
}

.basket-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.basket-item-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 9px;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.basket-empty {
  padding: 16px 0;
}

/* draggable ghost */
.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

@media (max-width: 1480px) {
  .page-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .result-viewer-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .page-hero,
  .section-header,
  .reference-card-top,
  .payload-preview-header {
    flex-direction: column;
  }

  .reference-grid,
  .param-grid,
  .result-gallery,
  .result-viewer-gallery,
  .result-summary-grid,
  .upload-detail-grid {
    grid-template-columns: 1fr;
  }

  .ordered-reference-item {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .ordered-reference-path {
    grid-column: 1 / -1;
  }
}
</style>
