import apiClient from './client';

export interface Content {
  id: string;
  title: string;
  description?: string;
  type: 'IMAGE' | 'VIDEO' | 'MIXED';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  basePath: string;
  images: string[];
  video?: string;
  mdFile: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  tags: string[];
  category?: string;
  publishCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentWithPreview extends Content {
  previewUrls: string[];
  mdContent?: string;
}

export interface ContentPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContentListParams {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  category?: string;
  search?: string;
}

export interface ContentListResponse {
  data: Content[];
  pagination: ContentPagination;
}

export interface ContentDetailResponse {
  data: ContentWithPreview;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * 获取内容列表
 */
export async function getContents(params: ContentListParams = {}): Promise<ContentListResponse> {
  const response = await apiClient.get('/contents', { params });
  return response as unknown as ContentListResponse;
}

/**
 * 获取内容详情
 */
export async function getContentById(id: string): Promise<ContentDetailResponse> {
  const response = await apiClient.get(`/contents/${id}`);
  return response as unknown as ContentDetailResponse;
}

/**
 * 获取内容文件 URL
 */
export function getContentFileUrl(contentId: string, filepath: string): string {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
  return `${API_BASE_URL}/contents/${contentId}/files/${encodeURIComponent(filepath)}`;
}

/**
 * 审核通过内容
 */
export async function approveContent(
  id: string,
  reviewedBy: string,
  note?: string
): Promise<ApiResponse> {
  const response = await apiClient.post(`/contents/${id}/approve`, {
    reviewedBy,
    note,
  });
  return response as unknown as ApiResponse;
}

/**
 * 审核拒绝内容
 */
export async function rejectContent(
  id: string,
  reviewedBy: string,
  note?: string
): Promise<ApiResponse> {
  const response = await apiClient.post(`/contents/${id}/reject`, {
    reviewedBy,
    note,
  });
  return response as unknown as ApiResponse;
}

/**
 * 扫描收件箱
 */
export async function scanInbox(): Promise<ApiResponse> {
  const response = await apiClient.post('/contents/scan-inbox');
  return response as unknown as ApiResponse;
}

/**
 * 发布内容
 */
export async function publishContent(
  id: string,
  platform: string,
  accountId?: string
): Promise<ApiResponse> {
  const response = await apiClient.post(`/contents/${id}/publish`, {
    platform,
    accountId,
  });
  return response as unknown as ApiResponse;
}
