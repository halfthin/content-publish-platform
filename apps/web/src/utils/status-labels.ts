/**
 * 共享状态标签工具函数
 * 避免在多个组件中重复定义状态映射
 */

// 内容状态映射
export const contentStatusMap: Record<string, { label: string; type: string }> = {
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已拒绝', type: 'danger' },
  PUBLISHING: { label: '发布中', type: 'primary' },
  PUBLISHED: { label: '已发布', type: '' },
  FAILED: { label: '失败', type: 'danger' },
};

// 内容类型映射
export const contentTypeMap: Record<string, { label: string; type: string }> = {
  IMAGE: { label: '图片', type: 'info' },
  VIDEO: { label: '视频', type: 'warning' },
  MIXED: { label: '混合', type: '' },
};

// 账号状态映射
export const accountStatusMap: Record<string, { label: string; type: string }> = {
  ACTIVE: { label: '正常', type: 'success' },
  INACTIVE: { label: '停用', type: 'info' },
  SUSPENDED: { label: '暂停', type: 'warning' },
  BANNED: { label: '封禁', type: 'danger' },
};

// 登录状态映射
export const loginStatusMap: Record<string, { label: string; type: string }> = {
  LOGGED_IN: { label: '已登录', type: 'success' },
  EXPIRED: { label: '过期', type: 'warning' },
  UNKNOWN: { label: '未知', type: 'info' },
  CHECKING: { label: '检测中', type: 'primary' },
};

// 发布状态映射
export const publishStatusMap: Record<string, { label: string; type: string }> = {
  PENDING: { label: '等待执行', type: 'info' },
  QUEUED: { label: '已入队', type: 'primary' },
  RUNNING: { label: '执行中', type: 'primary' },
  NEEDS_AUTH: { label: '需要认证', type: 'warning' },
  USER_INTERVENING: { label: '用户介入中', type: 'warning' },
  RESUMED: { label: '已恢复', type: 'success' },
  SUCCESS: { label: '成功', type: 'success' },
  FAILED: { label: '失败', type: 'danger' },
  CANCELLED: { label: '已取消', type: 'info' },
  RETRYING: { label: '重试中', type: 'warning' },
};

/**
 * 获取内容状态标签
 */
export function getContentStatusLabel(status: string): string {
  return contentStatusMap[status]?.label || status;
}

export function getContentStatusType(status: string): string {
  return contentStatusMap[status]?.type || '';
}

/**
 * 获取内容类型标签
 */
export function getContentTypeLabel(type: string): string {
  return contentTypeMap[type]?.label || type;
}

export function getContentTypeType(type: string): string {
  return contentTypeMap[type]?.type || '';
}

/**
 * 获取账号状态标签
 */
export function getAccountStatusLabel(status: string): string {
  return accountStatusMap[status]?.label || status;
}

export function getAccountStatusType(status: string): string {
  return accountStatusMap[status]?.type || '';
}

/**
 * 获取登录状态标签
 */
export function getLoginStatusLabel(status: string): string {
  return loginStatusMap[status]?.label || status;
}

export function getLoginStatusType(status: string): string {
  return loginStatusMap[status]?.type || '';
}

/**
 * 获取发布状态标签
 */
export function getPublishStatusLabel(status: string): string {
  return publishStatusMap[status]?.label || status;
}

export function getPublishStatusType(status: string): string {
  return publishStatusMap[status]?.type || '';
}
