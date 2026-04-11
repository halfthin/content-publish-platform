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
      <section class="card-panel page-panel">
        <div class="section-header">
          <div>
            <h3>参考图映射</h3>
            <p class="section-helper">如果顺序不对，请返回素材库，在右侧选片篮拖拽调整顺序。</p>
          </div>
          <el-tag type="success" size="small">{{ currentReferenceAssets.length }} 张参考图</el-tag>
        </div>

        <div class="reference-grid">
          <article class="reference-card">
            <div class="reference-card-top">
              <strong>product</strong>
              <el-tag type="primary" size="small">第 1 张</el-tag>
            </div>
            <div v-if="productReference" class="reference-preview">
              <SmartMediaImage
                :src="productReference.thumbUrl"
                :alt="productReference.filename"
                :title="productReference.parentPath"
                variant="square"
              />
              <div class="reference-copy">
                <div class="reference-name">{{ productReference.filename }}</div>
                <div class="reference-path">{{ productReference.parentPath }}</div>
              </div>
            </div>
            <el-empty v-else description="请至少选择 1 张图片" :image-size="72" />
          </article>

          <article class="reference-card">
            <div class="reference-card-top">
              <strong>outfit</strong>
              <el-tag size="small">第 2 张</el-tag>
            </div>
            <div v-if="outfitReference" class="reference-preview">
              <SmartMediaImage
                :src="outfitReference.thumbUrl"
                :alt="outfitReference.filename"
                :title="outfitReference.parentPath"
                variant="square"
              />
              <div class="reference-copy">
                <div class="reference-name">{{ outfitReference.filename }}</div>
                <div class="reference-path">{{ outfitReference.parentPath }}</div>
              </div>
            </div>
            <el-empty v-else description="可选，取第 2 张图片" :image-size="72" />
          </article>

          <article class="reference-card">
            <div class="reference-card-top">
              <strong>face</strong>
              <el-tag size="small" type="info">手动输入</el-tag>
            </div>
            <el-input
              v-model="form.referenceFace"
              :disabled="isPersonSelectionActive"
              placeholder="支持公网 URL / 绝对路径 / 相对路径"
              clearable
              @input="handleReferenceInputChange"
            />
          </article>

          <article class="reference-card">
            <div class="reference-card-top">
              <strong>body</strong>
              <el-tag size="small" type="info">手动输入</el-tag>
            </div>
            <el-input
              v-model="form.referenceBody"
              :disabled="isPersonSelectionActive"
              placeholder="支持公网 URL / 绝对路径 / 相对路径"
              clearable
              @input="handleReferenceInputChange"
            />
          </article>
        </div>

        <div class="mutual-exclusive-tip">
          <el-tag size="small" type="warning">互斥规则</el-tag>
          <span>person 与 face/body 二选一。选择 person 后会清空并禁用 face/body；填写 face/body 后会清空 person。</span>
        </div>

        <div v-if="currentReferenceAssets.length > 0" class="ordered-reference-list">
          <div v-for="(item, index) in currentReferenceAssets" :key="item.assetKey" class="ordered-reference-item">
            <span class="ordered-reference-index">{{ index + 1 }}</span>
            <span class="ordered-reference-name">{{ item.filename }}</span>
            <span class="ordered-reference-path">{{ item.parentPath }}</span>
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
                :disabled="hasManualReferenceInput"
                placeholder="可多选人物；与 face/body 互斥"
                @change="handlePersonChange"
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

        <section class="card-panel page-panel side-panel">
          <div class="section-header">
            <div>
              <h3>任务状态</h3>
              <p class="section-helper">提交后会自动轮询；结果图会在下方“结果查看区”集中展示。</p>
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
      </aside>
    </div>

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
        <div class="result-viewer-main">
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

        <aside class="result-viewer-side">
          <div class="result-side-header">
            <strong>最近图生图任务</strong>
            <el-tag size="small" type="info">{{ recentImageActions.length }}</el-tag>
          </div>

          <div v-if="recentImageActions.length > 0" class="recent-action-list">
            <div
              v-for="action in recentImageActions"
              :key="action.id"
              :class="[
                'recent-action-item',
                {
                  active: action.id === currentActionId,
                  'recent-action-item--highlight': action.id === highlightedActionId,
                },
              ]"
              :data-action-id="action.id"
              role="button"
              tabindex="0"
              :aria-pressed="action.id === currentActionId"
              @click="openAction(action.id)"
              @keydown.enter="openAction(action.id)"
              @keydown.space.prevent="openAction(action.id)"
            >
              <div class="recent-action-top">
                <div class="recent-action-title-block">
                  <span class="recent-action-title">
                    {{ readRecentActionTitle(action) }}
                  </span>
                  <el-tag
                    v-if="action.id === currentActionId"
                    size="small"
                    type="primary"
                    effect="plain"
                  >
                    当前查看
                  </el-tag>
                </div>
                <el-tag size="small" :type="getRecentActionStatusTagType(action.status)">
                  {{ formatActionStatus(action.status) }}
                </el-tag>
              </div>
              <div class="recent-action-meta">{{ formatDateTime(action.updatedAt) }}</div>
              <div class="recent-action-meta">
                {{ readRecentActionSummary(action) || '等待回调结果' }}
              </div>

              <div class="recent-action-actions">
                <el-button
                  v-if="canRetryAction(action)"
                  size="small"
                  type="primary"
                  text
                  :loading="retryingActionId === action.id"
                  @click.stop="retryActionById(action.id)"
                >
                  重试
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  text
                  :loading="deletingActionId === action.id"
                  @click.stop="deleteActionById(action.id)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无最近图生图任务" :image-size="64" />
        </aside>
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
import { useMediaLibraryStore } from '@/stores/media-library.store';
import { useMediaSelectionStore } from '@/stores/media-selection.store';
import { extractMediaActionResultView } from '@/utils/media-action-result';
import { collectProductCodesFromPaths } from '@/utils/product-code';

