/**
 * Media action SSE event types (mirrors server types)
 * See: webhooks-default-sse-protocol.md
 */

// SSE 外层 event（协议规定）
export type SSEOuterEventType = 'meta' | 'progress' | 'task' | 'error';

export interface MediaActionProgressData {
  jobId: string;
  routeId: string;
  taskId: string;
  externalTaskId?: string;
  outerEvent: SSEOuterEventType;
  event: 'waiting' | 'progress' | 'phase_change';
  phase?: string;
  phaseLabel?: string;
  progress?: number;
  message?: string;
  step?: { current: number; total: number };
}

export interface MediaActionDoneData {
  jobId: string;
  routeId: string;
  taskId: string;
  externalTaskId?: string;
  event: 'done';
  status: 'success' | 'completed';
  outerEvent: 'task' | 'progress';
  message?: string;
  outputFiles?: string[];
  result?: Record<string, unknown>;
}

export interface MediaActionFailedData {
  jobId: string;
  routeId: string;
  taskId: string;
  externalTaskId?: string;
  event: 'failed' | 'error';
  status: 'failed' | 'callback_failed' | 'dispatch_failed' | 'needs-auth';
  outerEvent: SSEOuterEventType;
  message?: string;
  error?: string;
  outputFiles?: string[];
}

export interface MediaActionProgressMessage {
  type: 'media_action_progress';
  data: MediaActionProgressData;
  timestamp: number;
}

export interface MediaActionDoneMessage {
  type: 'media_action_done';
  data: MediaActionDoneData;
  timestamp: number;
}

export interface MediaActionFailedMessage {
  type: 'media_action_failed';
  data: MediaActionFailedData;
  timestamp: number;
}

export type MediaActionWebSocketMessage =
  | MediaActionProgressMessage
  | MediaActionDoneMessage
  | MediaActionFailedMessage;
