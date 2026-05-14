import { xhsMcpConfig } from '../config/xhs-mcp';
import type {
  AuthInitResult,
  AuthStatus,
  Publisher,
  PublishJobPayload,
  PublishResult,
} from '../types/publisher';

class JsonRpcError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'JsonRpcError';
  }
}

class XhsMcpClient {
  constructor(private readonly mcpUrl: string) {}

  async callTool<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      throw new JsonRpcError(`MCP HTTP ${res.status}`, res.status);
    }

    const body = await res.json();
    if (body.error) {
      throw new JsonRpcError(body.error.message || 'MCP error', body.error.code, body.error.data);
    }

    return body.result?.content as T;
  }
}

export class XhsMcpPublisher implements Publisher {
  readonly platform = 'xiaohongshu';
  private readonly mcpUrl: string;

  constructor(
    public readonly name: string,
    private readonly client: XhsMcpClient,
    mcpUrl: string
  ) {
    this.mcpUrl = mcpUrl;
  }

  async publish(job: PublishJobPayload): Promise<PublishResult> {
    const { action, payload } = job;

    switch (action) {
      case 'publish': {
        const { title, content, images, tags, scheduleAt, visibility, isOriginal, products } =
          payload as Record<string, unknown>;

        const result = await this.client.callTool<{ noteId?: string; noteUrl?: string }>(
          'publish_content',
          {
            title,
            content,
            images,
            tags,
            scheduleAt,
            visibility,
            isOriginal,
            products,
          }
        );

        return {
          success: true,
          externalId: result.noteId,
          url: result.noteUrl,
        };
      }

      case 'publish_video': {
        const { title, content, video, tags, visibility, products } = payload as Record<
          string,
          unknown
        >;

        const result = await this.client.callTool<{ noteId?: string; noteUrl?: string }>(
          'publish_with_video',
          { title, content, video, tags, visibility, products }
        );

        return {
          success: true,
          externalId: result.noteId,
          url: result.noteUrl,
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}`, errorCode: 'UNKNOWN_ACTION' };
    }
  }

  async checkAuth(): Promise<AuthStatus> {
    try {
      const result = await this.client.callTool<{ isLogin?: boolean }>('check_login_status');
      return { loggedIn: result?.isLogin ?? false };
    } catch {
      return { loggedIn: false, message: 'MCP container unreachable' };
    }
  }

  async startAuth(): Promise<AuthInitResult> {
    const result = await this.client.callTool<{ qrcode?: string; expiresIn?: number }>(
      'get_login_qrcode'
    );
    return {
      type: 'qrcode',
      data: result.qrcode,
      expiresIn: result.expiresIn,
    };
  }

  async refreshAuth(): Promise<AuthInitResult> {
    await this.client.callTool('delete_cookies');
    return this.startAuth();
  }

  validateConfig(): boolean {
    return this.mcpUrl.length > 0;
  }
}

/** 从配置创建 XhsMcpPublisher 实例列表 */
export function createXhsMcpPublishers(): XhsMcpPublisher[] {
  return xhsMcpConfig.instances.map((inst) => {
    const base = inst.url.replace(/\/+$/, '');
    const mcpUrl = base.includes('/mcp') ? base : `${base}/mcp`;
    const client = new XhsMcpClient(mcpUrl);
    return new XhsMcpPublisher(inst.name, client, mcpUrl);
  });
}
