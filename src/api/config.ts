import type { GatewayConfig } from "./types.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RATE_LIMIT = 60;

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function parseHost(value: string | undefined): string {
  const host = value?.trim() || DEFAULT_HOST;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("EXPOSE_PSTMN_HOST must be localhost or 127.0.0.1 in Phase 4.");
  }
  return host;
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const apiKey = env.EXPOSE_PSTMN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("EXPOSE_PSTMN_API_KEY is required to start the local gateway.");
  }

  return {
    host: parseHost(env.EXPOSE_PSTMN_HOST),
    port: parsePositiveInt("EXPOSE_PSTMN_PORT", env.EXPOSE_PSTMN_PORT, DEFAULT_PORT),
    apiKey,
    maxBodyBytes: parsePositiveInt("EXPOSE_PSTMN_MAX_BODY_BYTES", env.EXPOSE_PSTMN_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    maxConcurrentRequests: parsePositiveInt("EXPOSE_PSTMN_MAX_CONCURRENT", env.EXPOSE_PSTMN_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT),
    requestTimeoutMs: parsePositiveInt("EXPOSE_PSTMN_REQUEST_TIMEOUT_MS", env.EXPOSE_PSTMN_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    rateLimitPerMinute: parsePositiveInt("EXPOSE_PSTMN_RATE_LIMIT_PER_MINUTE", env.EXPOSE_PSTMN_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT),
  };
}
