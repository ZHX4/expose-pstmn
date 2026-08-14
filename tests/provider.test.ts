import { afterEach, describe, expect, it, vi } from "vitest";

import { runProvider } from "../src/core/provider.js";
import { createProviderFromEnvironment } from "../src/providers/factory.js";
import { McpClient } from "../src/providers/mcp-client.js";
import { PostmanMcpProvider } from "../src/providers/postman-mcp.js";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.POSTMAN_API_KEY;
const originalRegion = process.env.POSTMAN_REGION;
const originalEndpoint = process.env.POSTMAN_MCP_ENDPOINT;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.POSTMAN_API_KEY;
  else process.env.POSTMAN_API_KEY = originalApiKey;
  if (originalRegion === undefined) delete process.env.POSTMAN_REGION;
  else process.env.POSTMAN_REGION = originalRegion;
  if (originalEndpoint === undefined) delete process.env.POSTMAN_MCP_ENDPOINT;
  else process.env.POSTMAN_MCP_ENDPOINT = originalEndpoint;
});

function installMockMcpServer(options: { readonly responseIdOffset?: number } = {}): void {
  globalThis.fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { readonly id?: number; readonly method?: string };
    const headers = new Headers({ "content-type": "application/json", "Mcp-Session-Id": "test-session" });
    const responseId = body.id === undefined ? undefined : body.id + (options.responseIdOffset ?? 0);

    if (body.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: responseId,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mock-postman", version: "1.0.0" },
        },
      }), { status: 200, headers });
    }

    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202, headers });
    }

    if (body.method === "tools/list") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: responseId,
        result: {
          tools: [{
            name: "echo",
            description: "Echo input",
            inputSchema: { type: "object" },
          }],
        },
      }), { status: 200, headers });
    }

    if (body.method === "tools/call") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: responseId,
        result: {
          content: [{ type: "text", text: "ok" }],
          isError: false,
        },
      }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Method not found" } }), {
      status: 200,
      headers,
    });
  }) as typeof fetch;
}

describe("McpClient", () => {
  it("initializes, preserves the session, lists tools, and calls a tool", async () => {
    installMockMcpServer();
    const client = new McpClient({ endpoint: "https://mcp.postman.com/minimal", apiKey: "test-key" });

    const initialized = await client.initialize();
    expect(initialized.protocolVersion).toBe("2025-06-18");
    expect(initialized.sessionId).toBe("test-session");

    const tools = await client.listTools();
    expect(tools).toEqual([{ name: "echo", description: "Echo input", inputSchema: { type: "object" } }]);

    const result = await client.callTool("echo", { message: "hello" });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);

    const requests = vi.mocked(globalThis.fetch).mock.calls.map(([, init]) => ({
      body: JSON.parse(String(init?.body)) as { readonly method?: string; readonly id?: number },
      headers: new Headers(init?.headers),
    }));
    expect(requests.map((request) => request.body.id)).toEqual([1, undefined, 2, 3]);
    expect(requests[0].headers.get("Authorization")).toBe("Bearer test-key");
    expect(requests[2].headers.get("Mcp-Session-Id")).toBe("test-session");
  });

  it("rejects a mismatched JSON-RPC response id", async () => {
    installMockMcpServer({ responseIdOffset: 1 });
    const client = new McpClient({ endpoint: "https://mcp.postman.com/minimal", apiKey: "test-key" });

    await expect(client.initialize()).rejects.toThrow("MCP response id mismatch");
  });
});

describe("PostmanMcpProvider", () => {
  it("reports MCP tool capability and disables unverified model completion", async () => {
    installMockMcpServer();
    const provider = new PostmanMcpProvider({
      endpoint: "https://mcp.postman.com/minimal",
      apiKey: "test-key",
      configuration: "minimal",
      region: "us",
    });

    expect(provider.capabilities.modelCompletion).toBe(false);
    expect(provider.capabilities.toolExecution).toBe(true);

    const health = await provider.health();
    expect(health.ready).toBe(true);

    const tools = await provider.listTools();
    expect(tools).toHaveLength(1);

    const result = await provider.callTool({ name: "echo", arguments: { message: "hello" } });
    expect(result.isError).toBe(false);
  });
});

describe("provider factory", () => {
  it("selects the official US minimal endpoint by default", () => {
    process.env.POSTMAN_API_KEY = "test-key";
    delete process.env.POSTMAN_REGION;
    delete process.env.POSTMAN_MCP_ENDPOINT;

    const provider = createProviderFromEnvironment();
    expect(provider.id).toBe("postman-mcp");
  });

  it("rejects non-Postman endpoints", () => {
    process.env.POSTMAN_API_KEY = "test-key";
    process.env.POSTMAN_MCP_ENDPOINT = "https://example.com/mcp";

    expect(() => createProviderFromEnvironment()).toThrow("official Postman MCP host");
  });

  it("requires a key for non-interactive provider access", () => {
    delete process.env.POSTMAN_API_KEY;
    delete process.env.POSTMAN_MCP_ENDPOINT;
    delete process.env.POSTMAN_REGION;

    expect(() => createProviderFromEnvironment()).toThrow("POSTMAN_API_KEY");
  });
});

describe("provider CLI", () => {
  it("returns a configuration error instead of pretending provider access exists", async () => {
    delete process.env.POSTMAN_API_KEY;
    const errors: string[] = [];

    const code = await runProvider(["status"], () => undefined, (text) => errors.push(text));

    expect(code).toBe(2);
    expect(errors.join("\n")).toContain("POSTMAN_API_KEY");
  });
});
