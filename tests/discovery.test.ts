import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDiscoveryJson, formatDiscoveryReport } from "../src/discovery/format.js";
import { probeMcp } from "../src/discovery/mcp.js";
import type { DiscoveryReport } from "../src/discovery/types.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const report: DiscoveryReport = {
  phase: 2,
  generatedAt: "2026-08-14T00:00:00.000Z",
  nodeVersion: "v24.0.0",
  platform: "linux",
  postmanCli: {
    name: "Postman CLI",
    status: "available",
    detail: "Postman CLI executable is available.",
    version: "1.2.3",
  },
  postmanApi: {
    name: "Postman API",
    status: "authenticated",
    detail: "Postman API accepted the configured API key at GET /me.",
    endpoint: "https://api.postman.com/me",
  },
  mcp: [
    {
      name: "Postman MCP minimal",
      status: "protocol-ready",
      detail: "MCP initialize, notifications/initialized, and tools/list succeeded; 2 tool(s) were returned.",
      endpoint: "https://mcp.postman.com/minimal",
      region: "us",
      configuration: "minimal",
      transport: "streamable-http",
      httpStatus: 200,
      initializeSucceeded: true,
      toolsListSucceeded: true,
      toolCount: 2,
      sessionEstablished: true,
      authenticationMode: "api-key",
    },
  ],
  learnConfiguration: {
    name: "Postman MCP Learn configuration",
    status: "unknown",
    detail: "No distinct remote Learn URL was published.",
  },
  environment: {
    postmanApiKeyConfigured: true,
    postmanApiBaseUrl: "https://api.postman.com",
    postmanRegion: "us",
  },
  models: [
    {
      id: "GPT-5.6 Sol",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Account UI evidence only.",
    },
  ],
  conclusions: ["External model callability remains unverified."],
};

describe("discovery formatting", () => {
  it("formats the full human-readable report", () => {
    const text = formatDiscoveryReport(report);
    expect(text).toContain("Postman CLI");
    expect(text).toContain("Postman API");
    expect(text).toContain("Postman MCP minimal");
    expect(text).toContain("initialize=ok");
    expect(text).toContain("tools/list=ok");
    expect(text).toContain("tool count=2");
    expect(text).toContain("Learn configuration");
    expect(text).toContain("GPT-5.6 Sol");
    expect(text).toContain("externallyCallable=unknown");
  });

  it("formats valid JSON without leaking a secret value", () => {
    const text = formatDiscoveryJson(report);
    const parsed = JSON.parse(text) as DiscoveryReport;
    expect(parsed.environment.postmanApiKeyConfigured).toBe(true);
    expect(parsed.learnConfiguration.status).toBe("unknown");
    expect(text).not.toContain("POSTMAN_API_KEY=");
    expect(text).not.toContain("secret-value");
  });
});

describe("MCP discovery", () => {
  it("completes initialize, initialization notification, and tools/list", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async (_input, init) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-key");
      expect(headers.get("MCP-Protocol-Version")).toBe("2025-06-18");

      if (calls === 1) {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "postman-test", version: "1.0.0" },
          },
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-123",
          },
        });
      }

      if (calls === 2) {
        expect(headers.get("Mcp-Session-Id")).toBe("session-123");
        const body = JSON.parse(String(init?.body)) as { method?: string };
        expect(body.method).toBe("notifications/initialized");
        return new Response(null, { status: 202 });
      }

      expect(headers.get("Mcp-Session-Id")).toBe("session-123");
      const body = JSON.parse(String(init?.body)) as { method?: string };
      expect(body.method).toBe("tools/list");
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [{ name: "one" }, { name: "two" }],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await probeMcp(
      "https://mcp.postman.com/minimal",
      "minimal",
      "us",
      "test-key",
    );

    expect(result.status).toBe("protocol-ready");
    expect(result.initializeSucceeded).toBe(true);
    expect(result.toolsListSucceeded).toBe(true);
    expect(result.sessionEstablished).toBe(true);
    expect(result.toolCount).toBe(2);
    expect(result.authenticationMode).toBe("api-key");
  });

  it("reports authentication failure without claiming the endpoint is ready", async () => {
    globalThis.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as typeof fetch;

    const result = await probeMcp(
      "https://mcp.eu.postman.com/minimal",
      "minimal",
      "eu",
      "bad-key",
    );

    expect(result.status).toBe("unauthenticated");
    expect(result.initializeSucceeded).toBe(false);
    expect(result.toolsListSucceeded).toBe(false);
    expect(result.sessionEstablished).toBe(false);
  });
});
