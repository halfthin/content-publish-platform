import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MediaActionSummary } from '@/api/media';
import type { MediaActionWebSocketMessage } from '@/types/media-action-sse.types';
import { registerMediaActionNotifications } from '@/services/media-action-notification.service';
import { ElNotification } from 'element-plus';

export const useMediaActionsStore = defineStore('media-actions', () => {
  const actions = ref<MediaActionSummary[]>([]);
  let unregister: (() => void) | null = null;

  async function fetchActions(limit = 100) {
    const { getMediaActions } = await import('@/api/media');
    actions.value = await getMediaActions(limit);
  }

  function updateActionFromWebSocket(message: MediaActionWebSocketMessage) {
    const { data } = message;
    const jobId = data.jobId;

    const index = actions.value.findIndex((a) => a.id === jobId);
    if (index === -1) return;

    const action = actions.value[index];
    let updated = false;

    if (message.type === 'media_action_done') {
      updated = true;
      actions.value[index] = {
        ...action,
        status: 'SUCCESS',
        updatedAt: new Date().toISOString(),
      };
    } else if (message.type === 'media_action_failed') {
      updated = true;
      actions.value[index] = {
        ...action,
        status: data.status === 'needs-auth' ? 'NEEDS_AUTH' : 'FAILED',
        error: data.error || data.message,
        updatedAt: new Date().toISOString(),
      };
    } else if (message.type === 'media_action_progress') {
      // Update progress-related fields but keep current status
      // RUNNING phase shows in progress
      if (data.phase) {
        console.log(`[MediaActions] Progress for ${jobId}: ${data.phaseLabel || data.phase} (${data.progress != null ? Math.round(data.progress * 100) : 0}%)`);
      }
    }

    if (updated) {
      // Trigger reactivity by replacing the array
      actions.value = [...actions.value];
    }
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
