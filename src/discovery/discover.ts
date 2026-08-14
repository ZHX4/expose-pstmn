import { runCommand } from "./command.js";
import { probeEndpoint } from "./http.js";
import { probeMcp } from "./mcp.js";
import type { DiscoveryReport, ModelCapability, ToolCheck } from "./types.js";

const MCP_ENDPOINTS = [
  { region: "us" as const, configuration: "minimal" as const, endpoint: "https://mcp.postman.com/minimal" },
  { region: "us" as const, configuration: "code" as const, endpoint: "https://mcp.postman.com/code" },
  { region: "us" as const, configuration: "full" as const, endpoint: "https://mcp.postman.com/mcp" },
  { region: "eu" as const, configuration: "minimal" as const, endpoint: "https://mcp.eu.postman.com/minimal" },
  { region: "eu" as const, configuration: "code" as const, endpoint: "https://mcp.eu.postman.com/code" },
  { region: "eu" as const, configuration: "full" as const, endpoint: "https://mcp.eu.postman.com/mcp" },
];

function inferRegion(apiBaseUrl: string | undefined): "us" | "eu" | "unknown" {
  if (!apiBaseUrl) return "unknown";
  if (apiBaseUrl.includes("api.eu.postman.com")) return "eu";
  if (apiBaseUrl.includes("api.postman.com")) return "us";
  return "unknown";
}

function normalizeApiBaseUrl(value: string | undefined, region: "us" | "eu" | "unknown"): string {
  const selected = value ?? (region === "eu" ? "https://api.eu.postman.com" : "https://api.postman.com");

  try {
    const parsed = new URL(selected);
    return parsed.origin;
  } catch {
    return selected.replace(/\/$/, "");
  }
}

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return value.length > 0 ? value.split(/\r?\n/, 1)[0] : undefined;
}

function sanitizeBaseUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid-url";
  }
}

function isOfficialPostmanApiHost(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "api.postman.com" || parsed.hostname === "api.eu.postman.com") &&
      !parsed.username &&
      !parsed.password;
  } catch {
    return false;
  }
}

async function checkPostmanApi(apiKey: string | undefined, apiBaseUrl: string): Promise<ToolCheck> {
  const endpoint = `${apiBaseUrl}/me`;
  if (!isOfficialPostmanApiHost(apiBaseUrl)) {
    return {
      name: "Postman API",
      status: "error",
      detail: "POSTMAN_API_BASE_URL must use the official HTTPS Postman API hostname (api.postman.com or api.eu.postman.com) without query or credential data.",
      endpoint: sanitizeBaseUrl(apiBaseUrl),
    };
  }

  if (!apiKey) {
    return {
      name: "Postman API",
      status: "unauthenticated",
      detail: "No POSTMAN_API_KEY is configured; GET /me authentication was not attempted.",
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
      detail: "Postman API rejected the configured API key at GET /me.",
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

function getLearnConfigurationCheck(): ToolCheck {
  return {
    name: "Postman MCP Learn configuration",
    status: "unknown",
    detail: "Postman documents Learn as an MCP configuration, but the current remote Streamable HTTP endpoint table does not publish a distinct Learn URL. No undocumented endpoint is synthesized or probed.",
  };
}

export async function discover(): Promise<DiscoveryReport> {
  const apiKey = process.env.POSTMAN_API_KEY;
  const configuredApiBaseUrl = process.env.POSTMAN_API_BASE_URL;
  const configuredRegion = process.env.POSTMAN_REGION === "eu" ? "eu" : undefined;
  const inferredRegion = inferRegion(configuredApiBaseUrl);
  const region = configuredRegion ?? (inferredRegion === "eu" || inferredRegion === "us" ? inferredRegion : "us");
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
  const mcp = await Promise.all(
    MCP_ENDPOINTS.map((candidate) => probeMcp(candidate.endpoint, candidate.configuration, candidate.region, apiKey)),
  );
  const learnConfiguration = getLearnConfigurationCheck();

  const models: ModelCapability[] = [
    {
      id: "GPT-5.6 Sol",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Observed by the user in the Postman Agent Mode model selector. Postman documents Agent Mode model selection, but the UI observation alone does not establish an external model endpoint.",
    },
    {
      id: "Claude Opus 4.8",
      source: "agent-mode",
      externallyCallable: "unknown",
      evidence: "Observed by the user in the Postman Agent Mode model selector. Postman documents Agent Mode model selection, but the UI observation alone does not establish an external model endpoint.",
    },
  ];

  const protocolReadyCount = mcp.filter((entry) => entry.status === "protocol-ready").length;
  const conclusions = [
    postmanCli.status === "available"
      ? "Postman CLI is available locally."
      : "Postman CLI is not verified locally; install it or expose it on PATH before CLI-based checks.",
    postmanApi.status === "authenticated"
      ? "The configured Postman API key is valid for GET /me."
      : postmanApi.status === "unauthenticated"
        ? "Postman API authentication is not currently available."
        : "Postman API reachability or configuration could not be verified.",
    protocolReadyCount > 0
      ? `${protocolReadyCount} Postman MCP endpoint(s) completed an MCP initialize + notifications/initialized + tools/list handshake.`
      : "No Postman MCP endpoint completed a full MCP initialization and tools/list handshake with the configured authentication path.",
    "The US remote MCP server supports OAuth, while the EU remote server requires a Postman API key. This CLI does not initiate an interactive OAuth browser flow.",
    learnConfiguration.status === "unknown"
      ? "The documented Learn MCP configuration is acknowledged but not probed because Postman's current remote endpoint table does not publish a distinct Learn URL."
      : "Learn configuration was verified.",
    "Agent Mode model visibility is recorded as account evidence only. External model callability is not claimed unless a supported API, MCP, or Flows path actually verifies it.",
  ];

  return {
    phase: 2,
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    postmanCli,
    postmanApi,
    mcp,
    learnConfiguration,
    environment: {
      postmanApiKeyConfigured: Boolean(apiKey),
      postmanApiBaseUrl: sanitizeBaseUrl(apiBaseUrl),
      postmanRegion: region,
    },
    models,
    conclusions,
  };
}
