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
    postmanApiBaseUrl: "https://api.postman.com",
    postmanRegion: "us",
  },
  models: [
    {
      id: "gpt-5.6-sol",
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
    expect(text).toContain("gpt-5.6-sol");
    expect(text).toContain("externallyCallable=unknown");
  });

  it("formats valid JSON without leaking a secret value", () => {
    const text = formatDiscoveryJson(report);
    const parsed = JSON.parse(text) as DiscoveryReport;
    expect(parsed.environment.postmanApiKeyConfigured).toBe(true);
    expect(text).not.toContain("POSTMAN_API_KEY=");
  });
});
