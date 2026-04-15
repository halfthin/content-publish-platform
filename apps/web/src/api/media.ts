import apiClient from './client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export interface MediaRoot {
  id: string;
  label: string;
  path: string;
}

export interface MediaDateTreeYear {
  year: string;
  label: string;
  path: string;
  months: Array<{
    month: string;
    label: string;
    path: string;
    dates: Array<{
      label: string;
      path: string;
    }>;
  }>;
}

export interface MediaFolderSummaryItem {
  name: string;
  relativePath: string;
  imageCount: number;
  coverAssetKey: string | null;
}

export interface MediaFolderSummary {
  rootId: string;
  path: string;
  folders: MediaFolderSummaryItem[];
}

export interface MediaItem {
  assetKey: string;
  rootId: string;
  relativePath: string;
  filename: string;
  parentPath: string;
  size: number;
  modifiedAt: string;
  mimeType: string;
}

export interface MediaItemsResponse {
  items: MediaItem[];
  nextCursor: string | null;
}

export interface MediaFavoritePath {
  id: string;
  rootId: string;
  relativePath: string;
  label: string;
  type: 'DATE' | 'FOLDER';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  exists: boolean;
}

export type ImageToImageMode = 'lifestyle' | 'artistic' | 'lookbook' | 'flat_full' | 'flat_detail';

export interface MediaActionFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required?: boolean;
  placeholder?: string;
}

export interface MediaActionDefinition {
  type: 'wx-work-post' | 'wechat-article' | 'image-to-image' | 'image-recognition';
  label: string;
  description: string;
  fields: MediaActionFieldDefinition[];
  dispatchMethod?: 'POST';
  dispatchPathname?: string;
}

export interface MediaActionAssetSnapshot {
  rootId: string;
  relativePath: string;
  assetKey: string;
  filename: string;
  parentPath: string;
  mimeType: string;
  sourcePath: string;
  fileUrl: string;
  thumbUrl: string;
}

