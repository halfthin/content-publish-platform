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
  private sessionId: string | null = null;

  constructor(private readonly mcpUrl: string) {}

  private async jsonRpc(method: string, params: unknown): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    return fetch(this.mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(300_000),
    });
  }

  async initialize(): Promise<void> {
    if (this.sessionId) return;
    const res = await this.jsonRpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'cpp', version: '1.0.0' },
    });
    if (!res.ok) throw new JsonRpcError(`Initialize failed: HTTP ${res.status}`, res.status);
    const body = await res.json();
    if (body.error)
      throw new JsonRpcError(body.error.message || 'Initialize failed', body.error.code);

    // 捕获 Session ID
    const sessionId = res.headers.get('Mcp-Session-Id');
    if (sessionId) {
      this.sessionId = sessionId;
    }
  }

  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await this.initialize();
    const res = await this.jsonRpc('tools/call', { name: toolName, arguments: args });

    if (!res.ok) {
      throw new JsonRpcError(`MCP HTTP ${res.status}`, res.status);
    }

    const body = await res.json();
    if (body.error) {
      throw new JsonRpcError(body.error.message || 'MCP error', body.error.code, body.error.data);
    }

    return body.result;
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

        const result = (await this.client.callTool('publish_content', {
          title,
          content,
          images,
          tags,
          scheduleAt,
          visibility,
          isOriginal,
          products,
        })) as { content?: Array<{ type: string; text?: string }> };

        const text = result?.content?.find((c) => c.type === 'text')?.text || '{}';
        const parsed = JSON.parse(text) as { noteId?: string; noteUrl?: string };

        return {
          success: true,
          externalId: parsed.noteId,
          url: parsed.noteUrl,
        };
      }

      case 'publish_video': {
        const { title, content, video, tags, visibility, products } = payload as Record<
          string,
          unknown
        >;

        const result = (await this.client.callTool('publish_with_video', {
          title,
          content,
          video,
          tags,
          visibility,
          products,
        })) as { content?: Array<{ type: string; text?: string }> };

        const text = result?.content?.find((c) => c.type === 'text')?.text || '{}';
        const parsed = JSON.parse(text) as { noteId?: string; noteUrl?: string };

        return {
          success: true,
          externalId: parsed.noteId,
          url: parsed.noteUrl,
        };
      }

      default:
        return { success: false, error: `Unknown action: ${action}`, errorCode: 'UNKNOWN_ACTION' };
    }
  }

  async checkAuth(): Promise<AuthStatus> {
    try {
      const result = (await this.client.callTool('check_login_status')) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = result?.content?.find((c) => c.type === 'text')?.text || '';
      return { loggedIn: text.includes('true') || text.includes('logged_in') };
    } catch {
      return { loggedIn: false, message: 'MCP container unreachable' };
    }
  }

  async startAuth(): Promise<AuthInitResult> {
    const result = (await this.client.callTool('get_login_qrcode')) as {
      content?: Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
    };
    const image = result?.content?.find((c) => c.type === 'image');
    const data = image?.data
      ? `data:${image.mimeType || 'image/png'};base64,${image.data}`
      : undefined;
    const text = result?.content?.find((c) => c.type === 'text')?.text || '';
    const match = text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    const expiresIn = match ? (new Date(match[1]).getTime() - Date.now()) / 1000 : undefined;

    return {
      type: 'qrcode',
      data,
      expiresIn: expiresIn ? Math.max(Math.round(expiresIn), 60) : 300,
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
