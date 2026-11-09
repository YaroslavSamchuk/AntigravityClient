import { GoogleOAuthFlow, calculateExpiry } from './auth.js';
import {
  ANTIGRAVITY_ENDPOINT,
  AVAILABLE_MODELS,
  buildAuthHeaders,
  executeChatHttp,
  executeStreamChatHttp,
  runWithTools
} from './chat.js';
import { MemoryStorage } from './storage.js';
import type {
  AntigravityClientOptions,
  AntigravityModel,
  AntigravitySession,
  AntigravitySubscription,
  AntigravityUser,
  AuthUrlOptions,
  AuthUrlResult,
  ChatInput,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ExchangeCodeOptions,
  ExpiryDetails,
  RateLimitInfo,
  StorageAdapter,
  SubscriptionTier
} from './types.js';

export * from './types.js';
export * from './auth.js';
export * from './chat.js';
export * from './storage.js';
export * from './utils.js';
export * from './server.js';

import { startProxyServer } from './server.js';
import type { ProxyServerInstance, ProxyServerOptions } from './types.js';

/**
 * Universal, zero-dependency Antigravity & Gemini AI Client.
 * Runs seamlessly on Web Browsers (React, Next.js, Vite), Mobile (React Native / Expo),
 * Node.js, Bun, Deno, and Edge environments.
 */
export class Antigravity {
  readonly storage: StorageAdapter;
  readonly oauth: GoogleOAuthFlow;
  readonly defaultModel: AntigravityModel;
  readonly baseUrl?: string;

  private cachedSession: AntigravitySession | null = null;
  private accountsList: AntigravitySession[] = [];
  private activeAccountIndex: number = -1;
  private lastRateLimitInfo: RateLimitInfo = {};
  private apiKey?: string;

  constructor(options?: AntigravityClientOptions) {
    this.storage = options?.storage || new MemoryStorage();
    this.oauth = new GoogleOAuthFlow({
      clientId: options?.clientId,
      clientSecret: options?.clientSecret
    });
    this.defaultModel = options?.defaultModel || 'gemini-3.8-flash-high';
    const isBrowser = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
    const explicitUrl = options?.serverUrl || options?.proxyUrl || options?.baseUrl;
    this.baseUrl = explicitUrl ?? (isBrowser ? window.location.origin : undefined);
    this.apiKey = options?.apiKey;

    // Load multiple accounts if passed
    if (options?.accounts && options.accounts.length > 0) {
      for (const acc of options.accounts) {
        this.addAccount(acc);
      }
    }

    // Direct session or token initialization
    if (options?.session) {
      this.cachedSession = options.session;
      this.addAccount(options.session);
    } else if (options?.token || options?.accessToken) {
      const token = options.token || options.accessToken!;
      this.setToken(token);
    } else if (options?.apiKey) {
      this.setToken(options.apiKey);
    }
  }

  // ==========================================
  // Account & Token Management
  // ==========================================

  /**
   * Returns list of all registered accounts in this client instance.
   */
  getAccounts(): AntigravitySession[] {
    return [...this.accountsList];
  }

  /**
   * Adds an account/session to the pool.
   */
  addAccount(session: AntigravitySession): void {
    const existingIdx = this.accountsList.findIndex(
      (a) => a.user.email && a.user.email === session.user.email
    );
    if (existingIdx >= 0) {
      this.accountsList[existingIdx] = session;
    } else {
      this.accountsList.push(session);
    }

    if (!this.cachedSession || this.cachedSession.user.email === session.user.email) {
      this.cachedSession = session;
      this.activeAccountIndex = this.accountsList.findIndex(
        (a) => a.user.email === session.user.email
      );
    }
  }

  /**
   * Removes an account by email or id.
   */
  removeAccount(emailOrId: string): boolean {
    const idx = this.accountsList.findIndex(
      (a) => a.user.email === emailOrId || a.user.id === emailOrId
    );
    if (idx >= 0) {
      this.accountsList.splice(idx, 1);
      if (
        this.cachedSession &&
        (this.cachedSession.user.email === emailOrId || this.cachedSession.user.id === emailOrId)
      ) {
        this.cachedSession = this.accountsList[0] || null;
        this.activeAccountIndex = this.accountsList.length > 0 ? 0 : -1;
      }
      return true;
    }
    return false;
  }

