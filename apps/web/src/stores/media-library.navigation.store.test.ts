import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';

const mockGetMediaRoots = mock(async () => [
  {
    id: 'dapai',
    label: '大拍 S',
    path: '/mnt/dapai-s',
  },
]);

const mockGetMediaDateTree = mock(async () => []);
const mockGetMediaFavorites = mock(async () => []);
const mockGetMediaActionDefinitions = mock(async () => []);
const mockGetMediaActions = mock(async () => []);
const mockGetMediaFolderSummary = mock(async () => ({
  rootId: 'dapai',
  path: '2026/04/09',
  folders: [],
}));
const mockGetMediaItems = mock(async () => ({
  items: [],
  nextCursor: null,
}));
const mockCreateMediaFavorite = mock(async () => ({
  id: 'favorite-new',
}));
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

describe('media-library.store navigation', () => {
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
              { label: '0409男装', path: '2026年/4月/0409男装' },
              { label: '0408', path: '2026年/4月/0408' },
            ],
          },
          {
            month: '03',
            label: '3月',
            path: '2026年/3月',
            dates: [{ label: '0331', path: '2026年/3月/0331' }],
          },
        ],
      },
      {
        year: '2025',
        label: '2025年',
        path: '2025年',
        months: [
          {
            month: '12',
            label: '12月',
            path: '2025年/12月',
            dates: [{ label: '12.30女装', path: '2025年/12月/12.30女装' }],
          },
        ],
      },
    ]);

    mockGetMediaFavorites.mockImplementation(async () => [
      {
        id: 'favorite-1',
        rootId: 'dapai',
        relativePath: '2026年/4月/0409男装',
        label: '0409男装',
        type: 'DATE',
        pinned: true,
        createdAt: '2026-04-09T08:00:00.000Z',
        updatedAt: '2026-04-09T08:00:00.000Z',
        exists: true,
      },
    ]);
  });

  it('flattens date tree and moves between newer and older dates', async () => {
    const store = useMediaLibraryStore();
    await store.initialize();

    expect(store.availableDatePaths).toEqual([
      '2026年/4月/0409男装',
      '2026年/4月/0408',
      '2026年/3月/0331',
      '2025年/12月/12.30女装',
    ]);
    expect(store.canOpenOlderDate).toBe(true);
    expect(store.canOpenNewerDate).toBe(false);

    await store.openAdjacentDate('older');
    expect(store.currentDatePath).toBe('2026年/4月/0408');
    expect(store.canOpenNewerDate).toBe(true);

    await store.openAdjacentDate('newer');
    expect(store.currentDatePath).toBe('2026年/4月/0409男装');
  });

  it('exposes the current date favorite for favorite-linked actions', async () => {
    const store = useMediaLibraryStore();
    await store.initialize();

    expect(store.currentDateFavorite?.id).toBe('favorite-1');
    expect(store.isFavoritePath('2026年/4月/0409男装')).toBe(true);
    expect(store.isFavoritePath('2026年/4月/0408')).toBe(false);
  });
});
