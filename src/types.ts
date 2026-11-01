export interface AntigravityUser {
  id: string;
  email: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
  emailVerified?: boolean;
}

export interface ExpiryDetails {
  expiresAt: number;
  expiresAtDate: Date;
  expiresAtFormatted: string;
  expiresInSeconds: number;
  expiresInMinutes: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  usesGcpTos?: boolean;
}

export interface IneligibleTier {
  tierId: string;
  tierName: string;
  reasonCode: string;
  reasonMessage: string;
}

export interface AntigravitySubscription {
  hasActiveSubscription: boolean;
  activeTier: SubscriptionTier | null;
  allowedTiers: SubscriptionTier[];
  ineligibleTiers: IneligibleTier[];
  raw: Record<string, unknown>;
}

export interface RateLimitInfo {
  remainingRequests?: number;
  remainingTokens?: number;
  resetSeconds?: number;
  lastUpdated?: Date;
  isThrottled?: boolean;
}

export type AntigravityModel =
  | 'gemini-3.8-flash-high'
  | 'gemini-3.8-flash-medium'
  | 'gemini-3.8-flash-low'
  | 'Claude Sonnet 4.6 (Thinking)'
  | 'Claude Opus 4.6 (Thinking)'
  | 'GPT-OSS 120B (Medium)'
  | (string & {});

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ContentPartText {
  type: 'text';
  text: string;
}

export interface ContentPartImageUrl {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface ContentPartImage {
  type: 'image';
  image: string;
}

export type ContentPart =
  | ContentPartText
  | ContentPartImageUrl
  | ContentPartImage
  | { type: string; [key: string]: any };

export type MessageContent = string | ContentPart[];

export interface ToolDefinition {
  type?: 'function';
  name?: string;
  description?: string;
  parameters?: Record<string, any>;
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  execute?: (args: any) => Promise<any> | any;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: MessageRole;
  content?: MessageContent | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  thinkingTokens?: number;
  totalTokens: number;
}

export interface ResponseFormat {
  type: 'text' | 'json_object' | 'json_schema';
  json_schema?: {
    name?: string;
    description?: string;
    schema: Record<string, any>;
    strict?: boolean;
  };
}

export interface ChatOptions {
  prompt?: string;
  messages?: ChatMessage[];
  model?: AntigravityModel;
  system?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  parallel_tool_calls?: boolean;
  maxSteps?: number;
  jsonSchema?: Record<string, any> | string;
  response_format?: ResponseFormat;
  stream?: boolean;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
}

export type ChatInput = string | ChatMessage[] | ChatOptions;

export interface ChatResponse<T = any> {
  text: string;
  data?: T;
  model: string;
  durationMs: number;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length';
  reasoningContent?: string;
  usage?: TokenUsage;
  steps?: number;
}

export interface AntigravitySession {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  scopes: string[];
  user: AntigravityUser;
  expiry: ExpiryDetails;
  subscription?: AntigravitySubscription;
  source: 'local_gemini' | 'oauth_browser' | 'manual';
  raw?: Record<string, unknown>;
}

export interface AuthUrlOptions {
  redirectUri?: string;
  state?: string;
  prompt?: 'select_account' | 'consent' | 'consent select_account';
  loginHint?: string;
}

export interface AuthUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface AntigravityClientOptions {
  token?: string;
  accessToken?: string;
  session?: AntigravitySession;
  accounts?: AntigravitySession[];
  geminiDir?: string;
  autoOpenBrowser?: boolean;
  port?: number;
  clientId?: string;
  clientSecret?: string;
  defaultModel?: AntigravityModel;
  binaryPath?: string;
}

export interface LoginInteractiveOptions {
  port?: number;
  timeoutMs?: number;
  autoOpenBrowser?: boolean;
  prompt?: 'select_account' | 'consent' | 'consent select_account';
  loginHint?: string;
}

export interface ExchangeCodeOptions {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}