  /**
   * Sets the active account by email, id, or index.
   */
  setActiveAccount(identifier: string | number): AntigravitySession {
    let target: AntigravitySession | undefined;
    let targetIdx = -1;

    if (typeof identifier === 'number') {
      target = this.accountsList[identifier];
      targetIdx = identifier;
    } else {
      targetIdx = this.accountsList.findIndex(
        (a) => a.user.email === identifier || a.user.id === identifier
      );
      target = this.accountsList[targetIdx];
    }

    if (!target) {
      throw new Error(`Account "${identifier}" not found.`);
    }

    this.cachedSession = target;
    this.activeAccountIndex = targetIdx;
    return target;
  }

  /**
   * Sets an Access Token (ya29... or API key) directly.
   * Ideal for React, React Native, Mobile, or Serverless backends.
   */
  setToken(
    token: string,
    details?: {
      refreshToken?: string;
      email?: string;
      name?: string;
      expiresInSeconds?: number;
    }
  ): AntigravitySession {
    const isApiKey = !token.startsWith('ya29.') && !token.startsWith('Bearer ') && token.length <= 60;
    const expiresAt = Date.now() + (details?.expiresInSeconds ? details.expiresInSeconds * 1000 : 3600 * 1000);

    const session: AntigravitySession = {
      accessToken: token,
      refreshToken: details?.refreshToken,
      tokenType: isApiKey ? 'ApiKey' : 'Bearer',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      user: {
        id: details?.email || (isApiKey ? 'api_key_user' : 'manual_user'),
        email: details?.email || (isApiKey ? 'api_key@antigravity' : 'user@antigravity'),
        name: details?.name || (isApiKey ? 'API Key User' : 'Authorized User')
      },
      expiry: calculateExpiry(expiresAt),
      source: 'manual'
    };

    this.cachedSession = session;
    this.addAccount(session);
    return session;
  }

  /**
   * Checks whether the client currently has a valid session or token.
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await this.getSession({ autoRefresh: false });
      return Boolean(session && session.accessToken && !session.expiry.isExpired);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves active session, auto-refreshing if expired and refresh token is available.
   */
  async getSession(options?: { autoRefresh?: boolean }): Promise<AntigravitySession> {
    const autoRefresh = options?.autoRefresh !== false;

    if (this.cachedSession) {
      this.cachedSession.expiry = calculateExpiry(this.cachedSession.expiry.expiresAt);
      if (!this.cachedSession.expiry.isExpired) {
        return this.cachedSession;
      }

      if (autoRefresh && this.cachedSession.refreshToken) {
        return this.refresh();
      }

      return this.cachedSession;
    }

    if (this.accountsList.length > 0 && this.activeAccountIndex >= 0) {
      const acc = this.accountsList[this.activeAccountIndex];
      if (acc) {
        acc.expiry = calculateExpiry(acc.expiry.expiresAt);
        if (!acc.expiry.isExpired) {
          this.cachedSession = acc;
          return acc;
        }
      }
    }

    // Try reading from storage
    try {
      const stored = await this.storage.getItem('session');
      if (stored) {
        const parsed = JSON.parse(stored) as AntigravitySession;
        parsed.expiry = calculateExpiry(parsed.expiry.expiresAt);
        if (!parsed.expiry.isExpired) {
          this.cachedSession = parsed;
          this.addAccount(parsed);
          return parsed;
        }
        if (autoRefresh && parsed.refreshToken) {
          this.cachedSession = parsed;
          return this.refresh();
        }
      }
    } catch {
      // Storage read fallback
    }

    throw new Error('No active Antigravity session. Please call setToken() or authenticate via OAuth.');
  }

  /**
   * Returns current valid Access Token or API key.
   */
  async getToken(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    const session = await this.getSession();
    return session.accessToken;
  }

  /**
   * Returns user profile information.
   */
  async getUser(): Promise<AntigravityUser> {
    const session = await this.getSession();
    return session.user;
  }

  /**
   * Returns token expiration details.
   */
  async getExpiry(): Promise<ExpiryDetails> {
    const session = await this.getSession();
    return session.expiry;
  }

