import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import {
  createInMemoryMediaFavoritesStore,
  createMediaFavoritesService,
} from '../services/media-favorites.service';
import { createMediaLibraryService } from '../services/media-library.service';
import { createMediaFixtureTree } from '../services/media-library.test-helpers';
import { setupMediaRoutes } from './media';

let fixture: Awaited<ReturnType<typeof createMediaFixtureTree>>;
let app: Elysia;

describe('media routes', () => {
  beforeEach(async () => {
    fixture = await createMediaFixtureTree();
    const service = createMediaLibraryService({
      roots: [{ id: 'dapai', path: fixture.rootDir, label: '大拍 S' }],
    });
    const favoritesService = createMediaFavoritesService({
      mediaService: service,
      store: createInMemoryMediaFavoritesStore(),
    });
    app = new Elysia().use(setupMediaRoutes({ service, favoritesService }));
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('GET /api/media/favorites returns empty list by default', async () => {
    const res = await app.handle(new Request('http://localhost/api/media/favorites'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
  });

  it('POST /api/media/favorites creates a shared favorite', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/media/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootId: 'dapai',
          relativePath: '2026/04/09/A款',
          label: '奶油风 A 款',
          pinned: true,
        }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.label).toBe('奶油风 A 款');
    expect(data.data.pinned).toBe(true);
  });

  it('PATCH /api/media/favorites/:id updates a shared favorite', async () => {
    const createRes = await app.handle(
      new Request('http://localhost/api/media/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootId: 'dapai',
          relativePath: '2026/04/09/A款',
        }),
      })
    );
    const created = await createRes.json();

    const res = await app.handle(
      new Request(`http://localhost/api/media/favorites/${created.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: '更新后的名称', pinned: true }),
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.label).toBe('更新后的名称');
    expect(data.data.pinned).toBe(true);
  });

  it('DELETE /api/media/favorites/:id removes a shared favorite', async () => {
    const createRes = await app.handle(
      new Request('http://localhost/api/media/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootId: 'dapai',
          relativePath: '2026/04/09/A款',
        }),
      })
    );
    const created = await createRes.json();

    const res = await app.handle(
      new Request(`http://localhost/api/media/favorites/${created.data.id}`, {
        method: 'DELETE',
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const listRes = await app.handle(new Request('http://localhost/api/media/favorites'));
    const listData = await listRes.json();
    expect(listData.data).toEqual([]);
  });

  it('GET /api/media/date-tree returns date tree', async () => {
    const res = await app.handle(new Request('http://localhost/api/media/date-tree?rootId=dapai'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data[0].year).toBe('2026');
  });

  it('GET /api/media/folder-summary returns folder summary', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/media/folder-summary?rootId=dapai&path=2026/04/09')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.folders).toHaveLength(2);
  });

  it('GET /api/media/items returns recursive items', async () => {
    const res = await app.handle(
      new Request(
        'http://localhost/api/media/items?rootId=dapai&path=2026/04/09&recursive=true&limit=10'
      )
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(3);
  });

  it('rejects invalid rootId', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/media/date-tree?rootId=missing')
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toContain('root');
  });

  it('rejects traversal attempts', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/media/folder-summary?rootId=dapai&path=../secret')
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('path');
  });

  it('GET /api/media/file/:assetKey returns image data', async () => {
    const itemsRes = await app.handle(
      new Request('http://localhost/api/media/items?rootId=dapai&path=2026/04/09/A款&limit=1')
    );
    const itemsData = await itemsRes.json();
    const assetKey = itemsData.data.items[0].assetKey;

    const res = await app.handle(new Request(`http://localhost/api/media/file/${assetKey}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
