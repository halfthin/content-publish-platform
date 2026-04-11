import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createHttpMediaActionDispatcher } from './media-action-dispatcher';
import type { MediaActionSummary } from './media-actions.service';

const fetchMock = mock(async () => new Response(null, { status: 200 }));

const summary: MediaActionSummary = {
  id: 'job-001',
  actionType: 'wx-work-post',
  status: 'DISPATCHING',
  operator: '阿明',
  assets: [
    {
      rootId: 'dapai',
      relativePath: '2026/04/09/A款/001.png',
      assetKey: 'asset-001',
      filename: '001.png',
      parentPath: '2026/04/09/A款',
      mimeType: 'image/png',
      sourcePath: '/mnt/dapai-s/2026/04/09/A款/001.png',
      fileUrl: 'http://cpp.local/api/media/file/asset-001',
      thumbUrl: 'http://cpp.local/api/media/thumb/asset-001',
    },
  ],
  formData: {
    target: '摄影通知群',
    text: '请发到群里',
  },
  context: {
    workspaceDatePath: '2026/04/09',
    favoritePaths: ['2025/12/12/收藏目录'],
  },
  createdAt: '2026-04-09T09:00:00.000Z',
  updatedAt: '2026-04-09T09:00:00.000Z',
};

const imageToImageSummary: MediaActionSummary = {
  id: 'job-img-001',
  actionType: 'image-to-image',
  status: 'DISPATCHING',
  assets: [
    {
      rootId: 'dapai',
      relativePath: '2026/04/09/A款/001.png',
      assetKey: 'asset-001',
      filename: '001.png',
      parentPath: '2026/04/09/A款',
      mimeType: 'image/png',
      sourcePath: '/mnt/dapai-s/2026/04/09/A款/001.png',
      fileUrl: 'http://cpp.local/api/media/file/asset-001',
      thumbUrl: 'http://cpp.local/api/media/thumb/asset-001',
    },
    {
      rootId: 'dapai',
      relativePath: '2026/04/09/B款/010.png',
      assetKey: 'asset-010',
      filename: '010.png',
      parentPath: '2026/04/09/B款',
      mimeType: 'image/png',
      sourcePath: '/mnt/dapai-s/2026/04/09/B款/010.png',
      fileUrl: 'http://cpp.local/api/media/file/asset-010',
      thumbUrl: 'http://cpp.local/api/media/thumb/asset-010',
    },
  ],
  formData: {
    mode: 'lookbook',
    person: '模特A',
    productCode: 'SKU-001',
    scene: '影棚',
    style: '韩系',
    mood: '清新',
    count: '3',
    size: '1536x2048',
    model: 'flux',
    dryRun: true,
    description: '这组照片要体现悠闲的都市下午茶氛围。',
    referenceFace: '/mnt/ref/face.png',
    referenceBody: 'https://example.com/body.png',
  },
  createdAt: '2026-04-09T09:00:00.000Z',
  updatedAt: '2026-04-09T09:00:00.000Z',
};

