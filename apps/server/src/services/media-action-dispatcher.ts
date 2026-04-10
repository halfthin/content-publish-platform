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
      const payload = {
        jobId: summary.id,
        actionType: summary.actionType,
        operator: summary.operator,
        assets: summary.assets,
        formData: summary.formData,
        context: summary.context,
        source: 'content-publish-platform/media-library',
        requestedAt: new Date().toISOString(),
        callback: {
          url: callbackUrl,
          token: config.fromGatewayToken,
        },
      };

      try {
        const response = await fetchImpl(
          `${config.url}${config.routePrefix}/${summary.actionType}/dispatch`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(config.toGatewayToken
                ? { Authorization: `Bearer ${config.toGatewayToken}` }
                : {}),
            },
            body: JSON.stringify(payload),
          }
        );

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