type ReferenceAssetLike = Pick<
  MediaActionAssetSnapshot,
  'assetKey' | 'filename' | 'parentPath' | 'thumbUrl' | 'fileUrl' | 'relativePath'
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
  referenceFace: '',
  referenceBody: '',
  description: '',
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
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

const productReference = computed(() => currentReferenceAssets.value[0] || null);
const outfitReference = computed(() => currentReferenceAssets.value[1] || null);
const hasManualReferenceInput = computed(() => {
  return Boolean(
    normalizeOptionalString(form.referenceFace) || normalizeOptionalString(form.referenceBody)
  );
});
const isPersonSelectionActive = computed(() => form.personValues.length > 0);
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
const recentImageActions = computed(() =>
  mediaStore.recentActions.filter((action) => action.actionType === 'image-to-image')
);
const resultView = computed(() => extractMediaActionResultView(submittedAction.value));

const payloadPreview = computed(() => {
  return {
    taskId: currentActionId.value || '<提交后生成>',
    callback: {
      url: '<由后端自动拼装 callback url>',
      token: '<由后端自动填充 callback token>',
    },
    mode: form.mode,
    person: form.personValues.length > 0 ? form.personValues.join(',') : null,
    productCode: normalizeOptionalString(form.productCode),
    scene: null,
    style: null,
    mood: null,
    count: normalizeCount(form.count),
    size: null,
    model: null,
    dryRun: form.dryRun,
    referenceImages: {
      ...(productReference.value
        ? { product: getReferencePayloadPath(productReference.value) }
        : {}),
      ...(outfitReference.value ? { outfit: getReferencePayloadPath(outfitReference.value) } : {}),
      ...(normalizeOptionalString(form.referenceFace)
        ? { face: normalizeOptionalString(form.referenceFace) }
        : {}),
      ...(normalizeOptionalString(form.referenceBody)
        ? { body: normalizeOptionalString(form.referenceBody) }
        : {}),
    },
    description: normalizeOptionalString(form.description),
  };
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
  return {
    mode: form.mode,
    person: form.personValues.length > 0 ? form.personValues.join(',') : null,
    productCode: normalizeOptionalString(form.productCode),
    scene: null,
    style: null,
    mood: null,
    count: normalizeCount(form.count),
    size: null,
    model: null,
    dryRun: form.dryRun,
    referenceFace: normalizeOptionalString(form.referenceFace),
    referenceBody: normalizeOptionalString(form.referenceBody),
    description: normalizeOptionalString(form.description),
  };
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
  form.referenceFace =
    form.personValues.length > 0
      ? ''
      : typeof formData.referenceFace === 'string'
        ? formData.referenceFace
        : '';
  form.referenceBody =
    form.personValues.length > 0
      ? ''
      : typeof formData.referenceBody === 'string'
        ? formData.referenceBody
        : '';
  form.description = typeof formData.description === 'string' ? formData.description : '';
  lastAppliedActionId.value = action.id;
}

function handlePersonChange() {
  if (form.personValues.length > 0) {
    form.referenceFace = '';
    form.referenceBody = '';
  }
}

function handleReferenceInputChange() {
  if (hasManualReferenceInput.value && form.personValues.length > 0) {
    form.personValues = [];
  }
}

function getReferencePayloadPath(asset: ReferenceAssetLike) {
  return asset.sourcePath || asset.relativePath;
}

function isTerminalStatus(status: MediaActionSummary['status']) {
  return status === 'SUCCESS' || status === 'FAILED';
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
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

function startPolling() {
  if (
    !currentActionId.value ||
    pollTimer ||
    isTerminalStatus(submittedAction.value?.status || 'QUEUED')
  ) {
    return;
  }

  pollTimer = setInterval(() => {
    void loadAction(currentActionId.value || undefined);
  }, 3000);
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

    if (isTerminalStatus(action.status)) {
      stopPolling();
    } else {
      startPolling();
    }
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '加载图生图任务失败';
    stopPolling();
  } finally {
    loadingAction.value = false;
  }
}

async function refreshCurrentAction() {
  await Promise.all([loadAction(), mediaStore.refreshRecentActions()]);
}

function canRetryAction(action: MediaActionSummary) {
  return action.status === 'FAILED' || action.status === 'NEEDS_AUTH';
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
    startPolling();
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
      stopPolling();
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
  if (selectionStore.selectedCount === 0) {
    ElMessage.warning('请先在素材库中选择至少一张图片');
    return;
  }

  if (!form.mode) {
    ElMessage.warning('请选择图生图模式 mode');
    return;
  }

  if (form.personValues.length > 0 && hasManualReferenceInput.value) {
    ElMessage.warning('person 与 face/body 互斥，请二选一');
    return;
  }

  submitting.value = true;
  pageError.value = '';

  try {
    const action = await mediaStore.submitAction({
      actionType: 'image-to-image',
      assets: selectionStore.selectedItems.map((item) => ({
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
    startPolling();
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

function getRecentActionStatusTagType(status: MediaActionSummary['status']) {
  switch (status) {
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
}

function readRecentActionTitle(action: MediaActionSummary) {
  const productCode =
    typeof action.formData?.productCode === 'string' && action.formData.productCode.trim()
      ? action.formData.productCode
      : null;

  return productCode || action.externalTaskId || action.id;
}

function readRecentActionSummary(action: MediaActionSummary) {
  return extractMediaActionResultView(action).summary;
}

async function refreshRecentActions() {
  await mediaStore.refreshRecentActions();
}

function openAction(actionId: string) {
  if (currentActionId.value === actionId) {
    void refreshCurrentAction();
    return;
  }

  stopPolling();
  void router.replace({
    name: 'MediaImageToImage',
    query: {
      jobId: actionId,
    },
  });
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

    stopPolling();
    submittedAction.value = null;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopPolling();
  clearHighlight();
});

onMounted(() => {
  void Promise.all([refreshRecentActions(), mediaStore.refreshActionDefinitions()]);
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
