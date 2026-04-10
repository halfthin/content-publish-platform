import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface SelectedMediaItem {
  assetKey: string;
  rootId: string;
  relativePath: string;
  filename: string;
  parentPath: string;
  thumbUrl: string;
  fileUrl: string;
  mimeType: string;
}

export const useMediaSelectionStore = defineStore('media-selection', () => {
  const selectedMap = ref<Record<string, SelectedMediaItem>>({});

  const selectedItems = computed(() => Object.values(selectedMap.value));
  const selectedCount = computed(() => selectedItems.value.length);

  function isSelected(assetKey: string): boolean {
    return Boolean(selectedMap.value[assetKey]);
  }

  function addSelection(item: SelectedMediaItem) {
    selectedMap.value[item.assetKey] = item;
  }

  function removeSelection(assetKey: string) {
    const nextMap = { ...selectedMap.value };
    delete nextMap[assetKey];
    selectedMap.value = nextMap;
  }

  function toggleSelection(item: SelectedMediaItem) {
    if (isSelected(item.assetKey)) {
      removeSelection(item.assetKey);
      return;
    }

    addSelection(item);
  }

  function clearSelections() {
    selectedMap.value = {};
  }

  return {
    selectedItems,
    selectedCount,
    isSelected,
    addSelection,
    removeSelection,
    toggleSelection,
    clearSelections,
  };
});
