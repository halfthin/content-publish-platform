import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  createInMemoryMediaFavoritesStore,
  createMediaFavoritesService,
} from './media-favorites.service';
import { createMediaLibraryService } from './media-library.service';
import { createMediaFixtureTree } from './media-library.test-helpers';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;

beforeEach(async () => {
  fixture = await createMediaFixtureTree();
});

afterEach(async () => {
  await fixture.cleanup();
});

describe('media-favorites.service', () => {
  it('adds a date favorite and infers DATE type', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaFavoritesService({
      mediaService,
      store: createInMemoryMediaFavoritesStore(),
    });

    const favorite = await service.addFavorite({
      rootId: 'dapai',
      relativePath: '2026/04/09',
    });

    expect(favorite.type).toBe('DATE');
    expect(favorite.label).toBe('2026/04/09');
    expect(favorite.exists).toBe(true);
  });

  it('adds a folder favorite and infers FOLDER type', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaFavoritesService({
      mediaService,
      store: createInMemoryMediaFavoritesStore(),
    });

    const favorite = await service.addFavorite({
      rootId: 'dapai',
      relativePath: '2026/04/09/A款',
    });

    expect(favorite.type).toBe('FOLDER');
    expect(favorite.label).toBe('A款');
  });

  it('infers DATE type for flexible chinese date directory names', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaFavoritesService({
      mediaService,
      store: createInMemoryMediaFavoritesStore(),
    });

    const favorite = await service.addFavorite({
      rootId: 'dapai',
      relativePath: '2026年/4月/0409男装',
    });

    expect(favorite.type).toBe('DATE');
    expect(favorite.exists).toBe(true);
  });

  it('rejects duplicate favorites for the same path', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaFavoritesService({
      mediaService,
      store: createInMemoryMediaFavoritesStore(),
    });

    await service.addFavorite({ rootId: 'dapai', relativePath: '2026/04/09/A款' });

    expect(
      service.addFavorite({ rootId: 'dapai', relativePath: '2026/04/09/A款' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('lists pinned favorites first', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const store = createInMemoryMediaFavoritesStore();
    const service = createMediaFavoritesService({ mediaService, store });

    await service.addFavorite({ rootId: 'dapai', relativePath: '2026/04/09/A款', pinned: false });
    await service.addFavorite({ rootId: 'dapai', relativePath: '2026/04/09', pinned: true });

    const favorites = await service.listFavorites();
    expect(favorites[0]?.pinned).toBe(true);
    expect(favorites[0]?.relativePath).toBe('2026/04/09');
  });

  it('updates label and pinned state', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaFavoritesService({
      mediaService,
      store: createInMemoryMediaFavoritesStore(),
    });

    const favorite = await service.addFavorite({ rootId: 'dapai', relativePath: '2026/04/09/A款' });
    const updated = await service.updateFavorite(favorite.id, {
      label: '奶油风 A 款',
      pinned: true,
    });

    expect(updated.label).toBe('奶油风 A 款');
    expect(updated.pinned).toBe(true);
  });

  it('deletes a favorite', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const service = createMediaFavoritesService({
      mediaService,
      store: createInMemoryMediaFavoritesStore(),
    });

    const favorite = await service.addFavorite({ rootId: 'dapai', relativePath: '2026/04/09/A款' });
    await service.deleteFavorite(favorite.id);

    const favorites = await service.listFavorites();
    expect(favorites).toEqual([]);
  });

  it('marks missing favorite paths as exists false when listing', async () => {
    const mediaService = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const store = createInMemoryMediaFavoritesStore([
      {
        id: 'fav_missing',
        rootId: 'dapai',
        relativePath: '2026/04/09/不存在目录',
        label: '失效目录',
        type: 'FOLDER',
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    const service = createMediaFavoritesService({ mediaService, store });

    const favorites = await service.listFavorites();
    expect(favorites[0]?.exists).toBe(false);
  });
});
