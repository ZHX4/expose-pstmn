import { afterEach, describe, expect, it } from "vitest";

import { authorizeRequest, getBearerToken } from "../src/api/auth.js";
import { loadGatewayConfig } from "../src/api/config.js";
import { ConcurrencyLimitError, createConcurrencyGate, createRateLimiter } from "../src/api/limits.js";
import { startGatewayServer } from "../src/api/server.js";
import type { GatewayConfig } from "../src/api/types.js";
import type { Provider } from "../src/providers/types.js";

const provider: Provider = {
  id: "test-provider",
  capabilities: {
    protocol: "mcp",
    toolExecution: true,
    modelCompletion: false,
    streaming: false,
  },
  async health() {
    return { provider: "test-provider", ready: true, detail: "ready" };
  },
  async listTools() {
    return [{ name: "echo", inputSchema: { type: "object" } }];
  },
  async callTool(request) {
    return { content: [{ type: "text", text: JSON.stringify(request.arguments ?? {}) }], isError: false };
  },
};

const config: GatewayConfig = {
  host: "127.0.0.1",
  port: 0,
  apiKey: "gateway-secret",
  maxBodyBytes: 256,
  maxConcurrentRequests: 2,
  requestTimeoutMs: 5_000,
  rateLimitPerMinute: 10,
};

let server: Awaited<ReturnType<typeof startGatewayServer>> | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
});

describe("gateway authentication", () => {
  it("parses and securely compares bearer credentials", () => {
    expect(getBearerToken("Bearer abc")).toBe("abc");
    expect(getBearerToken("bearer xyz")).toBe("xyz");
    expect(getBearerToken("Basic abc")).toBeUndefined();
    expect(authorizeRequest("abc", "Bearer abc")).toBe(true);
    expect(authorizeRequest("abc", "Bearer abd")).toBe(false);
  });
});

describe("gateway configuration", () => {
  it("requires an API key and stays localhost-only", () => {
    expect(() => loadGatewayConfig({})).toThrow("EXPOSE_PSTMN_API_KEY");
    const value = loadGatewayConfig({ EXPOSE_PSTMN_API_KEY: "secret" });
    expect(value.host).toBe("127.0.0.1");
    expect(value.port).toBe(8787);
    expect(value.apiKey).toBe("secret");
  });

  it("rejects non-local binding", () => {
    expect(() => loadGatewayConfig({ EXPOSE_PSTMN_API_KEY: "secret", EXPOSE_PSTMN_HOST: "0.0.0.0" })).toThrow("localhost");
  });
});

describe("gateway limits", () => {
  it("enforces a per-minute rate limit", () => {
    let now = 1_000;
    const limiter = createRateLimiter(2, () => now);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
    now += 60_000;
    expect(limiter.allow()).toBe(true);
  });

  it("enforces maximum concurrency and a bounded queue", async () => {
    const gate = createConcurrencyGate(1, 1);
    let release!: () => void;
    const first = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
    let secondStarted = false;
    const second = gate.run(async () => { secondStarted = true; });
    await Promise.resolve();
    expect(secondStarted).toBe(false);
    await expect(gate.run(async () => undefined)).rejects.toBeInstanceOf(ConcurrencyLimitError);
    release();
    await first;
    await second;
    expect(secondStarted).toBe(true);
  });
});

describe("HTTP gateway", () => {
  it("serves protected health, models, provider, and tool endpoints", async () => {
    server = await startGatewayServer(config, provider);
    const base = `http://${server.host}:${server.port}`;

    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBeTruthy();

    const unauthorized = await fetch(`${base}/v1/models`);
    expect(unauthorized.status).toBe(401);

    const models = await fetch(`${base}/v1/models`, { headers: { Authorization: "Bearer gateway-secret" } });
    expect(models.status).toBe(200);
    await expect(models.json()).resolves.toEqual({ object: "list", data: [] });

    const providerResponse = await fetch(`${base}/v1/provider`, { headers: { Authorization: "Bearer gateway-secret" } });
    expect(providerResponse.status).toBe(200);
    expect((await providerResponse.json()).capabilities.modelCompletion).toBe(false);

    const tools = await fetch(`${base}/v1/postman/tools`, { headers: { Authorization: "Bearer gateway-secret" } });
    expect(tools.status).toBe(200);
    await expect(tools.json()).resolves.toEqual({ object: "list", data: [{ name: "echo", inputSchema: { type: "object" } }] });

    const toolCall = await fetch(`${base}/v1/postman/tools/call`, {
      method: "POST",
      headers: { Authorization: "Bearer gateway-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "echo", arguments: { message: "hello" } }),
    });
    expect(toolCall.status).toBe(200);
    expect((await toolCall.json()).isError).toBe(false);
  });

  it("returns an OpenAI-compatible not-implemented error for unverified completion", async () => {
    server = await startGatewayServer(config, provider);
    const response = await fetch(`http://${server.host}:${server.port}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: "Bearer gateway-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "unknown", messages: [{ role: "user", content: "hello" }] }),
    });
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "The configured provider does not expose a verified model-completion interface.",
        type: "not_implemented",
        param: null,
        code: "model_completion_unavailable",
      },
    });
  });

  it("rejects oversized and malformed request bodies", async () => {
    server = await startGatewayServer(config, provider);
    const base = `http://${server.host}:${server.port}`;

    const oversized = await fetch(`${base}/v1/postman/tools/call`, {
      method: "POST",
      headers: { Authorization: "Bearer gateway-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "echo", arguments: { value: "x".repeat(400) } }),
    });
    expect(oversized.status).toBe(413);

    const malformed = await fetch(`${base}/v1/postman/tools/call`, {
      method: "POST",
      headers: { Authorization: "Bearer gateway-secret", "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
  });
});
