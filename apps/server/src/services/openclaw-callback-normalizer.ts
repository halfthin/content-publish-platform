import type {
  OpenClawCallbackEnvelopeV1,
  OpenClawCallbackError,
  OpenClawCallbackKind,
  OpenClawCallbackRefs,
  OpenClawCallbackResult,
  OpenClawCallbackStatus,
} from '../types/openclaw-callback';

interface NormalizeOpenClawCallbackContext {
  kind: OpenClawCallbackKind;
  actionType?: string;
  platform?: string;
}

const PLATFORM_ALIASES: Record<string, string> = {
  xhs: 'xiaohongshu',
};

export class OpenClawCallbackNormalizationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'OpenClawCallbackNormalizationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePlatform(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return PLATFORM_ALIASES[trimmed] || trimmed;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStatus(value: unknown): OpenClawCallbackStatus | null {
  switch (value) {
    case 'queued':
    case 'running':
    case 'success':
    case 'failed':
    case 'needs-auth':
      return value;
    default:
      return null;
  }
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

function normalizeRefs(value: unknown): OpenClawCallbackRefs | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    publishLogId: normalizeString(value.publishLogId),
    mediaActionId: normalizeString(value.mediaActionId),
    contentId: normalizeString(value.contentId),
    accountId: normalizeString(value.accountId),
  };
}

function normalizeError(value: unknown): OpenClawCallbackError | null {
  if (typeof value === 'string') {
    const message = normalizeString(value);
    return message ? { message } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const message = normalizeString(value.message);
  if (!message) {
    return null;
  }

  return {
    code: normalizeString(value.code),
    message,
    details: isRecord(value.details) ? value.details : null,
  };
}

function normalizeResult(value: unknown): OpenClawCallbackResult | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    externalId: normalizeString(value.externalId),
    url: normalizeString(value.url),
    summary: normalizeString(value.summary),
    artifacts: Array.isArray(value.artifacts)
      ? value.artifacts.filter(
          (item): item is NonNullable<OpenClawCallbackResult['artifacts']>[number] =>
            isRecord(item) && typeof item.kind === 'string'
        )
      : undefined,
    extra: isRecord(value.extra) ? value.extra : null,
  };
}

function buildFallbackEventId(
  kind: OpenClawCallbackKind,
  taskId: string,
  status: OpenClawCallbackStatus,
  dedupeToken: string
): string {
  return `${kind}:${taskId}:${status}:${dedupeToken}`;
}

function resolveTimestamp(value: unknown): { timestamp: string; dedupeToken: string } {
  const normalizedTimestamp = normalizeString(value);
  if (normalizedTimestamp) {
    return {
      timestamp: normalizedTimestamp,
      dedupeToken: normalizedTimestamp,
    };
  }

  return {
    timestamp: new Date().toISOString(),
    dedupeToken: 'no-timestamp',
  };
}

function normalizeNewEnvelope(
  payload: Record<string, unknown>,
  context: NormalizeOpenClawCallbackContext
): OpenClawCallbackEnvelopeV1 | null {
  const version = normalizeString(payload.version);
  if (version !== '1.0') {
    return null;
  }

  const taskId = normalizeString(payload.taskId);
  const status = normalizeStatus(payload.status);
  if (!taskId || !status) {
    throw new OpenClawCallbackNormalizationError('Invalid OpenClaw callback envelope');
  }

  const kind =
    payload.kind === 'publish' || payload.kind === 'media-action' || payload.kind === 'account'
      ? payload.kind
      : context.kind;
  const actionType = normalizeString(payload.actionType) || context.actionType;
  if (!actionType) {
    throw new OpenClawCallbackNormalizationError('Callback actionType is required');
  }

  const { timestamp, dedupeToken } = resolveTimestamp(payload.timestamp);

  return {
    version: '1.0',
    eventId:
      normalizeString(payload.eventId) || buildFallbackEventId(kind, taskId, status, dedupeToken),
    taskId,
    source: payload.source === 'openclaw' ? 'openclaw' : 'gateway',
    kind,
    actionType,
    status,
    refs: normalizeRefs(payload.refs),
    target: isRecord(payload.target)
      ? {
          platform: normalizePlatform(payload.target.platform),
          channel: normalizeString(payload.target.channel),
        }
      : undefined,
    result: normalizeResult(payload.result),
    error: normalizeError(payload.error),
    timestamp,
  };
}

