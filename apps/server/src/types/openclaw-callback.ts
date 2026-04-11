export type OpenClawCallbackKind = 'publish' | 'media-action' | 'account';

export type OpenClawCallbackStatus = 'queued' | 'running' | 'success' | 'failed' | 'needs-auth';

export interface OpenClawCallbackRefs {
  publishLogId?: string | null;
  mediaActionId?: string | null;
  contentId?: string | null;
  accountId?: string | null;
}

export interface OpenClawArtifact {
  kind: 'image' | 'video' | 'file' | 'directory' | 'url' | 'json';
  role?: 'generated' | 'published' | 'preview' | 'reference' | 'attachment';
  name?: string | null;
  url?: string | null;
  path?: string | null;
  mimeType?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface OpenClawCallbackResult {
  externalId?: string | null;
  url?: string | null;
  summary?: string | null;
  artifacts?: OpenClawArtifact[];
  extra?: Record<string, unknown> | null;
}

export interface OpenClawCallbackError {
  code?: string | null;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface OpenClawCallbackTarget {
  platform?: string | null;
  channel?: string | null;
}

export interface OpenClawCallbackEnvelopeV1 {
  version: '1.0';
  eventId: string;
  taskId: string;
  source: 'gateway' | 'openclaw';
  kind: OpenClawCallbackKind;
  actionType: string;
  status: OpenClawCallbackStatus;
  refs?: OpenClawCallbackRefs;
  target?: OpenClawCallbackTarget;
  result?: OpenClawCallbackResult | null;
  error?: OpenClawCallbackError | null;
  timestamp: string;
}
