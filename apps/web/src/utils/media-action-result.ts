import {
  getMediaActionUploadFileUrl,
  type MediaActionCallbackResult,
  type MediaActionResultArtifact,
  type MediaActionSummary,
  type MediaActionUploadFile,
  type MediaActionUploadPayload,
} from '@/api/media';

export interface MediaActionResultImageView {
  key: string;
  url: string;
  title: string;
  caption: string;
  source: 'upload' | 'artifact' | 'result-url';
  mimeType: string | null;
  relativePath?: string;
  originalName?: string;
  storedName?: string;
}

export interface MediaActionUploadFileView {
  key: string;
  url: string;
  relativePath: string;
  storedName: string;
  originalName: string;
  mimeType: string | null;
  size: number | null;
}

export interface MediaActionUploadView {
  provider: string | null;
  fileCount: number;
  directory: string | null;
  manifestPath: string | null;
  manifestUrl: string | null;
  files: MediaActionUploadFileView[];
}

export interface MediaActionResultView {
  summary: string | null;
  externalId: string | null;
  resultUrl: string | null;
  upload: MediaActionUploadView | null;
  images: MediaActionResultImageView[];
  artifacts: MediaActionResultArtifact[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readResult(
  callbackPayload: MediaActionSummary['callbackPayload']
): MediaActionCallbackResult | null {
  if (!isRecord(callbackPayload)) {
    return null;
  }

  const result = callbackPayload.result;
  return isRecord(result) ? (result as MediaActionCallbackResult) : null;
}

function readArtifacts(result: MediaActionCallbackResult | null): MediaActionResultArtifact[] {
  return Array.isArray(result?.artifacts)
    ? result.artifacts.filter((item): item is MediaActionResultArtifact => isRecord(item))
    : [];
}

function readUploadPayload(
  result: MediaActionCallbackResult | null
): MediaActionUploadPayload | null {
  const extra = isRecord(result?.extra) ? result.extra : null;
  const upload = extra && isRecord(extra.upload) ? extra.upload : null;
  return upload ? (upload as MediaActionUploadPayload) : null;
}

function isPreviewableImageMimeType(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith('image/');
}

function looksLikePreviewableImageUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/api/') ||
    normalized.startsWith('data:image/')
  );
}

function toUploadFileView(
  actionId: string,
  file: MediaActionUploadFile
): MediaActionUploadFileView | null {
  const relativePath = asString(file.relativePath);
  if (!relativePath) {
    return null;
  }

  return {
    key: `${relativePath}:${asString(file.originalName) || ''}`,
    url: getMediaActionUploadFileUrl(actionId, relativePath),
    relativePath,
    storedName: asString(file.storedName) || relativePath.split('/').pop() || relativePath,
    originalName: asString(file.originalName) || asString(file.storedName) || relativePath,
    mimeType: asString(file.mimeType),
    size: asNumber(file.size),
  };
}

export function extractMediaActionResultView(
  action: MediaActionSummary | null | undefined
): MediaActionResultView {
  const result = readResult(action?.callbackPayload);
  const artifacts = readArtifacts(result);
  const uploadPayload = readUploadPayload(result);
  const uploadFiles = Array.isArray(uploadPayload?.files)
    ? uploadPayload.files
        .map((file) => toUploadFileView(action?.id || '', file))
        .filter((file): file is MediaActionUploadFileView => Boolean(file))
    : [];

  const upload: MediaActionUploadView | null =
    action && uploadPayload
      ? {
          provider: asString(uploadPayload.provider),
          fileCount:
            asNumber(uploadPayload.fileCount) ||
            uploadFiles.length ||
            (Array.isArray(uploadPayload.files) ? uploadPayload.files.length : 0),
          directory: asString(uploadPayload.directory),
          manifestPath: asString(uploadPayload.manifestPath),
          manifestUrl: asString(uploadPayload.manifestPath)
            ? getMediaActionUploadFileUrl(action.id, asString(uploadPayload.manifestPath) || '')
            : null,
          files: uploadFiles,
        }
      : null;

  const images: MediaActionResultImageView[] = [];
  const seenUrls = new Set<string>();

  for (const file of upload?.files || []) {
    if (!isPreviewableImageMimeType(file.mimeType)) {
      continue;
    }

    if (seenUrls.has(file.url)) {
      continue;
    }

    seenUrls.add(file.url);
    images.push({
      key: `upload:${file.relativePath}`,
      url: file.url,
      title: file.relativePath,
      caption: file.originalName,
      source: 'upload',
      mimeType: file.mimeType,
      relativePath: file.relativePath,
      originalName: file.originalName,
      storedName: file.storedName,
    });
  }

  for (const artifact of artifacts) {
    const relativePath = isRecord(artifact.meta) ? asString(artifact.meta.relativePath) : null;
    const artifactUrl =
      (relativePath && action ? getMediaActionUploadFileUrl(action.id, relativePath) : null) ||
      asString(artifact.url);
    const mimeType = asString(artifact.mimeType);

    if (
      artifact.kind !== 'image' ||
      !artifactUrl ||
      (!isPreviewableImageMimeType(mimeType) && !looksLikePreviewableImageUrl(artifactUrl))
    ) {
      continue;
    }

    if (seenUrls.has(artifactUrl)) {
      continue;
    }

    seenUrls.add(artifactUrl);
    images.push({
      key: `artifact:${artifactUrl}`,
      url: artifactUrl,
      title: relativePath || asString(artifact.path) || artifactUrl,
      caption: asString(artifact.name) || relativePath || artifactUrl,
      source: 'artifact',
      mimeType,
      relativePath: relativePath || undefined,
    });
  }

  const resultUrl = asString(result?.url);
  if (resultUrl && looksLikePreviewableImageUrl(resultUrl) && !seenUrls.has(resultUrl)) {
    seenUrls.add(resultUrl);
    images.push({
      key: `result-url:${resultUrl}`,
      url: resultUrl,
      title: resultUrl,
      caption: '结果链接',
      source: 'result-url',
      mimeType: null,
    });
  }

  return {
    summary: asString(result?.summary),
    externalId: asString(result?.externalId),
    resultUrl,
    upload,
    images,
    artifacts,
  };
}
