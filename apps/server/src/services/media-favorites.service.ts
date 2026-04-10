import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../config/redis';
import type { MediaLibraryService } from './media-library.service';
import { MediaLibraryError } from './media-library.service';

const FAVORITES_KEY = 'media:favorites:shared:v1';

export type MediaFavoriteType = 'DATE' | 'FOLDER';

export interface MediaFavoritePath {
  id: string;
  rootId: string;
  relativePath: string;
  label: string;
  type: MediaFavoriteType;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  exists: boolean;
}

interface StoredMediaFavoritePath extends Omit<MediaFavoritePath, 'exists'> {}

export interface CreateMediaFavoriteInput {
  rootId: string;
  relativePath: string;
  label?: string;
  pinned?: boolean;
}

export interface UpdateMediaFavoriteInput {
  label?: string;
  pinned?: boolean;
}

export interface MediaFavoritesStore {
  read(): Promise<StoredMediaFavoritePath[]>;
  write(records: StoredMediaFavoritePath[]): Promise<void>;
}

class RedisMediaFavoritesStore implements MediaFavoritesStore {
  async read(): Promise<StoredMediaFavoritePath[]> {
    const raw = await getRedisClient().get(FAVORITES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredMediaFavoritePath[]) : [];
  }

  async write(records: StoredMediaFavoritePath[]): Promise<void> {
    await getRedisClient().set(FAVORITES_KEY, JSON.stringify(records));
  }
}

export function createRedisMediaFavoritesStore(): MediaFavoritesStore {
  return new RedisMediaFavoritesStore();
}

export function createInMemoryMediaFavoritesStore(
  initial: StoredMediaFavoritePath[] = []
): MediaFavoritesStore {
  let records = [...initial];
  return {
    async read() {
      return [...records];
    },
    async write(nextRecords) {
      records = [...nextRecords];
    },
  };
}

function getDefaultLabel(relativePath: string, type: MediaFavoriteType): string {
  if (type === 'DATE') {
    return relativePath;
  }

  const segments = relativePath.split('/').filter(Boolean);
  return segments[segments.length - 1] || relativePath;
}

function sortFavorites(records: MediaFavoritePath[]): MediaFavoritePath[] {
  return records.sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export interface MediaFavoritesService {
  listFavorites(): Promise<MediaFavoritePath[]>;
  addFavorite(input: CreateMediaFavoriteInput): Promise<MediaFavoritePath>;
  updateFavorite(id: string, input: UpdateMediaFavoriteInput): Promise<MediaFavoritePath>;
  deleteFavorite(id: string): Promise<void>;
}

export function createMediaFavoritesService(options: {
  mediaService: MediaLibraryService;
  store?: MediaFavoritesStore;
}): MediaFavoritesService {
  const store = options.store || createRedisMediaFavoritesStore();

  async function inferFavoriteType(
    rootId: string,
    relativePath: string
  ): Promise<MediaFavoriteType> {
    const dateTree = await options.mediaService.getDateTree(rootId);
    const isDatePath = dateTree.some((year) =>
      year.months.some((month) => month.dates.some((date) => date.path === relativePath))
    );
    return isDatePath ? 'DATE' : 'FOLDER';
  }

  async function withExists(record: StoredMediaFavoritePath): Promise<MediaFavoritePath> {
    try {
      await options.mediaService.resolveDirectory(record.rootId, record.relativePath);
      return { ...record, exists: true };
    } catch {
      return { ...record, exists: false };
    }
  }

  return {
    async listFavorites() {
      const records = await store.read();
      const favorites = await Promise.all(records.map((record) => withExists(record)));
      return sortFavorites(favorites);
    },

    async addFavorite(input) {
      const resolved = await options.mediaService.resolveDirectory(
        input.rootId,
        input.relativePath
      );
      const records = await store.read();
      const duplicate = records.find(
        (record) => record.rootId === input.rootId && record.relativePath === resolved.relativePath
      );

      if (duplicate) {
        throw new MediaLibraryError('INVALID_PATH', 'Favorite path already exists', 409);
      }

      const type = await inferFavoriteType(input.rootId, resolved.relativePath);
      const now = new Date().toISOString();
      const record: StoredMediaFavoritePath = {
        id: randomUUID(),
        rootId: input.rootId,
        relativePath: resolved.relativePath,
        label: input.label?.trim() || getDefaultLabel(resolved.relativePath, type),
        type,
        pinned: input.pinned || false,
        createdAt: now,
        updatedAt: now,
      };

      records.push(record);
      await store.write(records);
      return { ...record, exists: true };
    },

    async updateFavorite(id, input) {
      const records = await store.read();
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Favorite not found', 404);
      }

      const current = records[index];
      if (!current) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Favorite not found', 404);
      }
      const nextRecord: StoredMediaFavoritePath = {
        ...current,
        label: input.label !== undefined ? input.label.trim() || current.label : current.label,
        pinned: input.pinned !== undefined ? input.pinned : current.pinned,
        updatedAt: new Date().toISOString(),
      };

      records[index] = nextRecord;
      await store.write(records);
      return withExists(nextRecord);
    },

    async deleteFavorite(id) {
      const records = await store.read();
      const nextRecords = records.filter((record) => record.id !== id);
      if (nextRecords.length === records.length) {
        throw new MediaLibraryError('FILE_NOT_FOUND', 'Favorite not found', 404);
      }

      await store.write(nextRecords);
    },
  };
}
