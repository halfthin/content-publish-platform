import { describe, expect, it } from 'bun:test';
import type { MediaActionSummary } from '@/api/media';
import { extractMediaActionResultView } from './media-action-result';

describe('extractMediaActionResultView', () => {
  it('builds preview URLs from uploaded callback files and manifest metadata', () => {
    const action = {
      id: 'action-001',
      actionType: 'image-to-image',
      status: 'SUCCESS',
      assets: [],
      formData: {},
      callbackPayload: {
        actionType: 'image-to-image',
        status: 'success',
        result: {
          summary: '生成完成',
          artifacts: [
            {
              kind: 'image',
              role: 'generated',
              name: '01-look-1.png',
              mimeType: 'image/png',
              meta: {
                relativePath: 'uploaded/openclaw/2026/04/11/ext-task-001/01-look-1.png',
              },
            },
          ],
          extra: {
            upload: {
              provider: 'openclaw',
              fileCount: 2,
              directory: 'uploaded/openclaw/2026/04/11/ext-task-001',
              manifestPath: 'uploaded/openclaw/2026/04/11/ext-task-001/manifest.json',
              files: [
                {
                  originalName: 'look-1.png',
                  storedName: '01-look-1.png',
                  relativePath: 'uploaded/openclaw/2026/04/11/ext-task-001/01-look-1.png',
                  mimeType: 'image/png',
                  size: 1234,
                },
                {
                  originalName: 'look-2.png',
                  storedName: '02-look-2.png',
                  relativePath: 'uploaded/openclaw/2026/04/11/ext-task-001/02-look-2.png',
                  mimeType: 'image/png',
                  size: 1235,
                },
              ],
            },
          },
        },
      },
      createdAt: '2026-04-11T09:00:00.000Z',
      updatedAt: '2026-04-11T09:00:10.000Z',
    } satisfies MediaActionSummary;

    const result = extractMediaActionResultView(action);

    expect(result.summary).toBe('生成完成');
    expect(result.upload?.fileCount).toBe(2);
    expect(result.upload?.directory).toBe('uploaded/openclaw/2026/04/11/ext-task-001');
    expect(result.upload?.manifestUrl).toEndWith(
      '/api/media/actions/action-001/uploads/uploaded/openclaw/2026/04/11/ext-task-001/manifest.json'
    );
    expect(result.images.map((item) => item.url)).toEqual([
      expect.stringMatching(
        /\/api\/media\/actions\/action-001\/uploads\/uploaded\/openclaw\/2026\/04\/11\/ext-task-001\/01-look-1\.png$/
      ),
      expect.stringMatching(
        /\/api\/media\/actions\/action-001\/uploads\/uploaded\/openclaw\/2026\/04\/11\/ext-task-001\/02-look-2\.png$/
      ),
    ]);
  });

  it('falls back to remote artifact URLs when no uploaded files exist', () => {
    const action = {
      id: 'action-002',
      actionType: 'image-to-image',
      status: 'SUCCESS',
      assets: [],
      formData: {},
      callbackPayload: {
        result: {
          url: 'https://cdn.example.com/results/cover.jpg',
          artifacts: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/results/detail.jpg',
              mimeType: 'image/jpeg',
            },
          ],
        },
      },
      createdAt: '2026-04-11T09:00:00.000Z',
      updatedAt: '2026-04-11T09:00:10.000Z',
    } satisfies MediaActionSummary;

    const result = extractMediaActionResultView(action);

    expect(result.images.map((item) => item.url)).toEqual([
      'https://cdn.example.com/results/detail.jpg',
      'https://cdn.example.com/results/cover.jpg',
    ]);
    expect(result.upload).toBeNull();
  });
});
