import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证 token
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理后端统一返回格式 {success, data, error}
apiClient.interceptors.response.use(
  (response) => {
    const result = response.data;
    // 如果后端返回 {success: true, data: ...} 格式，提取 data
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success) {
        return result.data;
      } else {
        return Promise.reject(new Error(result.error || '请求失败'));
      }
    }
    return result;
  },
  (error) => {
    console.error('API Error:', error);
    const message = error.response?.data?.error || error.message || '请求失败';
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
