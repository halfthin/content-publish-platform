import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { MediaLibraryService } from './media-library.service';
import { createMediaLibraryService, MediaLibraryError } from './media-library.service';
import { createMediaFixtureTree } from './media-library.test-helpers';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;
let service: MediaLibraryService;

describe('media-library.service', () => {
  beforeEach(async () => {
    fixture = await createMediaFixtureTree();
    service = createMediaLibraryService({
      roots: [{ id: 'dapai', label: '大拍 S', path: fixture.rootDir }],
    });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('path resolution', () => {
    it('resolves configured root by rootId', async () => {
      const roots = await service.getRoots();
      expect(roots).toHaveLength(1);
      expect(roots[0]?.id).toBe('dapai');
    });

    it('normalizes empty path to root', async () => {
      const result = await service.resolveDirectory('dapai', '');
      expect(result.relativePath).toBe('');
      expect(result.root.id).toBe('dapai');
    });

    it('rejects path traversal with dot-dot segments', async () => {
      expect(service.resolveDirectory('dapai', '../secret')).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });

    it('rejects resolved path outside root', async () => {
      expect(service.resolveDirectory('dapai', '/etc')).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });

    it('accepts nested date path like 2026/04/09', async () => {
      const result = await service.resolveDirectory('dapai', '2026/04/09');
      expect(result.relativePath).toBe('2026/04/09');
      expect(result.absolutePath.endsWith('/2026/04/09')).toBe(true);
    });
  });

  describe('date tree', () => {
    it('returns year-month-date tree only', async () => {
      const tree = await service.getDateTree('dapai');
      expect(
        tree.some((item) =>
          item.months.some((month) => month.dates.some((date) => date.path === '2026/04/10'))
        )
      ).toBe(true);
      expect(
        tree.some((item) =>
          item.months.some((month) => month.dates.some((date) => date.path === '2025/12/18'))
        )
      ).toBe(true);
    });

    it('ignores non-date malformed folders', async () => {
      const tree = await service.getDateTree('dapai');
      expect(JSON.stringify(tree)).not.toContain('misc');
      expect(JSON.stringify(tree)).not.toContain('not-a-month');
    });

    it('sorts years months and dates descending', async () => {
      const tree = await service.getDateTree('dapai');
      expect(tree[0]?.year).toBe('2026');
      const numeric2026 = tree.find((item) => item.path === '2026');
      expect(numeric2026?.months[0]?.dates.map((item) => item.path)).toEqual([
        '2026/04/10',
        '2026/04/09',
      ]);
    });

    it('does not descend into style folders when building date tree', async () => {
      const tree = await service.getDateTree('dapai');
      expect(JSON.stringify(tree)).not.toContain('A款');
      expect(JSON.stringify(tree)).not.toContain('B款');
    });

    it('supports flexible chinese year month and date directory names', async () => {
      const tree = await service.getDateTree('dapai');
      const year2026 = tree.find((item) => item.label === '2026年');
      expect(year2026).toBeDefined();
      expect(year2026?.months[0]?.label).toBe('4月');
      expect(year2026?.months[0]?.dates.map((item) => item.path)).toEqual([
        '2026年/4月/0409男装',
        '2026年/4月/0407',
      ]);

      const year2025 = tree.find((item) => item.label === '2025年');
      expect(year2025?.months[0]?.dates[0]?.path).toBe('2025年/12月/12.31男装');
    });

    it('supports legacy year/date folders without explicit month directories', async () => {
      const tree = await service.getDateTree('dapai');
      const year2020 = tree.find((item) => item.label === '2020年');
      expect(year2020?.months[0]?.month).toBe('04');
      expect(year2020?.months[0]?.dates[0]?.path).toBe('2020年/0404');
    });
  });

  describe('folder summary', () => {
    it('lists direct child folders under date path', async () => {
      const summary = await service.getFolderSummary('dapai', '2026/04/09');
      expect(summary.path).toBe('2026/04/09');
      expect(summary.folders.map((item) => item.name)).toEqual(['A款', 'B款']);
    });

    it('counts image files inside each style folder', async () => {
      const summary = await service.getFolderSummary('dapai', '2026/04/09');
      expect(summary.folders.find((item) => item.name === 'A款')?.imageCount).toBe(2);
      expect(summary.folders.find((item) => item.name === 'B款')?.imageCount).toBe(1);
    });

    it('returns cover image from first available image', async () => {
      const summary = await service.getFolderSummary('dapai', '2026/04/09');
      const folder = summary.folders.find((item) => item.name === 'A款');
      expect(folder?.coverAssetKey).toBeDefined();
      if (!folder?.coverAssetKey) {
        throw new Error('Expected folder cover asset key');
      }
      const asset = await service.resolveAsset(folder.coverAssetKey);
      expect(asset.relativePath).toBe('2026/04/09/A款/001.png');
    });

    it('ignores non-image files', async () => {
      const summary = await service.getFolderSummary('dapai', '2026/04/09');
      const folder = summary.folders.find((item) => item.name === 'B款');
      expect(folder?.imageCount).toBe(1);
    });
  });

  describe('items listing', () => {
    it('lists images from a folder', async () => {
      const result = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09/A款',
        recursive: false,
        limit: 50,
      });

      expect(result.items.map((item) => item.filename)).toEqual(['001.png', '002.png']);
    });

    it('lists images recursively under a date path', async () => {
      const result = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09',
        recursive: true,
        limit: 50,
      });

      expect(result.items).toHaveLength(3);
      expect(result.items.map((item) => item.parentPath)).toEqual([
        '2026/04/09/A款',
        '2026/04/09/A款',
        '2026/04/09/B款',
      ]);
    });

    it('returns stable ordering by filename path', async () => {
      const result = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09',
        recursive: true,
        limit: 50,
      });

      expect(result.items.map((item) => item.relativePath)).toEqual([
        '2026/04/09/A款/001.png',
        '2026/04/09/A款/002.png',
        '2026/04/09/B款/010.png',
      ]);
    });

    it('supports cursor pagination', async () => {
      const firstPage = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09',
        recursive: true,
        limit: 2,
      });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextCursor).toBeTruthy();

      const secondPage = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09',
        recursive: true,
        limit: 2,
        cursor: firstPage.nextCursor || undefined,
      });

      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0]?.filename).toBe('010.png');
      expect(secondPage.nextCursor).toBeNull();
    });

    it('returns relativePath rootId assetKey and filename', async () => {
      const result = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09/A款',
        recursive: false,
        limit: 1,
      });

      expect(result.items[0]).toMatchObject({
        rootId: 'dapai',
        relativePath: '2026/04/09/A款/001.png',
        filename: '001.png',
      });
      expect(result.items[0]?.assetKey).toBeTruthy();
    });
  });

  describe('asset keys', () => {
    it('resolves an asset key back to file metadata', async () => {
      const result = await service.getItems({
        rootId: 'dapai',
        path: '2026/04/09/A款',
        recursive: false,
        limit: 1,
      });
      const firstItem = result.items[0];
      expect(firstItem).toBeDefined();
      if (!firstItem) {
        throw new Error('Expected first media item');
      }
      const asset = await service.resolveAsset(firstItem.assetKey);
      expect(asset.relativePath).toBe('2026/04/09/A款/001.png');
      expect(asset.mimeType).toBe('image/png');
    });

    it('throws typed error for unknown roots', async () => {
      expect(service.getDateTree('missing')).rejects.toBeInstanceOf(MediaLibraryError);
      expect(service.getDateTree('missing')).rejects.toMatchObject({ code: 'ROOT_NOT_FOUND' });
    });
  });
});
