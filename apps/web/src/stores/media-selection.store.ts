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
  tags?: string[];
}

type SelectionMovePosition = 'before' | 'after';

export const useMediaSelectionStore = defineStore('media-selection', () => {
  const selectedItemsState = ref<SelectedMediaItem[]>([]);
  const selectedMap = computed(() =>
    selectedItemsState.value.reduce<Record<string, SelectedMediaItem>>((result, item) => {
      result[item.assetKey] = item;
      return result;
    }, {})
  );

  const selectedItems = computed(() => selectedItemsState.value);
  const selectedCount = computed(() => selectedItemsState.value.length);

  function isSelected(assetKey: string): boolean {
    return Boolean(selectedMap.value[assetKey]);
  }

  function addSelection(item: SelectedMediaItem) {
    const existingIndex = selectedItemsState.value.findIndex(
      (selectedItem) => selectedItem.assetKey === item.assetKey
    );

    if (existingIndex === -1) {
      selectedItemsState.value = [...selectedItemsState.value, item];
      return;
    }

    const nextItems = [...selectedItemsState.value];
    nextItems[existingIndex] = item;
    selectedItemsState.value = nextItems;
  }

  function removeSelection(assetKey: string) {
    selectedItemsState.value = selectedItemsState.value.filter(
      (item) => item.assetKey !== assetKey
    );
  }

  function toggleSelection(item: SelectedMediaItem) {
    if (isSelected(item.assetKey)) {
      removeSelection(item.assetKey);
      return;
    }

    addSelection(item);
  }

  function clearSelections() {
    selectedItemsState.value = [];
  }

  function moveSelection(
    sourceAssetKey: string,
    targetAssetKey: string,
    position: SelectionMovePosition = 'before'
  ) {
    if (sourceAssetKey === targetAssetKey) {
      return;
    }

    const sourceIndex = selectedItemsState.value.findIndex(
      (item) => item.assetKey === sourceAssetKey
    );
    const targetIndex = selectedItemsState.value.findIndex(
      (item) => item.assetKey === targetAssetKey
    );

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextItems = [...selectedItemsState.value];
    const [sourceItem] = nextItems.splice(sourceIndex, 1);
    const adjustedTargetIndex = nextItems.findIndex((item) => item.assetKey === targetAssetKey);
    const insertIndex = position === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
    nextItems.splice(insertIndex, 0, sourceItem);
    selectedItemsState.value = nextItems;
  }

  function moveSelectionBefore(sourceAssetKey: string, targetAssetKey: string) {
    moveSelection(sourceAssetKey, targetAssetKey, 'before');
  }

  return {
    selectedItems,
    selectedCount,
    isSelected,
    addSelection,
    removeSelection,
    toggleSelection,
    clearSelections,
    moveSelection,
    moveSelectionBefore,
  };
});
