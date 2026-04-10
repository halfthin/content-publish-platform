import { beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { useMediaSelectionStore } from './media-selection.store';

describe('media-selection.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('adds and removes selected assets by assetKey', () => {
    const store = useMediaSelectionStore();
    store.toggleSelection({
      assetKey: 'asset-1',
      rootId: 'dapai',
      relativePath: '2026/04/09/A款/001.png',
      filename: '001.png',
      parentPath: '2026/04/09/A款',
      thumbUrl: '/thumb/asset-1',
      fileUrl: '/file/asset-1',
      mimeType: 'image/png',
    });

    expect(store.selectedItems).toHaveLength(1);
    expect(store.isSelected('asset-1')).toBe(true);

    store.toggleSelection({
      assetKey: 'asset-1',
      rootId: 'dapai',
      relativePath: '2026/04/09/A款/001.png',
      filename: '001.png',
      parentPath: '2026/04/09/A款',
      thumbUrl: '/thumb/asset-1',
      fileUrl: '/file/asset-1',
      mimeType: 'image/png',
    });

    expect(store.selectedItems).toEqual([]);
  });

  it('deduplicates assets selected across directories and pages', () => {
    const store = useMediaSelectionStore();
    const asset = {
      assetKey: 'asset-2',
      rootId: 'dapai',
      relativePath: '2026/04/09/B款/010.png',
      filename: '010.png',
      parentPath: '2026/04/09/B款',
      thumbUrl: '/thumb/asset-2',
      fileUrl: '/file/asset-2',
      mimeType: 'image/png',
    };

    store.addSelection(asset);
    store.addSelection(asset);

    expect(store.selectedItems).toHaveLength(1);
    expect(store.selectedCount).toBe(1);
  });

  it('clears all selected assets', () => {
    const store = useMediaSelectionStore();
    store.addSelection({
      assetKey: 'asset-1',
      rootId: 'dapai',
      relativePath: '2026/04/09/A款/001.png',
      filename: '001.png',
      parentPath: '2026/04/09/A款',
      thumbUrl: '/thumb/asset-1',
      fileUrl: '/file/asset-1',
      mimeType: 'image/png',
    });
    store.addSelection({
      assetKey: 'asset-2',
      rootId: 'dapai',
      relativePath: '2026/04/09/B款/010.png',
      filename: '010.png',
      parentPath: '2026/04/09/B款',
      thumbUrl: '/thumb/asset-2',
      fileUrl: '/file/asset-2',
      mimeType: 'image/png',
    });

    store.clearSelections();
    expect(store.selectedCount).toBe(0);
  });
});
