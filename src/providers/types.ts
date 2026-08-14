export interface ProviderTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

export interface ProviderCapabilities {
  readonly protocol: "mcp";
  readonly toolExecution: boolean;
  readonly modelCompletion: boolean;
  readonly streaming: boolean;
}

export interface ProviderHealth {
  readonly provider: string;
  readonly ready: boolean;
  readonly detail: string;
}

export interface ToolCallRequest {
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

export interface ToolCallResult {
  readonly content: readonly unknown[];
  readonly isError: boolean;
}

export interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  health(): Promise<ProviderHealth>;
  listTools(): Promise<readonly ProviderTool[]>;
  callTool(request: ToolCallRequest): Promise<ToolCallResult>;
}