  /**
   * Returns ready-to-use HTTP authorization headers.
   */
  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // ==========================================
  // AI Inference & Chat Generation
  // ==========================================

  /**
   * Returns list of available Gemini models.
   */
  getAvailableModels(): AntigravityModel[] {
    return [...AVAILABLE_MODELS];
  }

  /**
   * Sends a request to the model.
   * Accepts string prompt, ChatMessage[] history, or ChatOptions object.
   */
  chat(options: ChatOptions & { stream: true }): AsyncIterable<string>;
  chat<T = any>(options: ChatOptions & { stream?: false }): Promise<ChatResponse<T>>;
  chat<T = any>(input: string | ChatMessage[]): Promise<ChatResponse<T>>;
  chat<T = any>(input: ChatInput): Promise<ChatResponse<T>> | AsyncIterable<string>;
  chat<T = any>(input: ChatInput): Promise<ChatResponse<T>> | AsyncIterable<string> {
    let options: ChatOptions;
    if (typeof input === 'string') {
      options = { prompt: input, model: this.defaultModel };
    } else if (Array.isArray(input)) {
      options = { messages: input, model: this.defaultModel };
    } else {
      options = { model: this.defaultModel, ...input };
    }

    if (options.stream) {
      return this.streamChat(options);
    }

    // Auto Tool Runner if any tool has an .execute method
    const hasExecutableTools = options.tools?.some((t) => typeof t.execute === 'function');
    if (hasExecutableTools) {
      return (async () => {
        const token = await this.getToken();
        return runWithTools(token, options, this.baseUrl) as Promise<ChatResponse<T>>;
      })();
    }

    return (async () => {
      const token = await this.getToken();
      return executeChatHttp(token, options, this.baseUrl) as Promise<ChatResponse<T>>;
    })();
  }

  /**
   * Streams chat response chunks in real-time.
   */
  async *streamChat(input: ChatInput): AsyncIterable<string> {
    let options: ChatOptions;
    if (typeof input === 'string') {
      options = { prompt: input, model: this.defaultModel };
    } else if (Array.isArray(input)) {
      options = { messages: input, model: this.defaultModel };
    } else {
      options = { model: this.defaultModel, ...input };
    }

    const token = await this.getToken();
    yield* executeStreamChatHttp(token, options, this.baseUrl);
  }

  /**
   * Generates strictly-typed JSON matching given schema.
   */
  async structured<T = any>(options: {
    prompt?: string;
    messages?: ChatMessage[];
    schema: Record<string, any> | string;
    model?: AntigravityModel;
    system?: string;
    temperature?: number;
  }): Promise<T> {
    const res = await this.chat<T>({
      prompt: options.prompt,
      messages: options.messages,
      model: options.model,
      system: options.system,
      temperature: options.temperature,
      jsonSchema: options.schema
    });

    if (res.data !== undefined) {
      return res.data;
    }

    try {
      return JSON.parse(res.text) as T;
    } catch {
      throw new Error(`Failed to parse structured output from model: ${res.text}`);
    }
  }

  // ==========================================
  // Google OAuth Flow (Web & Mobile Friendly)
  // ==========================================

  /**
   * Generates authorization URL, state, and PKCE verifier without launching anything.
   */
  async getAuthUrl(options?: AuthUrlOptions): Promise<AuthUrlResult> {
    return this.oauth.generateAuthUrl(options);
  }

  /**
   * Exchanges an authorization code and PKCE verifier for tokens.
   */
  async exchangeCode(options: ExchangeCodeOptions): Promise<AntigravitySession> {
    const session = await this.oauth.exchangeCode(options);
    this.cachedSession = session;
    this.addAccount(session);
    try {
      await this.storage.setItem('session', JSON.stringify(session));
    } catch {}
    return session;
  }

  /**
   * Generates Google OAuth URL with prompt='select_account' to force Google account chooser.
   */
  async switchAccount(loginHint?: string, redirectUri?: string): Promise<AuthUrlResult> {
    return this.oauth.generateAuthUrl({
      prompt: 'select_account',
      loginHint,
      redirectUri
    });
  }

