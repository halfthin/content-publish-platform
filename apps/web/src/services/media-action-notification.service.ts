import { ElNotification } from 'element-plus';
import type {
  MediaActionDoneMessage,
  MediaActionFailedMessage,
  MediaActionProgressMessage,
  MediaActionWebSocketMessage,
} from '@/types/media-action-sse.types';
import { wsService } from '@/websocket';

/**
 * Handle media action WebSocket messages and show notifications
 */
export function handleMediaActionNotification(message: MediaActionWebSocketMessage) {
  switch (message.type) {
    case 'media_action_progress': {
      const { data } = message as MediaActionProgressMessage;
      const progressPercent = data.progress != null ? Math.round(data.progress * 100) : 0;
      const phaseText = data.phaseLabel || data.phase || '';
      const messageText = data.message || '';

      // Only show notifications for significant progress updates
      // Skip "waiting" events and very granular progress updates
      if (data.event === 'waiting') {
        ElNotification({
          type: 'info',
          title: '⏳ 等待中',
          message: data.message || '任务等待处理...',
          duration: 3000,
        });
        return;
      }

      if (data.event === 'phase_change' && phaseText) {
        ElNotification({
          type: 'info',
          title: `🔄 ${phaseText}`,
          message: messageText || '阶段切换',
          duration: 3000,
        });
        return;
      }

      // Show progress for main phases
      if (progressPercent > 0 && progressPercent < 100) {
        console.log(`[MediaAction] Progress: ${progressPercent}% - ${phaseText} - ${messageText}`);
      }
      break;
    }

    case 'media_action_done': {
      const { data } = message as MediaActionDoneMessage;
      const outputCount = data.outputFiles?.length || 0;

      ElNotification({
        type: 'success',
        title: '✅ 动作执行成功',
        message: data.message || `生成 ${outputCount} 个输出文件`,
        duration: 5000,
      });
      break;
    }

    case 'media_action_failed': {
      const { data } = message as MediaActionFailedMessage;

      let title = '❌ 动作执行失败';
      if (data.status === 'callback_failed') {
        title = '❌ 回调失败';
      } else if (data.status === 'dispatch_failed') {
        title = '❌ 派发失败';
      } else if (data.status === 'needs-auth') {
        title = '🔐 需要认证';
      }

      ElNotification({
        type: 'error',
        title,
        message: data.message || data.error || '未知错误',
        duration: 8000,
      });
      break;
    }

    default:
      // Unknown message type, ignore
      break;
  }
}

/**
 * Check if a message is a media action WebSocket message
 */
export function isMediaActionMessage(message: { type: string }): boolean {
  return (
    message.type === 'media_action_progress' ||
    message.type === 'media_action_done' ||
    message.type === 'media_action_failed'
  );
}

/**
 * Wrap a generic message handler to route media action messages to notifications
 */
export function createMediaActionMessageHandler(
  handler: (message: MediaActionWebSocketMessage) => void
): (message: { type: string; [key: string]: unknown }) => void {
  return (message) => {
    if (isMediaActionMessage(message)) {
      handleMediaActionNotification(message as MediaActionWebSocketMessage);
      handler(message as MediaActionWebSocketMessage);
    }
  };
}

/**
 * Register the media action notification handler to wsService
 */
export function registerMediaActionNotifications(
  onActionUpdate?: (message: MediaActionWebSocketMessage) => void
): () => void {
  const handler = createMediaActionMessageHandler((message) => {
    if (onActionUpdate) {
      onActionUpdate(message);
    }
  });

  // Cast to the expected handler type
  wsService.onMessage(handler as Parameters<typeof wsService.onMessage>[0]);

  // Return unregister function
  return () => {
    wsService.offMessage(handler as Parameters<typeof wsService.offMessage>[0]);
  };
}
