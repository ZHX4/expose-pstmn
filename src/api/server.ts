import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Provider } from "../providers/types.js";
import { authorizeRequest } from "./auth.js";
import { createConcurrencyGate, createRateLimiter } from "./limits.js";
import type { ChatCompletionRequest, GatewayConfig, OpenAIErrorBody, OpenAIModelsResponse, ServerHandle } from "./types.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function writeJson(response: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(status, { ...JSON_HEADERS, ...extraHeaders });
  response.end(JSON.stringify(body));
}

function errorBody(message: string, type: string, code: string | null = null): OpenAIErrorBody {
  return {
    error: { message, type, param: null, code },
  };
}

function requestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentLengthHeader = request.headers["content-length"];
  if (contentLengthHeader !== undefined) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) throw new Error("Invalid Content-Length header.");
    if (contentLength > maxBytes) throw new BodyTooLargeError();
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) throw new BodyTooLargeError();
    chunks.push(buffer);
  }

  if (bytes === 0) throw new InvalidJsonError("Request body is required.");
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidJsonError("Request body must contain valid JSON.");
  }
}

class BodyTooLargeError extends Error {
  public constructor() {
    super("Request body exceeds the configured size limit.");
    this.name = "BodyTooLargeError";
  }
}

class InvalidJsonError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidJsonError";
  }
}

function validateChatRequest(value: unknown): ChatCompletionRequest {
  if (!value || typeof value !== "object") throw new InvalidJsonError("Chat completion request must be a JSON object.");
  const candidate = value as Partial<ChatCompletionRequest>;
  if (typeof candidate.model !== "string" || candidate.model.length === 0) throw new InvalidJsonError("model is required.");
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0) throw new InvalidJsonError("messages must be a non-empty array.");
  for (const message of candidate.messages) {
    if (!message || typeof message !== "object") throw new InvalidJsonError("Each message must be an object.");
    const role = (message as { readonly role?: unknown }).role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
      throw new InvalidJsonError("Each message role must be system, user, assistant, or tool.");
    }
  }
  if (candidate.stream !== undefined && typeof candidate.stream !== "boolean") throw new InvalidJsonError("stream must be a boolean.");
  return candidate as ChatCompletionRequest;
}

