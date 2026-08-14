export type CheckStatus =
  | "available"
  | "authenticated"
  | "unauthenticated"
  | "protocol-ready"
  | "unavailable"
  | "not-found"
  | "unknown"
  | "error";

export interface ToolCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly version?: string;
  readonly endpoint?: string;
  readonly region?: "us" | "eu";
}

export interface McpCapabilityCheck extends ToolCheck {
  readonly configuration: "minimal" | "code" | "full";
  readonly transport: "streamable-http";
  readonly httpStatus: number | null;
  readonly initializeSucceeded: boolean;
  readonly toolsListSucceeded: boolean;
  readonly toolCount?: number;
  readonly sessionEstablished: boolean;
  readonly authenticationMode: "api-key" | "oauth" | "none" | "unknown";
}

export interface ModelCapability {
  readonly id: string;
  readonly source: "agent-mode" | "ai-request" | "flows" | "mcp" | "unknown";
  readonly externallyCallable: "yes" | "no" | "unknown";
  readonly evidence: string;
}

export interface DiscoveryReport {
  readonly phase: 2;
  readonly generatedAt: string;
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
  readonly postmanCli: ToolCheck;
  readonly postmanApi: ToolCheck;
  readonly mcp: readonly McpCapabilityCheck[];
  readonly learnConfiguration: ToolCheck;
  readonly environment: {
    readonly postmanApiKeyConfigured: boolean;
    readonly postmanApiBaseUrl?: string;
    readonly postmanRegion: "us" | "eu" | "unknown";
  };
  readonly models: readonly ModelCapability[];
  readonly conclusions: readonly string[];
}
