import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaLibraryError } from './media-library.service';
import { createOpenClawResultStorageService } from './openclaw-result-storage.service';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR6QAAAABJRU5ErkJggg==',
  'base64'
);

describe('openclaw result storage service', () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = await mkdtemp(join(tmpdir(), 'openclaw-upload-'));
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('stores uploaded images under content/uploaded/openclaw and writes a manifest', async () => {
    const service = createOpenClawResultStorageService({
      contentBaseDir: contentDir,
    });

    const stored = await service.store({
      taskId: 'cpp-task-20260411-001',
      eventId: 'evt-upload-001',
      actionType: 'image-to-image',
      timestamp: '2026-04-11T08:30:00.000Z',
      refs: {
        mediaActionId: 'media-action-001',
      },
      payload: {
        version: '1.0',
        eventId: 'evt-upload-001',
        taskId: 'cpp-task-20260411-001',
        source: 'openclaw',
        kind: 'media-action',
        actionType: 'image-to-image',
        status: 'success',
        refs: {
          mediaActionId: 'media-action-001',
        },
        result: {
          summary: '生成完成',
        },
        timestamp: '2026-04-11T08:30:00.000Z',
      },
      files: [
        {
          fieldName: 'files',
          file: new File([TINY_PNG], 'look-1.png', {
            type: 'image/png',
          }),
        },
        {
          fieldName: 'files',
          file: new File([TINY_PNG], 'look 2.png', {
            type: 'image/png',
          }),
        },
      ],
    });

    expect(stored.directory.relativePath).toBe(
      'uploaded/openclaw/2026/04/11/cpp-task-20260411-001'
    );
    expect(stored.files).toHaveLength(2);
    expect(stored.files[0]?.storedName).toBe('01-look-1.png');
    expect(stored.files[1]?.storedName).toBe('02-look-2.png');
    expect(stored.artifacts).toEqual([
      expect.objectContaining({
        kind: 'image',
        role: 'generated',
        path: join(contentDir, 'uploaded/openclaw/2026/04/11/cpp-task-20260411-001/01-look-1.png'),
      }),
      expect.objectContaining({
        kind: 'image',
        role: 'generated',
        path: join(contentDir, 'uploaded/openclaw/2026/04/11/cpp-task-20260411-001/02-look-2.png'),
      }),
    ]);

    await access(stored.manifest.absolutePath);
    const manifest = JSON.parse(await readFile(stored.manifest.absolutePath, 'utf-8')) as {
      files: Array<{ storedName: string }>;
      payload: { taskId: string };
    };

    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[0]?.storedName).toBe('01-look-1.png');
    expect(manifest.payload.taskId).toBe('cpp-task-20260411-001');
  });

  it('rejects non-image uploads', async () => {
    const service = createOpenClawResultStorageService({
      contentBaseDir: contentDir,
    });

    await expect(
      service.store({
        taskId: 'cpp-task-20260411-002',
        eventId: 'evt-upload-002',
        actionType: 'image-to-image',
        timestamp: '2026-04-11T08:30:00.000Z',
        payload: {
          version: '1.0',
          eventId: 'evt-upload-002',
          taskId: 'cpp-task-20260411-002',
          source: 'openclaw',
          kind: 'media-action',
          actionType: 'image-to-image',
          status: 'success',
          timestamp: '2026-04-11T08:30:00.000Z',
        },
        files: [
          {
            fieldName: 'files',
            file: new File(['not image'], 'bad.txt', {
              type: 'text/plain',
            }),
          },
        ],
      })
    ).rejects.toBeInstanceOf(MediaLibraryError);
  });
});
