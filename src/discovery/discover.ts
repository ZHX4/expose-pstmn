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
  if (apiBaseUrl.includes("api.eu.postman.com")) return "eu";
  if (apiBaseUrl.includes("api.getpostman.com") || apiBaseUrl.includes("api.postman.com")) return "us";
  return "unknown";
}

function normalizeApiBaseUrl(value: string | undefined, region: "us" | "eu" | "unknown"): string {
  if (value) return value.replace(/\/$/, "");
  return region === "eu" ? "https://api.eu.postman.com" : "https://api.getpostman.com";
}

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return value.length > 0 ? value.split(/\r?\n/, 1)[0] : undefined;
}

function sanitizeBaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "invalid-url";
  }
}

async function checkPostmanApi(apiKey: string | undefined, apiBaseUrl: string): Promise<ToolCheck> {
  const endpoint = `${apiBaseUrl}/me`;
  if (!apiKey) {
    return {
      name: "Postman API",
      status: "unauthenticated",
      detail: "No POSTMAN_API_KEY is configured; authentication was not attempted.",
      endpoint,
    };
  }

  const result = await probeEndpoint(endpoint, {
    headers: { "X-API-Key": apiKey },
  });

  if (result.status === 200) {
    return {
      name: "Postman API",
      status: "authenticated",
      detail: "Postman API accepted the configured API key at GET /me.",
      endpoint,
    };
  }

  if (result.status === 401) {
    return {
      name: "Postman API",
      status: "unauthenticated",
      detail: "Postman API rejected the configured API key.",
      endpoint,
    };
  }

  return {
    name: "Postman API",
    status: result.status === null ? "error" : "unavailable",
    detail: result.detail,
    endpoint,
  };
}

export async function discover(): Promise<DiscoveryReport> {
  const apiKey = process.env.POSTMAN_API_KEY;
  const configuredApiBaseUrl = process.env.POSTMAN_API_BASE_URL;
  const configuredRegion = process.env.POSTMAN_REGION === "eu" ? "eu" : undefined;
  const region = configuredRegion ?? inferRegion(configuredApiBaseUrl);
  const apiBaseUrl = normalizeApiBaseUrl(configuredApiBaseUrl, region);

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

  const postmanApi = await checkPostmanApi(apiKey, apiBaseUrl);

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
      id: "GPT-5.6 Sol",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Observed by the user in the Postman Agent Mode model selector; this does not prove external callability.",
    },
    {
      id: "Claude Opus 4.8",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Observed by the user in the Postman Agent Mode model selector; this does not prove external callability.",
    },
  ];

  const conclusions = [
    postmanCli.status === "available"
      ? "Postman CLI is available locally."
      : "Postman CLI is not verified locally; install it or expose it on PATH before CLI-based cloud checks.",
    postmanApi.status === "authenticated"
      ? "The configured Postman API key is valid for GET /me."
      : postmanApi.status === "unauthenticated"
        ? "Postman API authentication is not currently available."
        : "Postman API reachability could not be verified.",
    mcp.some((entry) => entry.status === "available" || entry.status === "authenticated")
      ? "At least one documented Postman MCP endpoint is reachable."
      : "No documented Postman MCP endpoint was confirmed reachable from this machine.",
    "Agent Mode model visibility is recorded as account evidence only; external model access remains unverified until a supported provider path succeeds.",
  ];

  return {
    phase: 2,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    postmanCli,
    postmanApi,
    mcp,
    environment: {
      postmanApiKeyConfigured: Boolean(apiKey),
      postmanApiBaseUrl: sanitizeBaseUrl(apiBaseUrl),
      postmanRegion: region,
    },
    models,
    conclusions,
  };
}