describe('media-action-dispatcher', () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  afterEach(() => {
    delete process.env.MEDIA_ACTION_GATEWAY_URL;
    delete process.env.MEDIA_ACTION_TO_GATEWAY_TOKEN;
    delete process.env.MEDIA_ACTION_FROM_GATEWAY_TOKEN;
    delete process.env.MEDIA_ACTION_GATEWAY_ROUTE_PREFIX;
    delete process.env.MEDIA_ACTION_IMAGE_TO_IMAGE_DISPATCH_PATH;
    delete process.env.API_BASE_URL;
  });

  it('dispatches media actions to the configured gateway endpoint', async () => {
    fetchMock.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: { taskId: 'external-123' },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    });

    const dispatcher = createHttpMediaActionDispatcher({
      fetchImpl: fetchMock as typeof fetch,
      config: {
        url: 'http://gateway.local/',
        toGatewayToken: 'token-to-gateway',
        fromGatewayToken: 'token-from-gateway',
        callbackBaseUrl: 'http://cpp.local',
        routePrefix: '/webhooks/cpp/media-actions',
      },
    });

    const result = await dispatcher.dispatch(summary);

    expect(result).toEqual({
      accepted: true,
      externalTaskId: 'external-123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway.local/webhooks/cpp/media-actions/wx-work-post/dispatch');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-to-gateway',
    });

    const payload = JSON.parse(String(requestInit.body)) as Record<string, unknown>;
    expect(payload.jobId).toBe('job-001');
    expect(payload.source).toBe('content-publish-platform/media-library');
    expect(payload.refs).toEqual({
      mediaActionId: 'job-001',
    });
    expect(payload.callback).toEqual({
      url: 'http://cpp.local/api/webhook/media-actions/wx-work-post/result',
      token: 'token-from-gateway',
    });
  });

  it('supports plain externalTaskId responses and gateway config fallback route prefixes', async () => {
    fetchMock.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ externalTaskId: 'external-456' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    const dispatcher = createHttpMediaActionDispatcher({
      fetchImpl: fetchMock as typeof fetch,
      config: {
        url: 'http://gateway.local',
        callbackBaseUrl: 'http://cpp.local/',
      },
    });

    const result = await dispatcher.dispatch(summary);

    expect(result).toEqual({
      accepted: true,
      externalTaskId: 'external-456',
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway.local/webhooks/cpp/media-actions/wx-work-post/dispatch');
  });

  it('returns a typed failure when gateway dispatch is rejected', async () => {
    fetchMock.mockImplementationOnce(async () => {
      return new Response('bad request', { status: 400 });
    });

    const dispatcher = createHttpMediaActionDispatcher({
      fetchImpl: fetchMock as typeof fetch,
      config: {
        url: 'http://gateway.local',
        callbackBaseUrl: 'http://cpp.local',
      },
    });

    const result = await dispatcher.dispatch(summary);

    expect(result).toEqual({
      accepted: false,
      error: 'Gateway returned 400: bad request',
    });
  });

  it('builds the expected image-to-image payload for gateway hooks', async () => {
    fetchMock.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ taskId: 'img-task-123' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    const dispatcher = createHttpMediaActionDispatcher({
      fetchImpl: fetchMock as typeof fetch,
      config: {
        url: 'http://gateway.local',
        toGatewayToken: 'token-to-gateway',
        fromGatewayToken: 'token-from-gateway',
        callbackBaseUrl: 'http://cpp.local',
      },
    });

    const result = await dispatcher.dispatch(imageToImageSummary);

    expect(result).toEqual({
      accepted: true,
      externalTaskId: 'img-task-123',
    });

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway.local/webhooks/cpp/oc/vd-shoot');

    const payload = JSON.parse(String(requestInit.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      taskId: 'job-img-001',
      refs: {
        mediaActionId: 'job-img-001',
      },
      callback: {
        url: 'http://cpp.local/api/webhook/media-actions/image-to-image/result',
        token: 'token-from-gateway',
      },
      mode: 'lookbook',
      person: '模特A',
      productCode: 'SKU-001',
      scene: '影棚',
      style: '韩系',
      mood: '清新',
      count: 3,
      size: '1536x2048',
      model: 'flux',
      dryRun: true,
      description: '这组照片要体现悠闲的都市下午茶氛围。',
      referenceImages: {
        product: '/mnt/dapai-s/2026/04/09/A款/001.png',
        outfit: '/mnt/dapai-s/2026/04/09/B款/010.png',
        face: '/mnt/ref/face.png',
        body: 'https://example.com/body.png',
      },
    });
  });

  it('allows overriding the image-to-image dispatch path', async () => {
    fetchMock.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ taskId: 'img-task-456' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    const dispatcher = createHttpMediaActionDispatcher({
      fetchImpl: fetchMock as typeof fetch,
      config: {
        url: 'http://gateway.local',
        callbackBaseUrl: 'http://cpp.local',
        imageToImageDispatchPath: '/custom/vd-shoot',
      },
    });

    const result = await dispatcher.dispatch(imageToImageSummary);

    expect(result).toEqual({
      accepted: true,
      externalTaskId: 'img-task-456',
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway.local/custom/vd-shoot');
  });
});