function normalizeLegacyPublishCallback(
  payload: Record<string, unknown>,
  context: NormalizeOpenClawCallbackContext
): OpenClawCallbackEnvelopeV1 {
  const taskId = normalizeString(payload.taskId);
  const status = normalizeStatus(payload.status);
  const platform = normalizePlatform(payload.platform) || normalizePlatform(context.platform);

  if (!taskId || !status || !platform) {
    throw new OpenClawCallbackNormalizationError('Invalid legacy publish callback payload');
  }

  const { timestamp, dedupeToken } = resolveTimestamp(payload.timestamp);
  const result: OpenClawCallbackResult = {
    externalId: normalizeString(payload.publishedId),
    url: normalizeString(payload.url),
    summary: status === 'success' ? 'Publish callback succeeded' : null,
    extra: null,
  };

  return {
    version: '1.0',
    eventId: buildFallbackEventId('publish', taskId, status, dedupeToken),
    taskId,
    source: 'gateway',
    kind: 'publish',
    actionType: `${platform}.publish`,
    status,
    refs: {
      publishLogId: normalizeString(payload.publishLogId),
      contentId: normalizeString(payload.contentId),
      accountId: normalizeString(payload.accountId),
    },
    target: {
      platform,
      channel: null,
    },
    result,
    error: normalizeError(payload.error),
    timestamp,
  };
}

function normalizeLegacyMediaActionCallback(
  payload: Record<string, unknown>,
  context: NormalizeOpenClawCallbackContext
): OpenClawCallbackEnvelopeV1 {
  const taskId = normalizeString(payload.taskId);
  const status = normalizeStatus(payload.status);
  const actionType = normalizeString(payload.actionType) || context.actionType;

  if (!taskId || !status || !actionType) {
    throw new OpenClawCallbackNormalizationError('Invalid legacy media action callback payload');
  }

  const { timestamp, dedupeToken } = resolveTimestamp(payload.timestamp);

  return {
    version: '1.0',
    eventId: buildFallbackEventId('media-action', taskId, status, dedupeToken),
    taskId,
    source: 'gateway',
    kind: 'media-action',
    actionType,
    status,
    refs: {
      mediaActionId: normalizeString(payload.jobId),
    },
    result: isRecord(payload.result)
      ? {
          externalId: null,
          url: null,
          summary: null,
          artifacts: undefined,
          extra: payload.result,
        }
      : null,
    error: normalizeError(payload.error),
    timestamp,
  };
}

function normalizeLegacyCheckLoginCallback(
  payload: Record<string, unknown>,
  context: NormalizeOpenClawCallbackContext
): OpenClawCallbackEnvelopeV1 {
  const taskId = normalizeString(payload.taskId);
  const platform = normalizePlatform(payload.platform) || normalizePlatform(context.platform);
  const accountId = normalizeString(payload.accountId);
  const loggedIn = normalizeBoolean(payload.loggedIn);
  const success = normalizeBoolean(payload.success);

  if (!taskId || !platform || !accountId || loggedIn === null || success === null) {
    throw new OpenClawCallbackNormalizationError('Invalid legacy check-login callback payload');
  }

  const { timestamp, dedupeToken } = resolveTimestamp(payload.checkedAt || payload.timestamp);
  const username = normalizeString(payload.username);
  const qrcodeUrl = normalizeString(payload.qrcodeUrl);
  const error = normalizeError(payload.error);
  const status: OpenClawCallbackStatus = loggedIn
    ? 'success'
    : qrcodeUrl || success
      ? 'needs-auth'
      : 'failed';

  return {
    version: '1.0',
    eventId: buildFallbackEventId('account', taskId, status, dedupeToken),
    taskId,
    source: 'gateway',
    kind: 'account',
    actionType: `${platform}.check-login`,
    status,
    refs: {
      accountId,
    },
    target: {
      platform,
      channel: null,
    },
    result: {
      externalId: null,
      url: qrcodeUrl,
      summary: loggedIn ? 'Check-login succeeded' : 'Check-login requires authentication',
      artifacts: undefined,
      extra: {
        success,
        loggedIn,
        username,
        qrcodeUrl,
      },
    },
    error,
    timestamp,
  };
}

export function normalizeOpenClawCallback(
  payload: unknown,
  context: NormalizeOpenClawCallbackContext
): OpenClawCallbackEnvelopeV1 {
  if (!isRecord(payload)) {
    throw new OpenClawCallbackNormalizationError('Callback payload must be an object');
  }

  const normalizedEnvelope = normalizeNewEnvelope(payload, context);
  if (normalizedEnvelope) {
    return normalizedEnvelope;
  }

  if (context.kind === 'publish') {
    return normalizeLegacyPublishCallback(payload, context);
  }

  if (context.kind === 'media-action') {
    return normalizeLegacyMediaActionCallback(payload, context);
  }

  if (context.kind === 'account') {
    return normalizeLegacyCheckLoginCallback(payload, context);
  }

  throw new OpenClawCallbackNormalizationError('Unsupported callback payload format');
}
