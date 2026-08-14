import { McpClient, type McpTool } from "./mcp-client.js";
import type {
  Provider,
  ProviderCapabilities,
  ProviderHealth,
  ProviderTool,
  ToolCallRequest,
  ToolCallResult,
} from "./types.js";

export interface PostmanMcpProviderOptions {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly configuration: "minimal" | "code" | "full";
  readonly region: "us" | "eu";
}

const CAPABILITIES: ProviderCapabilities = Object.freeze({
  protocol: "mcp",
  toolExecution: true,
  modelCompletion: false,
  streaming: false,
});

export class PostmanMcpProvider implements Provider {
  public readonly id = "postman-mcp";
  public readonly capabilities = CAPABILITIES;
  private readonly client: McpClient;
  private readonly endpoint: string;
  private readonly configuration: PostmanMcpProviderOptions["configuration"];
  private readonly region: PostmanMcpProviderOptions["region"];

  public constructor(options: PostmanMcpProviderOptions) {
    this.endpoint = options.endpoint;
    this.configuration = options.configuration;
    this.region = options.region;
    this.client = new McpClient({ endpoint: options.endpoint, apiKey: options.apiKey });
  }

  public async health(): Promise<ProviderHealth> {
    try {
      const initialized = await this.client.initialize();
      const tools = await this.client.listTools();
      return {
        provider: this.id,
        ready: true,
        detail: `MCP ${this.configuration} (${this.region}) initialized successfully; ${tools.length} tool(s) available at ${this.endpoint}. Negotiated ${initialized.protocolVersion}.`,
      };
    } catch (error) {
      return {
        provider: this.id,
        ready: false,
        detail: error instanceof Error ? error.message : "Unknown Postman MCP provider error.",
      };
    }
  }

  public async listTools(): Promise<readonly ProviderTool[]> {
    const tools = await this.client.listTools();
    return tools.map((tool: McpTool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
    }));
  }

  public async callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    const result = await this.client.callTool(request.name, request.arguments ?? {});
    return result;
  }
}
