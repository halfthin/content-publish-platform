import apiClient from './client';

export interface Account {
  id: string;
  name: string;
  platform: string;
  username?: string;
  status: 'active' | 'inactive';
  loginStatus: 'LOGGED_IN' | 'EXPIRED' | 'UNKNOWN';
  groupId?: string;
  remark?: string;
  cookies?: any;
  cookieUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  status?: 'active' | 'inactive';
}

export interface CookieConfigDto {
  cookies: any[] | string;
  password?: string;
}

/**
 * 获取账号列表
 */
export async function getAccounts(params?: { platform?: string; status?: string }) {
  const response = await apiClient.get('/accounts', { params });
  return response;
}

/**
 * 获取账号详情
 */
export async function getAccount(id: string) {
  const response = await apiClient.get(`/accounts/${id}`);
  return response;
}

/**
 * 创建账号
 */
export async function createAccount(data: CreateAccountDto) {
  const response = await apiClient.post('/accounts', data);
  return response;
}

/**
 * 更新账号
 */
export async function updateAccount(id: string, data: UpdateAccountDto) {
  const response = await apiClient.put(`/accounts/${id}`, data);
  return response;
}

/**
 * 删除账号
 */
export async function deleteAccount(id: string) {
  const response = await apiClient.delete(`/accounts/${id}`);
  return response;
}

/**
 * 切换账号状态
 */
export async function toggleAccountStatus(id: string) {
  const response = await apiClient.post(`/accounts/${id}/toggle-status`);
  return response;
}

/**
 * 保存 Cookie
 */
export async function saveCookie(id: string, data: CookieConfigDto) {
  const response = await apiClient.post(`/accounts/${id}/cookies`, data);
  return response;
}

/**
 * 验证 Cookie
 */
export async function verifyCookie(id: string, password?: string) {
  const response = await apiClient.get(`/accounts/${id}/cookies/verify`, { 
    params: { password } 
  });
  return response;
}

/**
 * 删除 Cookie
 */
export async function deleteCookie(id: string) {
  const response = await apiClient.delete(`/accounts/${id}/cookies`);
  return response;
}
