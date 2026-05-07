import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MediaActionSummary } from '@/api/media';
import { registerMediaActionNotifications } from '@/services/media-action-notification.service';
import type { MediaActionWebSocketMessage } from '@/types/media-action-sse.types';

export const useMediaActionsStore = defineStore('media-actions', () => {
  const actions = ref<MediaActionSummary[]>([]);
  let unregister: (() => void) | null = null;

  async function fetchActions(limit = 100) {
    const { getMediaActions } = await import('@/api/media');
    actions.value = await getMediaActions(limit);
  }

  function updateActionFromWebSocket(message: MediaActionWebSocketMessage) {
    const jobId = message.data.jobId;

    const index = actions.value.findIndex((a) => a.id === jobId);
    if (index === -1) return;

    const action = actions.value[index];

    if (message.type === 'media_action_done') {
      actions.value[index] = {
        ...action,
        status: 'SUCCESS',
        updatedAt: new Date().toISOString(),
      };
    } else if (message.type === 'media_action_failed') {
      const { data } = message;
      actions.value[index] = {
        ...action,
        status: data.status === 'needs-auth' ? 'NEEDS_AUTH' : 'FAILED',
        error: data.error || data.message,
        updatedAt: new Date().toISOString(),
      };
    } else if (message.type === 'media_action_progress') {
      const { data } = message;
      // 只记录日志，不更新 UI 状态（进度阶段不需要刷新界面）
      if (data.phase) {
        const pct = data.progress != null ? Math.round(data.progress * 100) : 0;
        console.log(
          `[MediaActions] Progress for ${jobId}: ${data.phaseLabel || data.phase} (${pct}%)`
        );
      }
      return; // progress 不需要触发数组更新
    }

    // 触发响应式更新
    actions.value = [...actions.value];
  }

  function startListening() {
    if (unregister) return;
    unregister = registerMediaActionNotifications((message) => {
      updateActionFromWebSocket(message);
    });
  }

  function stopListening() {
    if (unregister) {
      unregister();
      unregister = null;
    }
  }

  return {
    actions,
    fetchActions,
    updateActionFromWebSocket,
    startListening,
    stopListening,
  };
});
