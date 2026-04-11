import { createLogger } from '../config/logger';
import {
  getMediaActionGatewayConfig,
  type MediaActionGatewayConfig,
} from '../config/media-actions';
import type {
  MediaActionDispatcher,
  MediaActionDispatchResult,
  MediaActionSummary,
} from './media-actions.service';

const logger = createLogger('media-action-dispatcher');

interface CreateHttpMediaActionDispatcherOptions {
  config?: Partial<MediaActionGatewayConfig>;
  fetchImpl?: typeof fetch;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeRoutePrefix(value: string): string {
  if (!value) {
    return '/webhooks/cpp/media-actions';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return trimTrailingSlash(withLeadingSlash);
}

function normalizeAbsolutePath(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return trimTrailingSlash(withLeadingSlash);
}

function resolveGatewayConfig(
  overrides: Partial<MediaActionGatewayConfig> = {}
): MediaActionGatewayConfig {
  const base = getMediaActionGatewayConfig();
  return {
    ...base,
    ...overrides,
    url: trimTrailingSlash(overrides.url || base.url || ''),
    callbackBaseUrl: trimTrailingSlash(overrides.callbackBaseUrl || base.callbackBaseUrl),
    routePrefix: normalizeRoutePrefix(overrides.routePrefix || base.routePrefix),
    imageToImageDispatchPath: normalizeAbsolutePath(
      overrides.imageToImageDispatchPath || base.imageToImageDispatchPath,
      '/webhooks/cpp/oc/vd-shoot'
    ),
  };
}

function extractExternalTaskId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    (typeof record.taskId === 'string' && record.taskId) ||
    (typeof record.externalTaskId === 'string' && record.externalTaskId);
  if (direct) {
    return direct;
  }

  const nested = record.data;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    return (
      (typeof nestedRecord.taskId === 'string' && nestedRecord.taskId) ||
      (typeof nestedRecord.externalTaskId === 'string' && nestedRecord.externalTaskId) ||
      undefined
    );
  }

  return undefined;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return false;
}

function buildDefaultPayload(
  summary: MediaActionSummary,
  callbackUrl: string,
  callbackToken: string
) {
  return {
    jobId: summary.id,
    actionType: summary.actionType,
    operator: summary.operator,
    refs: {
      mediaActionId: summary.id,
    },
    assets: summary.assets,
    formData: summary.formData,
    context: summary.context,
    source: 'content-publish-platform/media-library',
    requestedAt: new Date().toISOString(),
    callback: {
      url: callbackUrl,
      token: callbackToken,
    },
  };
}

function buildImageToImagePayload(
  summary: MediaActionSummary,
  callbackUrl: string,
  callbackToken: string
) {
  const formData = summary.formData || {};

  return {
    taskId: summary.id,
    refs: {
      mediaActionId: summary.id,
    },
    callback: {
      url: callbackUrl,
      token: callbackToken,
    },
    mode: normalizeOptionalString(formData.mode) || 'lifestyle',
    person: normalizeOptionalString(formData.person),
    productCode: normalizeOptionalString(formData.productCode),
    scene: normalizeOptionalString(formData.scene),
    style: normalizeOptionalString(formData.style),
    mood: normalizeOptionalString(formData.mood),
    count: normalizeOptionalNumber(formData.count),
    size: normalizeOptionalString(formData.size),
    model: normalizeOptionalString(formData.model),
    dryRun: normalizeBoolean(formData.dryRun),
    referenceImages: {
      ...(summary.assets[0]?.sourcePath ? { product: summary.assets[0].sourcePath } : {}),
      ...(summary.assets[1]?.sourcePath ? { outfit: summary.assets[1].sourcePath } : {}),
      ...(normalizeOptionalString(formData.referenceFace)
        ? { face: normalizeOptionalString(formData.referenceFace) }
        : {}),
      ...(normalizeOptionalString(formData.referenceBody)
        ? { body: normalizeOptionalString(formData.referenceBody) }
        : {}),
    },
    description: normalizeOptionalString(formData.description),
  };
}

export function createHttpMediaActionDispatcher(
  options: CreateHttpMediaActionDispatcherOptions = {}
): MediaActionDispatcher {
  const config = resolveGatewayConfig(options.config);
  const fetchImpl = options.fetchImpl || fetch;

  return {
    async dispatch(summary: MediaActionSummary): Promise<MediaActionDispatchResult> {
      if (!config.url) {
        return {
          accepted: false,
          error: 'MEDIA_ACTION_GATEWAY_URL is not configured',
        };
      }

      const callbackUrl = `${config.callbackBaseUrl}/api/webhook/media-actions/${summary.actionType}/result`;
      const payload =
        summary.actionType === 'image-to-image'
          ? buildImageToImagePayload(summary, callbackUrl, config.fromGatewayToken)
          : buildDefaultPayload(summary, callbackUrl, config.fromGatewayToken);
      const dispatchUrl =
        summary.actionType === 'image-to-image'
          ? `${config.url}${config.imageToImageDispatchPath}`
          : `${config.url}${config.routePrefix}/${summary.actionType}/dispatch`;

      try {
        const response = await fetchImpl(dispatchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.toGatewayToken ? { Authorization: `Bearer ${config.toGatewayToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.warn('Media action gateway rejected dispatch', {
            status: response.status,
            error: errorText,
            jobId: summary.id,
          });
          return {
            accepted: false,
            error: `Gateway returned ${response.status}: ${errorText}`,
          };
        }

        const result = await response.json().catch(() => ({}));

        return {
          accepted: true,
          externalTaskId: extractExternalTaskId(result) || summary.id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Media action dispatch failed', { error: message, jobId: summary.id });
        return {
          accepted: false,
          error: message,
        };
      }
    },
  };
}
