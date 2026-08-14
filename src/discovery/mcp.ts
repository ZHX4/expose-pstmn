import type { McpCapabilityCheck } from "./types.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 8_000;

type JsonRpcResponse = {
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string };
};

interface McpRequestResult {
  readonly httpStatus: number | null;
  readonly headers: Headers | null;
  readonly body: unknown;
  readonly detail: string;
}

function parseSseBody(text: string): unknown {
  const events = text
    .split(/\r?\n\r?\n/)
    .map((event) => event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n"))
    .filter(Boolean);

  for (const data of events.reverse()) {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function requestMcp(
  endpoint: string,
  body: unknown,
  apiKey: string | undefined,
  sessionId?: string,
): Promise<McpRequestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };

    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const parsed = contentType.includes("text/event-stream")
      ? parseSseBody(text)
      : text.length > 0
        ? (() => {
            try {
              return JSON.parse(text) as unknown;
            } catch {
              return undefined;
            }
          })()
        : undefined;

    return {
      httpStatus: response.status,
      headers: response.headers,
      body: parsed,
      detail: response.ok
        ? "MCP request completed."
        : `MCP endpoint responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    const detail = error instanceof DOMException && error.name === "AbortError"
      ? `MCP request timed out after ${REQUEST_TIMEOUT_MS}ms.`
      : error instanceof Error
        ? error.message
        : "Unknown MCP request error.";

    return {
      httpStatus: null,
      headers: null,
      body: undefined,
      detail,
    };
  } finally {
    clearTimeout(timer);
  }
}

function getJsonRpcResult(body: unknown): unknown {
  if (!body || typeof body !== "object") return undefined;
  const response = body as JsonRpcResponse;
  if (response.error || response.result === undefined) return undefined;
  return response.result;
}

function getToolsCount(body: unknown): number | undefined {
  const result = getJsonRpcResult(body);
  if (!result || typeof result !== "object") return undefined;
  const tools = (result as { readonly tools?: unknown }).tools;
  return Array.isArray(tools) ? tools.length : undefined;
}

function getInitializedProtocolVersion(body: unknown): string | undefined {
  const result = getJsonRpcResult(body);
  if (!result || typeof result !== "object") return undefined;
  const version = (result as { readonly protocolVersion?: unknown }).protocolVersion;
  return typeof version === "string" ? version : undefined;
}

export async function probeMcp(
  endpoint: string,
  configuration: "minimal" | "code" | "full",
  region: "us" | "eu",
  apiKey?: string,
): Promise<McpCapabilityCheck> {
  const authenticationMode: "api-key" | "oauth" | "none" = apiKey
    ? "api-key"
    : region === "us"
      ? "oauth"
      : "none";

  const baseResult = {
    name: `Postman MCP ${configuration}`,
    endpoint,
    region,
    configuration,
    transport: "streamable-http" as const,
    authenticationMode,
  };

  const initialize = await requestMcp(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "expose-pstmn",
          version: "0.1.0",
        },
      },
    },
    apiKey,
  );

  if (initialize.httpStatus === 401 || initialize.httpStatus === 403) {
    return {
      ...baseResult,
      status: "unauthenticated",
      detail: apiKey
        ? `MCP authentication was rejected (HTTP ${initialize.httpStatus}).`
        : region === "us"
          ? "US MCP server supports OAuth, but no API key was supplied and this discovery command does not initiate an interactive OAuth flow."
          : "EU MCP server requires a Postman API key.",
      httpStatus: initialize.httpStatus,
      initializeSucceeded: false,
      toolsListSucceeded: false,
      sessionEstablished: false,
    };
  }

  const protocolVersion = getInitializedProtocolVersion(initialize.body);
  const initializeSucceeded = Boolean(
    initialize.httpStatus &&
    initialize.httpStatus >= 200 &&
    initialize.httpStatus < 300 &&
    protocolVersion,
  );

  if (!initializeSucceeded) {
    return {
      ...baseResult,
      status: "unavailable",
      detail: protocolVersion
        ? `MCP initialize negotiated protocol version ${protocolVersion}.`
        : initialize.detail,
      httpStatus: initialize.httpStatus,
      initializeSucceeded: false,
      toolsListSucceeded: false,
      sessionEstablished: false,
    };
  }

  const sessionId = initialize.headers?.get("Mcp-Session-Id") ?? undefined;

  const initializedNotification = await requestMcp(
    endpoint,
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
    apiKey,
    sessionId,
  );

  const notificationSucceeded = initializedNotification.httpStatus === 202 ||
    initializedNotification.httpStatus === 200 ||
    initializedNotification.httpStatus === 204;

  if (!notificationSucceeded) {
    return {
      ...baseResult,
      status: "available",
      detail: "MCP initialize succeeded, but notifications/initialized was not accepted.",
      httpStatus: initializedNotification.httpStatus ?? initialize.httpStatus,
      initializeSucceeded: true,
      toolsListSucceeded: false,
      sessionEstablished: Boolean(sessionId),
    };
  }

  const toolsList = await requestMcp(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    },
    apiKey,
    sessionId,
  );

  const toolCount = getToolsCount(toolsList.body);
  const toolsListSucceeded = Boolean(
    toolsList.httpStatus &&
    toolsList.httpStatus >= 200 &&
    toolsList.httpStatus < 300 &&
    toolCount !== undefined,
  );

  return {
    ...baseResult,
    status: toolsListSucceeded ? "protocol-ready" : "available",
    detail: toolsListSucceeded
      ? `MCP initialize, notifications/initialized, and tools/list succeeded; ${toolCount} tool(s) were returned.`
      : "MCP initialize and initialization notification succeeded, but tools/list could not be verified.",
    httpStatus: toolsList.httpStatus ?? initialize.httpStatus,
    initializeSucceeded: true,
    toolsListSucceeded,
    ...(toolCount !== undefined ? { toolCount } : {}),
    sessionEstablished: Boolean(sessionId),
  };
}
