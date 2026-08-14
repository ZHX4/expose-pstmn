export interface McpClientOptions {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly protocolVersion?: string;
  readonly clientName?: string;
  readonly clientVersion?: string;
}

export interface McpInitializeResult {
  readonly protocolVersion: string;
  readonly sessionId?: string;
}

export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

export interface McpToolCallResult {
  readonly content: readonly unknown[];
  readonly isError: boolean;
}

type JsonRpcMessage = {
  readonly id?: number | string | null;
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string; readonly data?: unknown };
};

function parseBody(text: string, contentType: string): unknown {
  if (!text) return undefined;
  if (contentType.includes("text/event-stream")) {
    const events = text
      .split(/\r?\n\r?\n/)
      .flatMap((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()))
      .filter(Boolean);
    for (const data of events.reverse()) {
      try {
        return JSON.parse(data) as unknown;
      } catch {
        // Continue until a valid JSON event is found.
      }
    }
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function asJsonRpc(message: unknown, expectedId: number): JsonRpcMessage {
  if (!message || typeof message !== "object") {
    throw new Error("MCP returned an invalid JSON-RPC response.");
  }

  const json = message as JsonRpcMessage;
  if (json.error) {
    throw new Error(`MCP error ${json.error.code ?? "unknown"}: ${json.error.message ?? "unknown error"}`);
  }
  if (json.id !== expectedId) {
    throw new Error(`MCP response id mismatch: expected ${expectedId}, received ${String(json.id)}.`);
  }
  if (json.result === undefined) {
    throw new Error("MCP response did not contain a JSON-RPC result.");
  }
  return json;
}

export class McpClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly protocolVersion: string;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private sessionId?: string;
  private initialized = false;
  private nextRequestId = 1;

  public constructor(options: McpClientOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.protocolVersion = options.protocolVersion ?? "2025-06-18";
    this.clientName = options.clientName ?? "expose-pstmn";
    this.clientVersion = options.clientVersion ?? "0.1.0";
  }

  private async request(body: { readonly id?: number; readonly method: string; readonly params?: unknown }, expectResponse: boolean): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": this.protocolVersion,
      };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...body }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 500)}`);
      }

      const newSession = response.headers.get("Mcp-Session-Id");
      if (newSession) this.sessionId = newSession;
      if (!expectResponse) return undefined;

      const parsed = parseBody(await response.text(), response.headers.get("content-type") ?? "");
      if (body.id === undefined) {
        throw new Error("MCP response was expected for a notification request.");
      }
      return asJsonRpc(parsed, body.id).result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`MCP request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private requestId(): number {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return id;
  }

  public async initialize(): Promise<McpInitializeResult> {
    if (this.initialized) {
      return { protocolVersion: this.protocolVersion, ...(this.sessionId ? { sessionId: this.sessionId } : {}) };
    }

    const id = this.requestId();
    const result = await this.request({
      id,
      method: "initialize",
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: { name: this.clientName, version: this.clientVersion },
      },
    }, true) as { readonly protocolVersion?: unknown };

    if (typeof result?.protocolVersion !== "string") {
      throw new Error("MCP initialize did not return a protocolVersion.");
    }
    const negotiated = result.protocolVersion;
    if (negotiated !== this.protocolVersion) {
      throw new Error(`Unsupported negotiated MCP protocol version: ${negotiated}.`);
    }

    await this.request({ method: "notifications/initialized", params: {} }, false);
    this.initialized = true;
    return { protocolVersion: negotiated, ...(this.sessionId ? { sessionId: this.sessionId } : {}) };
  }

  public async listTools(): Promise<readonly McpTool[]> {
    await this.initialize();
    const result = await this.request({ id: this.requestId(), method: "tools/list", params: {} }, true) as { readonly tools?: unknown };
    if (!Array.isArray(result?.tools)) {
      throw new Error("MCP tools/list returned an invalid tools array.");
    }
    return result.tools.flatMap((tool): McpTool[] => {
      if (!tool || typeof tool !== "object") return [];
      const candidate = tool as { readonly name?: unknown; readonly description?: unknown; readonly inputSchema?: unknown };
      if (typeof candidate.name !== "string" || candidate.name.length === 0) return [];
      return [{
        name: candidate.name,
        ...(typeof candidate.description === "string" ? { description: candidate.description } : {}),
        ...(candidate.inputSchema !== undefined ? { inputSchema: candidate.inputSchema } : {}),
      }];
    });
  }

  public async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    if (!name) throw new Error("MCP tool name is required.");
    await this.initialize();
    const result = await this.request({
      id: this.requestId(),
      method: "tools/call",
      params: { name, arguments: args },
    }, true) as { readonly content?: unknown; readonly isError?: unknown };
    if (!Array.isArray(result?.content)) {
      throw new Error("MCP tools/call returned an invalid content array.");
    }
    return {
      content: result.content,
      isError: result.isError === true,
    };
  }
}
