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

  it('keeps the first selected order and can move an item before another item', () => {
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
      relativePath: '2026/04/09/B款/002.png',
      filename: '002.png',
      parentPath: '2026/04/09/B款',
      thumbUrl: '/thumb/asset-2',
      fileUrl: '/file/asset-2',
      mimeType: 'image/png',
    });
    store.addSelection({
      assetKey: 'asset-3',
      rootId: 'dapai',
      relativePath: '2026/04/09/C款/003.png',
      filename: '003.png',
      parentPath: '2026/04/09/C款',
      thumbUrl: '/thumb/asset-3',
      fileUrl: '/file/asset-3',
      mimeType: 'image/png',
    });

    expect(store.selectedItems.map((item) => item.assetKey)).toEqual([
      'asset-1',
      'asset-2',
      'asset-3',
    ]);

    store.moveSelectionBefore('asset-3', 'asset-1');

    expect(store.selectedItems.map((item) => item.assetKey)).toEqual([
      'asset-3',
      'asset-1',
      'asset-2',
    ]);
  });

  it('keeps selection order stable when re-adding an existing asset', () => {
    const store = useMediaSelectionStore();
    const firstAsset = {
      assetKey: 'asset-1',
      rootId: 'dapai',
      relativePath: '2026/04/09/A款/001.png',
      filename: '001.png',
      parentPath: '2026/04/09/A款',
      thumbUrl: '/thumb/asset-1',
      fileUrl: '/file/asset-1',
      mimeType: 'image/png',
    };
    const secondAsset = {
      assetKey: 'asset-2',
      rootId: 'dapai',
      relativePath: '2026/04/09/B款/002.png',
      filename: '002.png',
      parentPath: '2026/04/09/B款',
      thumbUrl: '/thumb/asset-2',
      fileUrl: '/file/asset-2',
      mimeType: 'image/png',
    };

    store.addSelection(firstAsset);
    store.addSelection(secondAsset);
    store.addSelection(firstAsset);

    expect(store.selectedItems.map((item) => item.assetKey)).toEqual(['asset-1', 'asset-2']);
  });

  it('can move an item after another item', () => {
    const store = useMediaSelectionStore();

    for (const assetKey of ['asset-1', 'asset-2', 'asset-3']) {
      store.addSelection({
        assetKey,
        rootId: 'dapai',
        relativePath: `2026/04/09/${assetKey}/${assetKey}.png`,
        filename: `${assetKey}.png`,
        parentPath: `2026/04/09/${assetKey}`,
        thumbUrl: `/thumb/${assetKey}`,
        fileUrl: `/file/${assetKey}`,
        mimeType: 'image/png',
      });
    }

    store.moveSelection('asset-1', 'asset-3', 'after');

    expect(store.selectedItems.map((item) => item.assetKey)).toEqual([
      'asset-2',
      'asset-3',
      'asset-1',
    ]);
  });
});