export function createGatewayServer(config: GatewayConfig, provider: Provider): ServerHandle {
  const rateLimiter = createRateLimiter(config.rateLimitPerMinute);
  const concurrency = createConcurrencyGate(config.maxConcurrentRequests);

  const server = createServer((request, response) => {
    const id = requestId();
    response.setHeader("X-Request-Id", id);

    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;

    if (method === "OPTIONS") {
      writeJson(response, 204, null, { Allow: "GET,POST,OPTIONS" });
      return;
    }

    if (method === "GET" && path === "/healthz") {
      writeJson(response, 200, { status: "ok", provider: provider.id, capabilities: provider.capabilities });
      return;
    }

    if (!authorizeRequest(config.apiKey, request.headers.authorization)) {
      writeJson(response, 401, errorBody("Missing or invalid bearer token.", "authentication_error", "invalid_api_key"), {
        "WWW-Authenticate": "Bearer",
      });
      return;
    }

    if (!rateLimiter.allow()) {
      writeJson(response, 429, errorBody("Rate limit exceeded.", "rate_limit_error", "rate_limit_exceeded"), {
        "Retry-After": "60",
        "X-RateLimit-Remaining": "0",
      });
      return;
    }

    const run = async (): Promise<void> => {
      if (method === "GET" && path === "/v1/models") {
        const body: OpenAIModelsResponse = { object: "list", data: [] };
        writeJson(response, 200, body, { "X-RateLimit-Remaining": String(rateLimiter.remaining()) });
        return;
      }

      if (method === "GET" && path === "/v1/provider") {
        let health;
        try {
          health = await provider.health();
        } catch (error) {
          health = { provider: provider.id, ready: false, detail: error instanceof Error ? error.message : "Provider health check failed." };
        }
        writeJson(response, health.ready ? 200 : 503, {
          id: provider.id,
          capabilities: provider.capabilities,
          health,
        });
        return;
      }

      if (method === "GET" && path === "/v1/postman/tools") {
        const tools = await provider.listTools();
        writeJson(response, 200, { object: "list", data: tools });
        return;
      }

      if (method === "POST" && path === "/v1/postman/tools/call") {
        const body = await readJsonBody(request, config.maxBodyBytes) as unknown;
        if (!body || typeof body !== "object") throw new InvalidJsonError("Tool call request must be a JSON object.");
        const candidate = body as { readonly name?: unknown; readonly arguments?: unknown };
        if (typeof candidate.name !== "string" || candidate.name.length === 0) throw new InvalidJsonError("name is required.");
        const args = candidate.arguments === undefined ? {} : candidate.arguments;
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new InvalidJsonError("arguments must be a JSON object.");
        const result = await provider.callTool({ name: candidate.name, arguments: args as Record<string, unknown> });
        writeJson(response, 200, result);
        return;
      }

      if (method === "POST" && path === "/v1/chat/completions") {
        const body = validateChatRequest(await readJsonBody(request, config.maxBodyBytes));
        if (!provider.capabilities.modelCompletion) {
          writeJson(response, 501, errorBody("The configured provider does not expose a verified model-completion interface.", "not_implemented", "model_completion_unavailable"));
          return;
        }
        if (body.stream) {
          writeJson(response, 501, errorBody("Streaming is not available from the configured provider.", "not_implemented", "streaming_unavailable"));
          return;
        }
        writeJson(response, 501, errorBody("Model completion is not implemented by the configured provider.", "not_implemented", "model_completion_unavailable"));
        return;
      }

      writeJson(response, 404, errorBody("Not found.", "invalid_request_error", "not_found"));
    };

    void concurrency.run(run).catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof BodyTooLargeError) {
        writeJson(response, 413, errorBody(error.message, "invalid_request_error", "body_too_large"));
        return;
      }
      if (error instanceof InvalidJsonError) {
        writeJson(response, 400, errorBody(error.message, "invalid_request_error", "invalid_request"));
        return;
      }
      writeJson(response, 500, errorBody(error instanceof Error ? error.message : "Internal server error.", "server_error", "internal_error"));
    });
  });

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.max(1_000, Math.min(config.requestTimeoutMs, 10_000));
  server.keepAliveTimeout = 5_000;

  return {
    host: config.host,
    port: config.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

export async function listenGateway(config: GatewayConfig, provider: Provider): Promise<ServerHandle> {
  const handle = createGatewayServer(config, provider);
  const server = (handle as unknown as { server?: import("node:http").Server }).server;
  if (server) return handle;

  // Recreate using a Promise around the private server only through the public factory below.
  throw new Error("Gateway server handle must be started with startGatewayServer().");
}

export async function startGatewayServer(config: GatewayConfig, provider: Provider): Promise<ServerHandle> {
  const rateLimiter = createRateLimiter(config.rateLimitPerMinute);
  const concurrency = createConcurrencyGate(config.maxConcurrentRequests);
  const server = createServer((request, response) => {
    const id = requestId();
    response.setHeader("X-Request-Id", id);
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;

    const writeFailure = (status: number, body: OpenAIErrorBody, headers: Record<string, string> = {}) => writeJson(response, status, body, headers);

    if (method === "OPTIONS") {
      response.writeHead(204, { Allow: "GET,POST,OPTIONS" });
      response.end();
      return;
    }
    if (method === "GET" && path === "/healthz") {
      writeJson(response, 200, { status: "ok", provider: provider.id, capabilities: provider.capabilities });
      return;
    }
    if (!authorizeRequest(config.apiKey, request.headers.authorization)) {
      writeFailure(401, errorBody("Missing or invalid bearer token.", "authentication_error", "invalid_api_key"), { "WWW-Authenticate": "Bearer" });
      return;
    }
    if (!rateLimiter.allow()) {
      writeFailure(429, errorBody("Rate limit exceeded.", "rate_limit_error", "rate_limit_exceeded"), { "Retry-After": "60", "X-RateLimit-Remaining": "0" });
      return;
    }

    const execute = async (): Promise<void> => {
      if (method === "GET" && path === "/v1/models") {
        writeJson(response, 200, { object: "list", data: [] } satisfies OpenAIModelsResponse, { "X-RateLimit-Remaining": String(rateLimiter.remaining()) });
        return;
      }
      if (method === "GET" && path === "/v1/provider") {
        const health = await provider.health();
        writeJson(response, health.ready ? 200 : 503, { id: provider.id, capabilities: provider.capabilities, health });
        return;
      }
      if (method === "GET" && path === "/v1/postman/tools") {
        writeJson(response, 200, { object: "list", data: await provider.listTools() });
        return;
      }
      if (method === "POST" && path === "/v1/postman/tools/call") {
        const body = await readJsonBody(request, config.maxBodyBytes);
        if (!body || typeof body !== "object") throw new InvalidJsonError("Tool call request must be a JSON object.");
        const candidate = body as { readonly name?: unknown; readonly arguments?: unknown };
        if (typeof candidate.name !== "string" || candidate.name.length === 0) throw new InvalidJsonError("name is required.");
        const args = candidate.arguments ?? {};
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new InvalidJsonError("arguments must be a JSON object.");
        writeJson(response, 200, await provider.callTool({ name: candidate.name, arguments: args as Record<string, unknown> }));
        return;
      }
      if (method === "POST" && path === "/v1/chat/completions") {
        const body = validateChatRequest(await readJsonBody(request, config.maxBodyBytes));
        if (!provider.capabilities.modelCompletion) {
          writeFailure(501, errorBody("The configured provider does not expose a verified model-completion interface.", "not_implemented", "model_completion_unavailable"));
          return;
        }
        if (body.stream) {
          writeFailure(501, errorBody("Streaming is not available from the configured provider.", "not_implemented", "streaming_unavailable"));
          return;
        }
        writeFailure(501, errorBody("Model completion is not implemented by the configured provider.", "not_implemented", "model_completion_unavailable"));
        return;
      }
      writeFailure(404, errorBody("Not found.", "invalid_request_error", "not_found"));
    };

    void concurrency.run(execute).catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof BodyTooLargeError) {
        writeFailure(413, errorBody(error.message, "invalid_request_error", "body_too_large"));
      } else if (error instanceof InvalidJsonError) {
        writeFailure(400, errorBody(error.message, "invalid_request_error", "invalid_request"));
      } else {
        writeFailure(500, errorBody(error instanceof Error ? error.message : "Internal server error.", "server_error", "internal_error"));
      }
    });
  });

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.max(1_000, Math.min(config.requestTimeoutMs, 10_000));
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.port, config.host);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  return {
    host: config.host,
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
