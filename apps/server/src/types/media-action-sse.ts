/**
 * Types for OpenClaw Gateway SSE event protocol
 * See: webhooks-default-sse-protocol.md
 */

// SSE 外层 event（协议规定）
export type SSEOuterEventType = 'meta' | 'progress' | 'task' | 'error';

// Gateway SSE 内层 payload event
export type SSEInnerEventType =
  | 'waiting'
  | 'progress'
  | 'phase_change'
  | 'done'
  | 'failed'
  | 'error'
  | 'task';

export interface GatewaySSEProgressEvent {
  event: SSEInnerEventType;
  jobId: string;
  taskId?: string;
  routeId?: string;
  phase?: string;
  phaseLabel?: string;
  progress?: number;
  message?: string;
  status?:
    | 'queued'
    | 'running'
    | 'success'
    | 'failed'
    | 'needs-auth'
    | 'accepted'
    | 'completed'
    | 'callback_failed'
    | 'dispatch_failed';
  outputFiles?: string[];
  result?: Record<string, unknown>;
  error?: string;
  timestamp?: string;
  step?: { current: number; total: number };
  durationMs?: number;
  promptName?: string;
}

export interface GatewaySSEMetaEvent {
  routeId: string;
  taskId: string;
  jobId: string;
  status: string;
  pollIntervalMs: number;
  eventsPath: string;
}

export interface GatewaySSEEnvelope {
  meta?: GatewaySSEMetaEvent;
  progress?: {
    transport: string;
    eventsPath: string;
    jobId: string;
  };
  taskId?: string;
  routeId?: string;
}

// SSE 订阅 key（联合主键）
export interface SSESubscriptionKey {
  routeId: string;
  taskId: string;
}

/**
 * WebSocket broadcast message types for media actions
 */
export interface MediaActionProgressBroadcast {
  type: 'media_action_progress';
  data: {
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
  };
}

export interface MediaActionDoneBroadcast {
  type: 'media_action_done';
  data: {
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
  };
}

export interface MediaActionFailedBroadcast {
  type: 'media_action_failed';
  data: {
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
  };
}

export type MediaActionBroadcast =
  | MediaActionProgressBroadcast
  | MediaActionDoneBroadcast
  | MediaActionFailedBroadcast;
