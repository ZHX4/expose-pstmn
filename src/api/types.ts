export interface GatewayConfig {
  readonly host: string;
  readonly port: number;
  readonly apiKey: string;
  readonly maxBodyBytes: number;
  readonly maxConcurrentRequests: number;
  readonly requestTimeoutMs: number;
  readonly rateLimitPerMinute: number;
}

export interface OpenAIMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: unknown;
  readonly name?: string;
  readonly tool_call_id?: string;
}

export interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly OpenAIMessage[];
  readonly stream?: boolean;
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly max_completion_tokens?: number;
  readonly top_p?: number;
  readonly stop?: string | readonly string[];
  readonly user?: string;
  readonly tools?: readonly unknown[];
  readonly tool_choice?: unknown;
}

export interface OpenAIModel {
  readonly id: string;
  readonly object: "model";
  readonly created: number;
  readonly owned_by: string;
}

export interface OpenAIModelsResponse {
  readonly object: "list";
  readonly data: readonly OpenAIModel[];
}

export interface OpenAIErrorBody {
  readonly error: {
    readonly message: string;
    readonly type: string;
    readonly param: string | null;
    readonly code: string | null;
  };
}

export interface ServerHandle {
  readonly host: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}
