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

interface McpSession {
  readonly sessionId?: string;
  readonly initializeSucceeded: boolean;
  readonly toolsListSucceeded: boolean;
  readonly toolCount?: number;
  readonly httpStatus: number | null;
  readonly authenticationMode: "api-key" | "oauth" | "none" | "unknown";
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

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = response.headers.get("content-type")?.includes("text/event-stream")
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

function hasJsonRpcError(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return "error" in body && Boolean((body as JsonRpcResponse).error);
}

function getToolsCount(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const result = (body as JsonRpcResponse).result;
  if (!result || typeof result !== "object") return undefined;
  const tools = (result as { readonly tools?: unknown }).tools;
  return Array.isArray(tools) ? tools.length : undefined;
}

export async function probeMcp(
  endpoint: string,
  configuration: "minimal" | "code" | "full",
  region: "us" | "eu",
  apiKey?: string,
): Promise<McpCapabilityCheck> {
  const authMode: "api-key" | "oauth" | "none" = apiKey
    ? "api-key"
    : region === "us"
      ? "oauth"
      : "none";

  const initializeRequest = {
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
  };

  const initialize = await requestMcp(endpoint, initializeRequest, apiKey);

  if (initialize.httpStatus === 401 || initialize.httpStatus === 403) {
    return {
      name: `Postman MCP ${configuration}`,
      status: "unauthenticated",
      detail: apiKey
        ? `MCP authentication was rejected (HTTP ${initialize.httpStatus}).`
        : region === "us"
          ? "US MCP server requires OAuth for this discovery probe; no API key was supplied."
          : "EU MCP server requires a Postman API key.",
      endpoint,
      region,
      configuration,
      transport: "streamable-http",
      httpStatus: initialize.httpStatus,
      initializeSucceeded: false,
      toolsListSucceeded: false,
      sessionEstablished: false,
      authenticationMode: authMode,
    };
  }

  if (!initialize.httpStatus || initialize.httpStatus < 200 || initialize.httpStatus >= 300 || hasJsonRpcError(initialize.body)) {
    return {
      name: `Postman MCP ${configuration}`,
      status: "unavailable",
      detail: initialize.detail,
      endpoint,
      region,
      configuration,
      transport: "streamable-http",
      httpStatus: initialize.httpStatus,
      initializeSucceeded: false,
      toolsListSucceeded: false,
      sessionEstablished: false,
      authenticationMode: authMode,
    };
  }

  const sessionId = initialize.headers?.get("Mcp-Session-Id") ?? undefined;
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

  const toolsListSucceeded = Boolean(
    toolsList.httpStatus &&
    toolsList.httpStatus >= 200 &&
    toolsList.httpStatus < 300 &&
    !hasJsonRpcError(toolsList.body),
  );

  return {
    name: `Postman MCP ${configuration}`,
    status: toolsListSucceeded ? "protocol-ready" : "available",
    detail: toolsListSucceeded
      ? "MCP initialize and tools/list succeeded."
      : "MCP initialize succeeded, but tools/list could not be verified.",
    endpoint,
    region,
    configuration,
    transport: "streamable-http",
    httpStatus: toolsList.httpStatus ?? initialize.httpStatus,
    initializeSucceeded: true,
    toolsListSucceeded,
    ...(toolsListSucceeded && getToolsCount(toolsList.body) !== undefined
      ? { toolCount: getToolsCount(toolsList.body) }
      : {}),
    sessionEstablished: Boolean(sessionId),
    authenticationMode: apiKey ? "api-key" : authMode,
  };
}
