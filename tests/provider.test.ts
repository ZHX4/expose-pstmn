import { afterEach, describe, expect, it, vi } from "vitest";

import { McpClient } from "../src/providers/mcp-client.js";
import { PostmanMcpProvider } from "../src/providers/postman-mcp.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function installMockMcpServer(): void {
  globalThis.fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { readonly method?: string };
    const headers = new Headers({ "content-type": "application/json", "Mcp-Session-Id": "test-session" });

    if (body.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
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
        id: 2,
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
        id: 3,
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
  it("initializes, lists tools, and calls a tool", async () => {
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
  });
});
