import { runCommand } from "./command.js";
import { probeEndpoint } from "./http.js";
import type { DiscoveryReport, ModelCapability, ToolCheck } from "./types.js";

const MCP_ENDPOINTS = [
  { region: "us" as const, name: "Postman MCP minimal", endpoint: "https://mcp.postman.com/minimal" },
  { region: "us" as const, name: "Postman MCP code", endpoint: "https://mcp.postman.com/code" },
  { region: "us" as const, name: "Postman MCP full", endpoint: "https://mcp.postman.com/mcp" },
  { region: "eu" as const, name: "Postman EU MCP minimal", endpoint: "https://mcp.eu.postman.com/minimal" },
  { region: "eu" as const, name: "Postman EU MCP code", endpoint: "https://mcp.eu.postman.com/code" },
  { region: "eu" as const, name: "Postman EU MCP full", endpoint: "https://mcp.eu.postman.com/mcp" },
];

function inferRegion(apiBaseUrl: string | undefined): "us" | "eu" | "unknown" {
  if (!apiBaseUrl) return "unknown";
  if (apiBaseUrl.includes("eu.postman.com")) return "eu";
  if (apiBaseUrl.includes("postman.com")) return "us";
  return "unknown";
}

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return value.length > 0 ? value.split(/\r?\n/, 1)[0] : undefined;
}

export async function discover(): Promise<DiscoveryReport> {
  const apiKey = process.env.POSTMAN_API_KEY;
  const apiBaseUrl = process.env.POSTMAN_API_BASE_URL;
  const region = (process.env.POSTMAN_REGION === "eu" ? "eu" : undefined) ?? inferRegion(apiBaseUrl);

  const cli = await runCommand("postman", ["--version"]);
  const postmanCli: ToolCheck = !cli.found
    ? {
        name: "Postman CLI",
        status: "not-found",
        detail: "Postman CLI was not found on PATH.",
      }
    : cli.code === 0
      ? {
          name: "Postman CLI",
          status: "available",
          detail: "Postman CLI executable is available.",
          version: parseVersion(cli.stdout),
        }
      : {
          name: "Postman CLI",
          status: "error",
          detail: cli.stderr.trim() || `Postman CLI exited with code ${cli.code ?? "unknown"}.`,
        };

  const mcp: ToolCheck[] = [];
  for (const candidate of MCP_ENDPOINTS) {
    const result = await probeEndpoint(candidate.endpoint);
    mcp.push({
      name: candidate.name,
      status: result.status === 401 || result.status === 403
        ? "authenticated"
        : result.ok
          ? "available"
          : result.status === null
            ? "error"
            : "unavailable",
      detail: result.detail,
      endpoint: candidate.endpoint,
      region: candidate.region,
    });
  }

  const models: ModelCapability[] = [
    {
      id: "gpt-5.6-sol",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Observed by the user in the Postman Agent Mode model selector; Phase 2 cannot infer external callability from that UI alone.",
    },
    {
      id: "claude-opus-4.8",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Observed by the user in the Postman Agent Mode model selector; Phase 2 cannot infer external callability from that UI alone.",
    },
  ];

  const conclusions = [
    postmanCli.status === "available"
      ? "Postman CLI is available locally."
      : "Postman CLI is not verified locally; install it or expose it on PATH before CLI-based cloud checks.",
    mcp.some((entry) => entry.status === "available" || entry.status === "authenticated")
      ? "At least one documented Postman MCP endpoint is reachable."
      : "No documented Postman MCP endpoint was confirmed reachable from this machine.",
    apiKey
      ? "POSTMAN_API_KEY is configured; its value is never included in the discovery report."
      : "POSTMAN_API_KEY is not configured.",
    "Agent Mode model visibility is recorded as account evidence only; external model access remains unverified until a supported provider path succeeds.",
  ];

  return {
    phase: 2,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    postmanCli,
    mcp,
    environment: {
      postmanApiKeyConfigured: Boolean(apiKey),
      ...(apiBaseUrl ? { postmanApiBaseUrl: apiBaseUrl } : {}),
      postmanRegion: region,
    },
    models,
    conclusions,
  };
}
