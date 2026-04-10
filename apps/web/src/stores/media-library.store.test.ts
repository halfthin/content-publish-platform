import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';

const mockGetMediaRoots = mock(async () => [
  {
    id: 'dapai',
    label: '大拍 S',
    path: '/mnt/dapai-s',
  },
]);

const mockGetMediaDateTree = mock(async () => [
  {
    year: '2026',
    label: '2026年',
    path: '2026年',
    months: [
      {
        month: '04',
        label: '4月',
        path: '2026年/4月',
        dates: [
          {
            label: '0409男装',
            path: '2026年/4月/0409男装',
          },
        ],
      },
    ],
  },
]);

const mockGetMediaFavorites = mock(async () => []);
const mockGetMediaActionDefinitions = mock(async () => []);
const mockGetMediaActions = mock(async () => []);
const mockGetMediaFolderSummary = mock(async () => ({
  rootId: 'dapai',
  path: '2026年/4月/0409男装',
  folders: [
    {
      name: 'A款',
      relativePath: '2026年/4月/0409男装/A款',
      imageCount: 3,
      coverAssetKey: 'asset-1',
    },
  ],
}));
const mockGetMediaItems = mock(async () => ({
  items: [],
  nextCursor: null,
}));
const mockCreateMediaFavorite = mock(async () => ({}));
const mockUpdateMediaFavorite = mock(async () => ({}));
const mockDeleteMediaFavorite = mock(async () => ({ id: 'favorite-1' }));
const mockCreateMediaAction = mock(async () => ({}));

mock.module('@/api/media', () => ({
  getMediaRoots: mockGetMediaRoots,
  getMediaDateTree: mockGetMediaDateTree,
  getMediaFavorites: mockGetMediaFavorites,
  getMediaActionDefinitions: mockGetMediaActionDefinitions,
  getMediaActions: mockGetMediaActions,
  getMediaFolderSummary: mockGetMediaFolderSummary,
  getMediaItems: mockGetMediaItems,
  createMediaFavorite: mockCreateMediaFavorite,
  updateMediaFavorite: mockUpdateMediaFavorite,
  deleteMediaFavorite: mockDeleteMediaFavorite,
  createMediaAction: mockCreateMediaAction,
}));

const { useMediaLibraryStore } = await import('./media-library.store');

describe('media-library.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());

    mockGetMediaRoots.mockClear();
    mockGetMediaDateTree.mockClear();
    mockGetMediaFavorites.mockClear();
    mockGetMediaActionDefinitions.mockClear();
    mockGetMediaActions.mockClear();
    mockGetMediaFolderSummary.mockClear();
    mockGetMediaItems.mockClear();
    mockCreateMediaFavorite.mockClear();
    mockUpdateMediaFavorite.mockClear();
    mockDeleteMediaFavorite.mockClear();
    mockCreateMediaAction.mockClear();

    mockGetMediaDateTree.mockImplementation(async () => [
      {
        year: '2026',
        label: '2026年',
        path: '2026年',
        months: [
          {
            month: '04',
            label: '4月',
            path: '2026年/4月',
            dates: [
              {
                label: '0409男装',
                path: '2026年/4月/0409男装',
              },
            ],
          },
        ],
      },
    ]);

    mockGetMediaFolderSummary.mockImplementation(async () => ({
      rootId: 'dapai',
      path: '2026年/4月/0409男装',
      folders: [
        {
          name: 'A款',
          relativePath: '2026年/4月/0409男装/A款',
          imageCount: 3,
          coverAssetKey: 'asset-1',
        },
      ],
    }));

    mockGetMediaItems.mockImplementation(async () => ({
      items: [],
      nextCursor: null,
    }));
  });

  it('initializes to the latest date path and loads every paginated item for a style folder', async () => {
    mockGetMediaItems
      .mockImplementationOnce(async () => ({
        items: [
          {
            assetKey: 'asset-1',
            rootId: 'dapai',
            relativePath: '2026年/4月/0409男装/A款/001.jpg',
            filename: '001.jpg',
            parentPath: '2026年/4月/0409男装/A款',
            size: 100,
            modifiedAt: '2026-04-09T10:00:00.000Z',
            mimeType: 'image/jpeg',
          },
          {
            assetKey: 'asset-2',
            rootId: 'dapai',
            relativePath: '2026年/4月/0409男装/A款/002.jpg',
            filename: '002.jpg',
            parentPath: '2026年/4月/0409男装/A款',
            size: 101,
            modifiedAt: '2026-04-09T10:01:00.000Z',
            mimeType: 'image/jpeg',
          },
        ],
        nextCursor: 'cursor:2',
      }))
      .mockImplementationOnce(async (params) => {
        expect(params).toMatchObject({
          rootId: 'dapai',
          path: '2026年/4月/0409男装/A款',
          recursive: true,
          limit: 200,
          cursor: 'cursor:2',
        });

        return {
          items: [
            {
              assetKey: 'asset-3',
              rootId: 'dapai',
              relativePath: '2026年/4月/0409男装/A款/003.jpg',
              filename: '003.jpg',
              parentPath: '2026年/4月/0409男装/A款',
              size: 102,
              modifiedAt: '2026-04-09T10:02:00.000Z',
              mimeType: 'image/jpeg',
            },
          ],
          nextCursor: null,
        };
      });

    const store = useMediaLibraryStore();
    await store.initialize();

    expect(store.currentDatePath).toBe('2026年/4月/0409男装');
    expect(store.getItemsForPath('2026年/4月/0409男装/A款')).toHaveLength(3);
    expect(mockGetMediaItems).toHaveBeenCalledTimes(2);
  });

  it('loads a favorite workspace path only once even when added repeatedly', async () => {
    mockGetMediaDateTree.mockImplementation(async () => []);
    mockGetMediaItems.mockImplementation(async () => ({
      items: [
        {
          assetKey: 'fav-asset-1',
          rootId: 'dapai',
          relativePath: '2025/12/31/精选/001.jpg',
          filename: '001.jpg',
          parentPath: '2025/12/31/精选',
          size: 88,
          modifiedAt: '2025-12-31T12:00:00.000Z',
          mimeType: 'image/jpeg',
        },
      ],
      nextCursor: null,
    }));

    const store = useMediaLibraryStore();
    await store.initialize();

    await store.addWorkspacePath('2025/12/31/精选');
    await store.addWorkspacePath('2025/12/31/精选');

    expect(store.workspacePaths).toEqual(['2025/12/31/精选']);
    expect(store.getItemsForPath('2025/12/31/精选')).toHaveLength(1);
    expect(mockGetMediaItems).toHaveBeenCalledTimes(1);
  });
});
