import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  CreateMediaActionInput,
  DeleteMediaActionResult,
  MediaActionDefinition,
  MediaActionSummary,
  MediaDateTreeYear,
  MediaFavoritePath,
  MediaFolderSummary,
  MediaItem,
  MediaRoot,
} from '@/api/media';
import * as mediaApi from '@/api/media';

function getLatestDatePath(tree: MediaDateTreeYear[]): string | null {
  const year = tree[0];
  const month = year?.months[0];
  const date = month?.dates[0]?.path;
  if (!year || !month || !date) {
    return null;
  }

  return date;
}

function flattenDateTree(tree: MediaDateTreeYear[]): string[] {
  return tree.flatMap((year) =>
    year.months.flatMap((month) => month.dates.map((date) => date.path))
  );
}

export const useMediaLibraryStore = defineStore('media-library', () => {
  const roots = ref<MediaRoot[]>([]);
  const rootId = ref('dapai');
  const dateTree = ref<MediaDateTreeYear[]>([]);
  const favorites = ref<MediaFavoritePath[]>([]);
  const actionDefinitions = ref<MediaActionDefinition[]>([]);
  const recentActions = ref<MediaActionSummary[]>([]);
  const currentDatePath = ref('');
  const workspacePaths = ref<string[]>([]);
  const folderSummaryByPath = ref<Record<string, MediaFolderSummary>>({});
  const itemsByPath = ref<Record<string, MediaItem[]>>({});
  const loadingPaths = ref<Record<string, boolean>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  const workspacePathSet = computed(() => new Set(workspacePaths.value));
  const availableDatePaths = computed(() => flattenDateTree(dateTree.value));
  const availableDatePathSet = computed(() => new Set(availableDatePaths.value));
  const currentDateIndex = computed(() => availableDatePaths.value.indexOf(currentDatePath.value));
  const canOpenNewerDate = computed(() => currentDateIndex.value > 0);
  const canOpenOlderDate = computed(
    () =>
      currentDateIndex.value !== -1 && currentDateIndex.value < availableDatePaths.value.length - 1
  );
  const currentDateFavorite = computed(
    () =>
      favorites.value.find((favorite) => favorite.relativePath === currentDatePath.value) || null
  );

  function setPathLoading(path: string, value: boolean) {
    loadingPaths.value = {
      ...loadingPaths.value,
      [path]: value,
    };
  }

  async function refreshRoots() {
    roots.value = await mediaApi.getMediaRoots();
    if (roots.value[0]?.id) {
      rootId.value = roots.value[0].id;
    }
  }

  async function refreshDateTree() {
    dateTree.value = await mediaApi.getMediaDateTree(rootId.value);
  }

  async function refreshFavorites() {
    favorites.value = await mediaApi.getMediaFavorites();
  }

  async function refreshActionDefinitions() {
    actionDefinitions.value = await mediaApi.getMediaActionDefinitions();
  }

  async function refreshRecentActions() {
    recentActions.value = await mediaApi.getMediaActions(20);
  }

  async function loadFolderSummary(path: string) {
    if (folderSummaryByPath.value[path]) {
      return folderSummaryByPath.value[path];
    }

    const summary = await mediaApi.getMediaFolderSummary(rootId.value, path);
    folderSummaryByPath.value = {
      ...folderSummaryByPath.value,
      [path]: summary,
    };
    return summary;
  }

  async function loadItems(path: string, recursive: boolean) {
    if (itemsByPath.value[path]) {
      return itemsByPath.value[path];
    }

    // Initialize empty array for incremental updates
    itemsByPath.value = {
      ...itemsByPath.value,
      [path]: [],
    };

    const allItems: MediaItem[] = [];
    let cursor: string | undefined;

    while (true) {
      const result = await mediaApi.getMediaItems({
        rootId: rootId.value,
        path,
        recursive,
        limit: 200,
        cursor,
      });
      allItems.push(...result.items);

      // Push incrementally so UI updates as each page arrives
      itemsByPath.value = {
        ...itemsByPath.value,
        [path]: [...allItems],
      };

      if (!result.nextCursor) {
        break;
      }

      cursor = result.nextCursor;
    }

    return allItems;
  }

  async function ensurePathLoaded(path: string) {
    if (!path) {
      return;
    }

    setPathLoading(path, true);
    try {
      if (availableDatePathSet.value.has(path)) {
        const summary = await loadFolderSummary(path);
        await Promise.all(summary.folders.map((folder) => loadItems(folder.relativePath, true)));
      } else {
        await loadItems(path, true);
      }
    } finally {
      setPathLoading(path, false);
    }
  }

  async function openDate(path: string) {
    currentDatePath.value = path;
    workspacePaths.value = workspacePaths.value.filter((item) => item !== path);
    await ensurePathLoaded(path);
  }

  async function openAdjacentDate(direction: 'newer' | 'older') {
    const index = currentDateIndex.value;
    if (index === -1) {
      return null;
    }

    const nextIndex = direction === 'newer' ? index - 1 : index + 1;
    const nextPath = availableDatePaths.value[nextIndex];
    if (!nextPath) {
      return null;
    }

    await openDate(nextPath);
    return nextPath;
  }

  async function addWorkspacePath(path: string) {
    if (!path || path === currentDatePath.value || workspacePathSet.value.has(path)) {
      return;
    }

    workspacePaths.value = [...workspacePaths.value, path];
    await ensurePathLoaded(path);
  }

  function removeWorkspacePath(path: string) {
    workspacePaths.value = workspacePaths.value.filter((item) => item !== path);
  }

  function resetLoadedCache() {
    folderSummaryByPath.value = {};
    itemsByPath.value = {};
    loadingPaths.value = {};
  }

  async function initialize() {
    loading.value = true;
    error.value = null;
    resetLoadedCache();
    try {
      await refreshRoots();
      await Promise.all([
        refreshDateTree(),
        refreshFavorites(),
        refreshActionDefinitions(),
        refreshRecentActions(),
      ]);

      if (!currentDatePath.value) {
        const latestDatePath = getLatestDatePath(dateTree.value);
        if (latestDatePath) {
          currentDatePath.value = latestDatePath;
        }
      }

      if (currentDatePath.value) {
        await ensurePathLoaded(currentDatePath.value);
      }
      if (workspacePaths.value.length > 0) {
        await Promise.all(workspacePaths.value.map((path) => ensurePathLoaded(path)));
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载素材库失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createFavorite(relativePath: string, label?: string) {
    await mediaApi.createMediaFavorite({ rootId: rootId.value, relativePath, label });
    await refreshFavorites();
  }

  async function removeFavorite(id: string) {
    await mediaApi.deleteMediaFavorite(id);
    await refreshFavorites();
  }

  async function renameFavorite(id: string, label: string) {
    await mediaApi.updateMediaFavorite(id, { label });
    await refreshFavorites();
  }

  async function toggleFavoritePinned(favorite: MediaFavoritePath) {
    await mediaApi.updateMediaFavorite(favorite.id, { pinned: !favorite.pinned });
    await refreshFavorites();
  }

  async function submitAction(input: CreateMediaActionInput) {
    const result = await mediaApi.createMediaAction(input);
    await refreshRecentActions();
    return result;
  }

  async function retryAction(id: string) {
    const result = await mediaApi.retryMediaAction(id);
    await refreshRecentActions();
    return result;
  }

  async function deleteAction(id: string): Promise<DeleteMediaActionResult> {
    const result = await mediaApi.deleteMediaAction(id);
    await refreshRecentActions();
    return result;
  }

  function isFavoritePath(path: string) {
    return favorites.value.some((favorite) => favorite.relativePath === path);
  }

  function isDatePath(path: string) {
    return availableDatePathSet.value.has(path);
  }

  function getItemsForPath(path: string): MediaItem[] {
    return itemsByPath.value[path] || [];
  }

  function getFolderSummaryForPath(path: string): MediaFolderSummary | null {
    return folderSummaryByPath.value[path] || null;
  }

  return {
    roots,
    rootId,
    dateTree,
    favorites,
    actionDefinitions,
    recentActions,
    availableDatePaths,
    currentDatePath,
    currentDateFavorite,
    workspacePaths,
    loadingPaths,
    loading,
    error,
    canOpenNewerDate,
    canOpenOlderDate,
    initialize,
    refreshDateTree,
    refreshFavorites,
    refreshActionDefinitions,
    refreshRecentActions,
    openDate,
    openAdjacentDate,
    addWorkspacePath,
    removeWorkspacePath,
    createFavorite,
    removeFavorite,
    renameFavorite,
    toggleFavoritePinned,
    submitAction,
    retryAction,
    deleteAction,
    ensurePathLoaded,
    isFavoritePath,
    isDatePath,
    getItemsForPath,
    getFolderSummaryForPath,
  };
});
