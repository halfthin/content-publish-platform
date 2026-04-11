import apiClient from './client';

export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  url?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface Account {
  id: string;
  name: string;
  platform: string;
  username?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BANNED';
  loginStatus: 'LOGGED_IN' | 'EXPIRED' | 'UNKNOWN';
  groupId?: string;
  remark?: string;
  cookies?: BrowserCookie[] | string;
  cookieUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastCheckLoginCallback?: {
    accountId: string;
    taskId: string;
    eventId: string;
    status: string;
    updatedAt: string;
    callbackPayload: {
      raw?: Record<string, unknown>;
      normalized?: Record<string, unknown>;
    };
  } | null;
}

export interface CreateAccountDto {
  name: string;
  platform: string;
  groupId?: string;
  username?: string;
  remark?: string;
}

export interface UpdateAccountDto {
  name?: string;
  platform?: string;
  groupId?: string;
  username?: string;
  remark?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BANNED';
}

export interface CookieConfigDto {
  cookies: BrowserCookie[] | string;
  password?: string;
}

export interface VerifyCookieDetails {
  url: string;
  pageTitle: string;
  httpStatus?: number;
  hasAvatar: boolean;
  hasLoginButton: boolean;
  hasAuthCookies?: boolean;
  hasCreatorPublishEntry?: boolean;
  detectedProfileLinks?: {
    htmlProfileLinks: string[];
    domProfileLinks: string[];
  };
}

export interface VerifyCookieResult {
  isLoggedIn: boolean;
  verifiedAt: string | Date;
  platform: string;
  verifyMethod?: string;
  verifyDetails?: VerifyCookieDetails;
}

/**
 * 获取账号列表
 */
export async function getAccounts(params?: {
  platform?: string;
  status?: string;
}): Promise<Account[]> {
  return (await apiClient.get('/accounts', { params })) as Account[];
}

/**
 * 获取账号详情
 */
export async function getAccount(id: string): Promise<Account> {
  return (await apiClient.get(`/accounts/${id}`)) as Account;
}

/**
 * 创建账号
 */
export async function createAccount(data: CreateAccountDto): Promise<Account> {
  return (await apiClient.post('/accounts', data)) as Account;
}

/**
 * 更新账号
 */
export async function updateAccount(id: string, data: UpdateAccountDto): Promise<Account> {
  return (await apiClient.put(`/accounts/${id}`, data)) as Account;
}

/**
 * 删除账号
 */
export async function deleteAccount(id: string): Promise<unknown> {
  return apiClient.delete(`/accounts/${id}`);
}

/**
 * 切换账号状态
 */
export async function toggleAccountStatus(id: string): Promise<Account> {
  return (await apiClient.post(`/accounts/${id}/toggle-status`)) as Account;
}

/**
 * 保存 Cookie
 */
export async function saveCookie(id: string, data: CookieConfigDto): Promise<unknown> {
  return apiClient.post(`/accounts/${id}/cookies`, data);
}

/**
 * 验证 Cookie
 */
export async function verifyCookie(id: string, password?: string): Promise<VerifyCookieResult> {
  return (await apiClient.get(`/accounts/${id}/cookies/verify`, {
    params: { password },
  })) as VerifyCookieResult;
}

/**
 * 删除 Cookie
 */
export async function deleteCookie(id: string): Promise<unknown> {
  return apiClient.delete(`/accounts/${id}/cookies`);
}
