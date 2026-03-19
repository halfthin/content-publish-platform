import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export interface PublishLog {
  id: string;
  contentId: string;
  accountId: string;
  platform: string;
  status: string;
  publishedUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  retryCount: number;
  jobId?: string;
  jobState?: string;
  createdAt: string;
  updatedAt: string;
  content?: {
    id: string;
    title: string;
    type: string;
    status: string;
  };
  account?: {
    id: string;
    name: string;
    platform: string;
    username?: string;
  };
}

export interface PublishStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byStatus: Record<string, number>;
  byPlatform: Record<string, number>;
}

export interface PublishStatusData {
  contentId: string;
  publishLogs: PublishLog[];
}

export interface AccountPublishHistory {
  accountId: string;
  publishLogs: PublishLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * 获取内容的发布状态
 */
export async function getContentPublishStatus(contentId: string): Promise<PublishStatusData> {
  const response = await axios.get(`${API_BASE}/publish-status/content/${contentId}`);
  if (response.data.success) {
    return response.data.data;
  }
  throw new Error(response.data.error || 'Failed to get publish status');
}

/**
 * 获取账号的发布历史
 */
export async function getAccountPublishHistory(
  accountId: string,
  limit: number = 20,
  offset: number = 0
): Promise<AccountPublishHistory> {
  const response = await axios.get(`${API_BASE}/publish-status/account/${accountId}`, {
    params: { limit, offset },
  });
  if (response.data.success) {
    return response.data.data;
  }
  throw new Error(response.data.error || 'Failed to get publish history');
}

/**
 * 获取发布统计
 */
export async function getPublishStats(): Promise<PublishStats> {
  const response = await axios.get(`${API_BASE}/publish-status/stats`);
  if (response.data.success) {
    return response.data.data;
  }
  throw new Error(response.data.error || 'Failed to get stats');
}

/**
 * 重试失败的发布
 */
export async function retryPublish(publishLogId: string): Promise<{ jobId: string }> {
  const response = await axios.post(`${API_BASE}/publish-status/${publishLogId}/retry`);
  if (response.data.success) {
    return response.data.data;
  }
  throw new Error(response.data.error || 'Failed to retry');
}

/**
 * 获取所有发布日志（用于发布状态页面）
 */
export async function getAllPublishLogs(
  limit: number = 20,
  offset: number = 0
): Promise<{
  publishLogs: PublishLog[];
  pagination: { total: number; limit: number; offset: number };
}> {
  // 注意：后端需要实现 /api/publish-status/account/all 端点
  // 临时使用空 accountId 或修改为获取所有
  const response = await axios.get(`${API_BASE}/publish-status/account/all`, {
    params: { limit, offset },
  });
  if (response.data.success) {
    return response.data.data;
  }
  throw new Error(response.data.error || 'Failed to get all publish logs');
}