export interface MediaActionResultArtifact {
  kind: 'image' | 'video' | 'file' | 'directory' | 'url' | 'json' | string;
  role?: 'generated' | 'published' | 'preview' | 'reference' | 'attachment' | string | null;
  name?: string | null;
  url?: string | null;
  path?: string | null;
  mimeType?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface MediaActionUploadFile {
  fieldName?: string;
  originalName?: string;
  storedName?: string;
  relativePath?: string;
  absolutePath?: string;
  mimeType?: string;
  size?: number;
  meta?: {
    relativePath?: string;
    originalName?: string;
    size?: number;
    fieldName?: string;
  };
}

export interface MediaActionUploadPayload {
  provider?: string;
  fileCount?: number;
  directory?: string;
  directoryAbsolutePath?: string;
  manifestPath?: string;
  manifestAbsolutePath?: string;
  files?: MediaActionUploadFile[];
}

export interface MediaActionCallbackResult {
  externalId?: string | null;
  url?: string | null;
  summary?: string | null;
  artifacts?: MediaActionResultArtifact[];
  extra?: Record<string, unknown> | null;
}

export interface MediaActionCallbackPayload {
  actionType?: string;
  status?: string;
  result?: MediaActionCallbackResult | Record<string, unknown>;
  timestamp?: string;
  refs?: {
    mediaActionId?: string | null;
  };
}

export interface MediaActionSummary {
  id: string;
  actionType: MediaActionDefinition['type'];
  status: 'QUEUED' | 'DISPATCHING' | 'DISPATCHED' | 'RUNNING' | 'NEEDS_AUTH' | 'SUCCESS' | 'FAILED';
  operator?: string;
  assets: MediaActionAssetSnapshot[];
  formData: Record<string, unknown>;
  context?: {
    workspaceDatePath?: string;
    favoritePaths?: string[];
  };
  externalTaskId?: string;
  error?: string;
  callbackPayload?: MediaActionCallbackPayload | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMediaActionInput {
  actionType: MediaActionDefinition['type'];
  operator?: string;
  assets: Array<{
    rootId: string;
    relativePath: string;
  }>;
  formData?: Record<string, unknown>;
  context?: {
    workspaceDatePath?: string;
    favoritePaths?: string[];
  };
}

export interface DeleteMediaActionResult {
  id: string;
  removedUploadDirectory: string | null;
}

export function getMediaThumbUrl(assetKey: string): string {
  return `${API_BASE_URL}/media/thumb/${assetKey}`;
}

export function getMediaFileUrl(assetKey: string): string {
  return `${API_BASE_URL}/media/file/${assetKey}`;
}

export function getMediaActionUploadFileUrl(actionId: string, relativePath: string): string {
  const encodedPath = relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${API_BASE_URL}/media/actions/${encodeURIComponent(actionId)}/uploads/${encodedPath}`;
}

export function getMediaUploadProviderFileUrl(provider: string, relativePath: string): string {
  const encodedPath = relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${API_BASE_URL}/media/actions/uploads/${encodeURIComponent(provider)}/${encodedPath}`;
}

export async function getMediaRoots(): Promise<MediaRoot[]> {
  return (await apiClient.get('/media/roots')) as MediaRoot[];
}

export async function getMediaDateTree(rootId: string): Promise<MediaDateTreeYear[]> {
  return (await apiClient.get('/media/date-tree', { params: { rootId } })) as MediaDateTreeYear[];
}

export async function getMediaFolderSummary(
  rootId: string,
  path: string
): Promise<MediaFolderSummary> {
  return (await apiClient.get('/media/folder-summary', {
    params: { rootId, path },
  })) as MediaFolderSummary;
}

export async function getMediaItems(params: {
  rootId: string;
  path: string;
  recursive?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<MediaItemsResponse> {
  return (await apiClient.get('/media/items', { params })) as MediaItemsResponse;
}

export async function getMediaFavorites(): Promise<MediaFavoritePath[]> {
  return (await apiClient.get('/media/favorites')) as MediaFavoritePath[];
}

export async function createMediaFavorite(input: {
  rootId: string;
  relativePath: string;
  label?: string;
  pinned?: boolean;
}): Promise<MediaFavoritePath> {
  return (await apiClient.post('/media/favorites', input)) as MediaFavoritePath;
}

export async function updateMediaFavorite(
  id: string,
  input: { label?: string; pinned?: boolean }
): Promise<MediaFavoritePath> {
  return (await apiClient.patch(`/media/favorites/${id}`, input)) as MediaFavoritePath;
}

export async function deleteMediaFavorite(id: string): Promise<{ id: string }> {
  return (await apiClient.delete(`/media/favorites/${id}`)) as { id: string };
}

export async function getMediaActionDefinitions(): Promise<MediaActionDefinition[]> {
  return (await apiClient.get('/media/actions/definitions')) as MediaActionDefinition[];
}

export async function getMediaActions(limit: number = 20): Promise<MediaActionSummary[]> {
  return (await apiClient.get('/media/actions', { params: { limit } })) as MediaActionSummary[];
}

export async function createMediaAction(
  input: CreateMediaActionInput
): Promise<MediaActionSummary> {
  return (await apiClient.post('/media/actions', input)) as MediaActionSummary;
}

export async function getMediaAction(id: string): Promise<MediaActionSummary> {
  return (await apiClient.get(`/media/actions/${id}`)) as MediaActionSummary;
}

export async function retryMediaAction(id: string): Promise<MediaActionSummary> {
  return (await apiClient.post(`/media/actions/${id}/retry`)) as MediaActionSummary;
}

export async function deleteMediaAction(id: string): Promise<DeleteMediaActionResult> {
  return (await apiClient.delete(`/media/actions/${id}`)) as DeleteMediaActionResult;
}

// ========== 上传文件浏览 API ==========

export interface MediaActionUploadRoot {
  id: string;
  label: string;
  path: string;
}

export interface MediaActionUploadDateTreeYear {
  year: string;
  label: string;
  path: string;
  months: Array<{
    month: string;
    label: string;
    path: string;
    days: Array<{
      day: string;
      label: string;
      path: string;
    }>;
  }>;
}

export interface MediaActionUploadItem {
  filename: string;
  relativePath: string;
  parentPath: string;
  size: number;
  modifiedAt: string;
  mimeType: string;
}

export interface MediaActionUploadItemsResponse {
  items: MediaActionUploadItem[];
  nextCursor: string | null;
}

export async function getMediaActionUploadRoots(): Promise<MediaActionUploadRoot[]> {
  const response = (await apiClient.get('/media/actions/uploads/roots')) as MediaActionUploadRoot[];
  return response;
}

export async function getMediaActionUploadTree(
  provider: string,
  path: string = ''
): Promise<MediaActionUploadDateTreeYear[]> {
  const response = (await apiClient.get('/media/actions/uploads/tree', {
    params: { provider, path },
  })) as MediaActionUploadDateTreeYear[];
  return response;
}

export async function getMediaActionUploadItems(params: {
  provider: string;
  path: string;
  recursive?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<MediaActionUploadItemsResponse> {
  const response = (await apiClient.get('/media/actions/uploads/items', { params })) as MediaActionUploadItemsResponse;
  return response;
}

export async function deleteMediaActionUploadFile(
  provider: string,
  relativePath: string
): Promise<void> {
  await apiClient.delete(`/media/actions/uploads/${provider}/${relativePath}`);
}
