import { ElNotification } from 'element-plus';
import type {
  MediaActionDoneMessage,
  MediaActionFailedMessage,
  MediaActionProgressMessage,
  MediaActionWebSocketMessage,
} from '@/types/media-action-sse.types';
import { type WebSocketMessage, wsService } from '@/websocket';

const LONG_DURATION_PHASES = new Set(['uploading_refs', 'reading_image', 'generating']);

interface ActiveNotifEntry {
  jobId: string;
  currentPhase: string;
  // 渲染通知后，通过 vm.el 拿到根 div，后续 writeContent 直接操作其子节点
  rootEl: HTMLElement;
  doneTimer?: ReturnType<typeof setTimeout>;
  outputFiles?: string[];
}

class MediaActionNotificationService {
  private entries = new Map<string, ActiveNotifEntry>();

  /** 找到或创建 entry */
  private getOrCreate(jobId: string, title: string): ActiveNotifEntry {
    let entry = this.entries.get(jobId);
    if (entry) {
      if (entry.doneTimer) {
        clearTimeout(entry.doneTimer);
        entry.doneTimer = undefined;
      }
      return entry;
    }

    // 创建通知，拿到根 DOM 元素
    let rootEl: HTMLElement | undefined;
    const notification = ElNotification({
      type: 'info',
      title,
      message: '<span class="cpp-notif-msg"></span><div class="cpp-notif-thumbs"></div>',
      duration: 0,
      showClose: true,
      onClose() {
        // 通知被关闭时清理 entry
        const e = notificationService.entries.get(jobId);
        if (e) {
          if (e.doneTimer) clearTimeout(e.doneTimer);
          notificationService.entries.delete(jobId);
        }
      },
    });

    // ElNotification 返回的实例 .$el 就是根 div
    rootEl = (notification as unknown as { $el: HTMLElement }).$el;
    if (!rootEl) {
      // fallback: 从 DOM 里找
      rootEl = document.querySelector('.el-notification') as HTMLElement;
    }

    entry = { jobId, currentPhase: title, rootEl };
    this.entries.set(jobId, entry);
    return entry;
  }

  private dismissEntry(entry: ActiveNotifEntry) {
    if (entry.doneTimer) clearTimeout(entry.doneTimer);
    this.entries.delete(entry.jobId);
    try {
      entry.rootEl.closest('.el-notification')?.remove();
    } catch {
      // ignore
    }
  }

  private setTitle(entry: ActiveNotifEntry, title: string) {
    const titleEl = entry.rootEl.querySelector('.el-notification__title');
    if (titleEl) titleEl.textContent = title;
  }

  /** 写消息内容到通知 */
  private writeContent(entry: ActiveNotifEntry, message: string, isDone = false) {
    const msgEl = entry.rootEl.querySelector('.cpp-notif-msg') as HTMLElement | null;
    if (!msgEl) return;
    msgEl.textContent = message;

    if (isDone) {
      this.setTitle(entry, '✅ 执行成功');
      const thumbsEl = entry.rootEl.querySelector('.cpp-notif-thumbs') as HTMLElement | null;
      if (thumbsEl) {
        thumbsEl.innerHTML = this.buildThumbs(entry.outputFiles || []);
      }
      entry.doneTimer = setTimeout(() => {
        this.dismissEntry(entry);
      }, 5000);
    }
  }

  private buildThumbs(files: string[]): string {
    if (!files.length) return '';
    return files
      .map(
        (f) =>
          `<img src="/api/media/thumb/${encodeURIComponent(f)}" class="cpp-notif-thumb" alt="output" loading="lazy" />`
      )
      .join('');
  }

  onProgress(message: MediaActionProgressMessage) {
    const { data } = message;
    const { jobId, phase, message: msgText } = data;

    if (data.event === 'waiting') {
      const entry = this.getOrCreate(jobId, '⏳ 等待中');
      this.writeContent(entry, msgText || '任务等待处理...');
      return;
    }

    if (data.event === 'phase_change') {
      const title = `🔄 ${data.phaseLabel || phase || ''}`;
      const entry = this.getOrCreate(jobId, title);
      this.setTitle(entry, title);
      this.writeContent(entry, msgText || '');
      return;
    }

    if (data.progress != null && data.progress > 0 && data.progress < 1) {
      const isLong = phase ? LONG_DURATION_PHASES.has(phase) : false;
      const title = `🔄 ${isLong ? data.phaseLabel || phase : '处理中'}`;
      const entry = this.getOrCreate(jobId, title);
      this.setTitle(entry, title);
      this.writeContent(entry, msgText || `${Math.round(data.progress * 100)}%`);
    }
  }

  onDone(message: MediaActionDoneMessage) {
    const { data } = message;
    const { jobId, message: msgText, outputFiles } = data;

    const entry = this.getOrCreate(jobId, '✅ 执行成功');
    entry.outputFiles = outputFiles;

    const displayMsg =
      msgText || (outputFiles?.length ? `生成 ${outputFiles.length} 个文件` : '执行成功');
    this.writeContent(entry, displayMsg, true);
  }

  onFailed(message: MediaActionFailedMessage) {
    const { data } = message;
    const { jobId, message: msgText } = data;

    let title = '❌ 执行失败';
    if (data.status === 'callback_failed') title = '❌ 回调失败';
    else if (data.status === 'dispatch_failed') title = '❌ 派发失败';
    else if (data.status === 'needs-auth') title = '🔐 需要认证';

    ElNotification({
      type: 'error',
      title,
      message: msgText || data.error || '未知错误',
      duration: 8000,
    });

    const entry = this.entries.get(jobId);
    if (entry) this.dismissEntry(entry);
  }

  dismissAll() {
    for (const entry of this.entries.values()) {
      this.dismissEntry(entry);
    }
  }
}

const notificationService = new MediaActionNotificationService();

export function isMediaActionMessage(message: {
  type: string;
}): message is MediaActionWebSocketMessage {
  return (
    message.type === 'media_action_progress' ||
    message.type === 'media_action_done' ||
    message.type === 'media_action_failed'
  );
}

export function createMediaActionMessageHandler(
  handler: (message: MediaActionWebSocketMessage) => void
): (message: WebSocketMessage) => void {
  return (message) => {
    if (isMediaActionMessage(message)) {
      if (message.type === 'media_action_progress') {
        notificationService.onProgress(message);
      } else if (message.type === 'media_action_done') {
        notificationService.onDone(message);
      } else if (message.type === 'media_action_failed') {
        notificationService.onFailed(message);
      }
      handler(message);
    }
  };
}

export function registerMediaActionNotifications(
  onActionUpdate?: (message: MediaActionWebSocketMessage) => void
): () => void {
  const handler = createMediaActionMessageHandler((message) => {
    if (onActionUpdate) {
      onActionUpdate(message);
    }
  });

  wsService.onMessage(handler);

  return () => {
    wsService.offMessage(handler);
    notificationService.dismissAll();
  };
}
