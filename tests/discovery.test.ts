import { describe, expect, it } from "vitest";

import { formatDiscoveryJson, formatDiscoveryReport } from "../src/discovery/format.js";
import type { DiscoveryReport } from "../src/discovery/types.js";

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
    endpoint: "https://api.getpostman.com/me",
  },
  mcp: [
    {
      name: "Postman MCP minimal",
      status: "authenticated",
      detail: "Endpoint is reachable but requires authentication.",
      endpoint: "https://mcp.postman.com/minimal",
      region: "us",
    },
  ],
  environment: {
    postmanApiKeyConfigured: true,
    postmanApiBaseUrl: "https://api.getpostman.com",
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
  it("formats a human-readable report", () => {
    const text = formatDiscoveryReport(report);
    expect(text).toContain("Postman CLI");
    expect(text).toContain("Postman API");
    expect(text).toContain("GPT-5.6 Sol");
    expect(text).toContain("externallyCallable=unknown");
  });

  it("formats valid JSON without leaking a secret value", () => {
    const text = formatDiscoveryJson(report);
    const parsed = JSON.parse(text) as DiscoveryReport;
    expect(parsed.environment.postmanApiKeyConfigured).toBe(true);
    expect(text).not.toContain("POSTMAN_API_KEY=");
  });
});
