import { PostmanMcpProvider } from "./postman-mcp.js";
import type { Provider } from "./types.js";

const DEFAULT_US_ENDPOINT = "https://mcp.postman.com/minimal";
const DEFAULT_EU_ENDPOINT = "https://mcp.eu.postman.com/minimal";

function getRegion(): "us" | "eu" {
  return process.env.POSTMAN_REGION === "eu" ? "eu" : "us";
}

function getEndpoint(region: "us" | "eu"): string {
  const configured = process.env.POSTMAN_MCP_ENDPOINT;
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new Error("POSTMAN_MCP_ENDPOINT must use HTTPS.");
    if (url.hostname !== "mcp.postman.com" && url.hostname !== "mcp.eu.postman.com") {
      throw new Error("POSTMAN_MCP_ENDPOINT must point to an official Postman MCP host.");
    }
    return url.toString().replace(/\/$/, "");
  }
  return region === "eu" ? DEFAULT_EU_ENDPOINT : DEFAULT_US_ENDPOINT;
}

function getConfiguration(endpoint: string): "minimal" | "code" | "full" {
  const pathname = new URL(endpoint).pathname.replace(/^\/+|\/+$/g, "");
  if (pathname === "code") return "code";
  if (pathname === "mcp") return "full";
  if (pathname === "minimal" || pathname === "") return "minimal";
  throw new Error(`Unsupported Postman MCP configuration in endpoint: ${pathname || "/"}`);
}

export function createProviderFromEnvironment(): Provider {
  const region = getRegion();
  const endpoint = getEndpoint(region);
  const configuration = getConfiguration(endpoint);
  const apiKey = process.env.POSTMAN_API_KEY;

  if (region === "us" && !apiKey) {
    throw new Error("US Postman MCP requires authentication. Set POSTMAN_API_KEY for non-interactive provider access.");
  }

  if (region === "eu" && !apiKey) {
    throw new Error("EU Postman MCP requires POSTMAN_API_KEY.");
  }

  return new PostmanMcpProvider({ endpoint, apiKey, configuration, region });
}