  /**
   * Refreshes active session token.
   */
  async refresh(): Promise<AntigravitySession> {
    const session = await this.getSession({ autoRefresh: false });
    if (!session.refreshToken) {
      throw new Error('Refresh token is missing.');
    }

    const refreshed = await this.oauth.refreshToken(session.refreshToken);
    session.accessToken = refreshed.accessToken;
    if (refreshed.refreshToken) session.refreshToken = refreshed.refreshToken;
    session.expiry = calculateExpiry(refreshed.expiresAt);

    this.cachedSession = session;
    try {
      await this.storage.setItem('session', JSON.stringify(session));
    } catch {}
    return session;
  }

  /**
   * Logs out and optionally revokes the access token.
   */
  async logout(): Promise<void> {
    if (this.cachedSession?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.cachedSession.accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      } catch {}
    }

    this.cachedSession = null;
    this.accountsList = [];
    this.activeAccountIndex = -1;
    try {
      await this.storage.removeItem('session');
    } catch {}
  }

  // ==========================================
  // Subscription & Rate Limits
  // ==========================================

  /**
   * Checks Google Cloud Code Assist / Antigravity subscription status and initializes session.
   */
  async getSubscription(): Promise<AntigravitySubscription> {
    const token = await this.getToken();
    const base = this.baseUrl || ANTIGRAVITY_ENDPOINT;

    try {
      const res = await fetch(`${base}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers: buildAuthHeaders(token),
        body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } })
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const allowedTiers: SubscriptionTier[] = (data.allowedTiers || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          isDefault: !!t.isDefault,
          usesGcpTos: t.usesGcpTos
        }));

        const paidTier: SubscriptionTier | undefined = data.paidTier
          ? {
              id: data.paidTier.id,
              name: data.paidTier.name,
              description: data.paidTier.description,
              isDefault: false
            }
          : undefined;

        return {
          hasActiveSubscription: Boolean(data.paidTier || allowedTiers.length > 0),
          activeTier: paidTier || allowedTiers.find((t) => t.isDefault) || allowedTiers[0] || null,
          allowedTiers,
          ineligibleTiers: data.ineligibleTiers || [],
          raw: data
        };
      }
    } catch {}

    return {
      hasActiveSubscription: false,
      activeTier: null,
      allowedTiers: [],
      ineligibleTiers: [],
      raw: {}
    };
  }

  /**
   * Returns rate limit information from the most recent request.
   */
  getRateLimits(): RateLimitInfo {
    return { ...this.lastRateLimitInfo };
  }

  /**
   * Authenticated fetch helper with automated token injection and rate limit tracking.
   */
  async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (!headers.has('Authorization')) {
      const token = await this.getToken();
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...init,
      headers
    });

    const remainingReq =
      response.headers.get('x-ratelimit-remaining-requests') ||
      response.headers.get('ratelimit-remaining');
    const remainingTok =
      response.headers.get('x-ratelimit-remaining-tokens') ||
      response.headers.get('ratelimit-remaining-tokens');
    const resetSec =
      response.headers.get('retry-after') ||
      response.headers.get('x-ratelimit-reset-requests');

    this.lastRateLimitInfo = {
      remainingRequests: remainingReq ? parseInt(remainingReq, 10) : this.lastRateLimitInfo.remainingRequests,
      remainingTokens: remainingTok ? parseInt(remainingTok, 10) : this.lastRateLimitInfo.remainingTokens,
      resetSeconds: resetSec ? parseInt(resetSec, 10) : undefined,
      lastUpdated: new Date(),
      isThrottled: response.status === 429
    };

    return response;
  }

  /**
   * Starts a local proxy server in 1 line of code (Node.js/Bun).
   * Automatically handles CORS and User-Agent headers for browser clients.
   *
   * Example:
   * ```typescript
   * await Antigravity.startServer({ port: 3000 });
   * ```
   */
  static async startServer(options?: ProxyServerOptions): Promise<ProxyServerInstance> {
    return startProxyServer(options);
  }

  /**
   * Starts a local proxy server bound to this client's configuration (Node.js/Bun).
   */
  async startServer(port?: number): Promise<ProxyServerInstance> {
    return startProxyServer({ port: port || 3000 });
  }
}
