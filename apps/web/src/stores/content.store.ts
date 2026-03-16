import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Content, ContentListParams } from '@/api/contents';
import * as contentApi from '@/api/contents';

export const useContentStore = defineStore('content', () => {
  // State
  const contents = ref<Content[]>([]);
  const currentContent = ref<Content | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // 分页信息
  const pagination = ref({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });

  // 过滤参数
  const filterParams = ref<ContentListParams>({
    page: 1,
    limit: 20,
  });

  // Getters
  const pendingContents = computed(() => 
    contents.value.filter(c => c.status === 'PENDING')
  );

  const approvedContents = computed(() => 
    contents.value.filter(c => c.status === 'APPROVED')
  );

  const hasMore = computed(() => 
    pagination.value.page < pagination.value.totalPages
  );

  // Actions
  async function fetchContents(params: ContentListParams = {}) {
    loading.value = true;
    error.value = null;

    try {
      const mergeParams = { ...filterParams.value, ...params };
      const result = await contentApi.getContents(mergeParams);
      
      contents.value = (result as any).data || result || [];
      pagination.value = (result as any).pagination || pagination.value;
      filterParams.value = mergeParams;
      
      return result;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '加载失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchContentDetail(id: string) {
    loading.value = true;
    error.value = null;

    try {
      const result = await contentApi.getContentById(id);
      currentContent.value = (result as any).data || result;
      return result;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '加载失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function approveContentAction(id: string, reviewedBy: string, note?: string) {
    try {
      const result = await contentApi.approveContent(id, reviewedBy, note);
      
      // 更新本地状态
      const index = contents.value.findIndex(c => c.id === id);
      if (index !== -1) {
        contents.value[index] = {
          ...contents.value[index],
          status: 'APPROVED',
          reviewedBy,
          reviewedAt: new Date().toISOString(),
          reviewNote: note,
        };
      }
      
      if (currentContent.value?.id === id) {
        currentContent.value.status = 'APPROVED';
      }
      
      return result;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '审核失败';
      throw err;
    }
  }

  async function rejectContentAction(id: string, reviewedBy: string, note?: string) {
    try {
      const result = await contentApi.rejectContent(id, reviewedBy, note);
      
      // 更新本地状态
      const index = contents.value.findIndex(c => c.id === id);
      if (index !== -1) {
        contents.value[index] = {
          ...contents.value[index],
          status: 'REJECTED',
          reviewedBy,
          reviewedAt: new Date().toISOString(),
          reviewNote: note,
        };
      }
      
      if (currentContent.value?.id === id) {
        currentContent.value.status = 'REJECTED';
      }
      
      return result;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '审核失败';
      throw err;
    }
  }

  async function scanInboxAction() {
    try {
      const result = await contentApi.scanInbox();
      // 刷新列表
      await fetchContents();
      return result;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : '扫描失败';
      throw err;
    }
  }

  function clearCurrentContent() {
    currentContent.value = null;
  }

  function setPage(page: number) {
    filterParams.value.page = page;
  }

  function setLimit(limit: number) {
    filterParams.value.limit = limit;
    filterParams.value.page = 1;
  }

  function setFilter(key: keyof ContentListParams, value: string | number | undefined) {
    (filterParams.value as Record<string, unknown>)[key] = value;
    filterParams.value.page = 1;
  }

  return {
    // State
    contents,
    currentContent,
    loading,
    error,
    pagination,
    filterParams,
    
    // Getters
    pendingContents,
    approvedContents,
    hasMore,
    
    // Actions
    fetchContents,
    fetchContentDetail,
    approveContentAction,
    rejectContentAction,
    scanInboxAction,
    clearCurrentContent,
    setPage,
    setLimit,
    setFilter,
  };
});
