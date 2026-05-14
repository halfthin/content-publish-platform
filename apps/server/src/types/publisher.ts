/** 发布结果 */
export interface PublishResult {
  success: boolean;
  externalId?: string; // 平台返回的 ID（如笔记 ID）
  url?: string; // 发布后的链接
  error?: string;
  errorCode?: string;
  raw?: unknown;
}

/** 认证状态 */
export interface AuthStatus {
  loggedIn: boolean;
  accountName?: string;
  message?: string;
}

/** 认证初始化结果 */
export interface AuthInitResult {
  type: 'qrcode' | 'url' | 'none';
  data?: string; // Base64 或跳转链接
  expiresIn?: number; // 过期秒数
}

/**
 * 发布任务（各平台通用）
 * 这是 Publisher 接口使用的通用格式，与 queues/publish-queue.ts 的 PublishJobData
 * 并存。PublishJobData 是 BullMQ 专用负载（字段对应旧队列逻辑），
 * 而 PublishJobPayload 是 Publisher 的标准入参。
 * TODO: 后续统一为 PublishJobPayload。
 */
export interface PublishJobPayload {
  id: string;
  platform: string;
  accountId: string;
  accountName: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** 进度事件 */
export interface ProgressEvent {
  type: 'publish' | 'auth';
  jobId?: string;
  platform: string;
  instance?: string;
  status: string;
  progress?: number;
  message?: string;
  data?: unknown;
}

/** Publisher 接口 */
export interface Publisher {
  readonly platform: string;
  readonly name: string;

  /** 执行发布 */
  publish(job: PublishJobPayload): Promise<PublishResult>;

  /** 检查认证状态 */
  checkAuth(): Promise<AuthStatus>;

  /** 发起认证流程（扫码/跳转），非必需 */
  startAuth?(): Promise<AuthInitResult>;

  /** 重置认证（清除凭据重新认证） */
  refreshAuth?(): Promise<AuthInitResult>;

  /** 启动时校验配置 */
  validateConfig(): boolean;
}
