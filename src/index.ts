import fs from 'node:fs';
import { LocalGeminiStore, calculateExpiry } from './local.js';
import { GoogleOAuthFlow } from './oauth.js';
import { AVAILABLE_MODELS, executeChat, executeChatHttp, executeStreamChat, resolveAgyBinary } from './ai.js';
import { startOpenAIServer, type ServerOptions } from './server.js';
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
  LoginInteractiveOptions,
  RateLimitInfo,
  SubscriptionTier
} from './types.js';

export * from './types.js';
export * from './local.js';
export * from './oauth.js';
export * from './ai.js';
export * from './server.js';
export * from './utils/jwt.js';

/**
 * Universal, zero-dependency client for Google Antigravity & Gemini.
 * Includes authentication, session management, and direct AI generation APIs.
 */
export class Antigravity {
  readonly localStore: LocalGeminiStore;
  readonly oauth: GoogleOAuthFlow;
  readonly defaultModel: AntigravityModel;
  private binaryPath: string;
  private cachedSession: AntigravitySession | null = null;
  private accountsList: AntigravitySession[] = [];
  private activeAccountIndex: number = -1;
  private lastRateLimitInfo: RateLimitInfo = {};

  constructor(options?: AntigravityClientOptions) {
    this.localStore = new LocalGeminiStore(options?.geminiDir);
    this.oauth = new GoogleOAuthFlow({
      clientId: options?.clientId,
      clientSecret: options?.clientSecret,
      port: options?.port
    });
    this.defaultModel = options?.defaultModel || 'gemini-3.8-flash-high';
    this.binaryPath = resolveAgyBinary(options?.binaryPath);

    // Ініціалізація акаунтів та сесій, якщо вони передані в конструктор
    if (options?.accounts && options.accounts.length > 0) {
      for (const acc of options.accounts) {
        this.addAccount(acc);
      }
    }

    if (options?.session) {
      this.cachedSession = options.session;
      this.addAccount(options.session);
    } else if (options?.token || options?.accessToken) {
      const token = options.token || options.accessToken!;
      this.setToken(token);
    }
  }

  // ==========================================
  // Керування акаунтами та токенами (Account & Token Management)
  // ==========================================

  /**
   * Повертає список усіх зареєстрованих або підключених акаунтів
   */
  getAccounts(): AntigravitySession[] {
    return [...this.accountsList];
  }

  /**
   * Додає сесію/акаунт до пулу акаунтів і робить її активною, якщо активного ще немає
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
   * Видаляє акаунт зі списку за email або id
   */
  removeAccount(emailOrId: string): boolean {
    const idx = this.accountsList.findIndex(
      (a) => a.user.email === emailOrId || a.user.id === emailOrId
    );
    if (idx >= 0) {
      this.accountsList.splice(idx, 1);
      if (this.cachedSession && (this.cachedSession.user.email === emailOrId || this.cachedSession.user.id === emailOrId)) {
        this.cachedSession = this.accountsList[0] || null;
        this.activeAccountIndex = this.accountsList.length > 0 ? 0 : -1;
      }
      return true;
    }
    return false;
  }

  /**
   * Встановлює активний акаунт за email, id або індексом у списку
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
      throw new Error(`Акаунт "${identifier}" не знайдено серед підключених.`);
    }

    this.cachedSession = target;
    this.activeAccountIndex = targetIdx;
    return target;
  }

  /**
   * Підключає клієнт напряму за токеном (ya29... або будь-яким Bearer токеном).
   * Ідеально підходить для мобільних додатків, веб-сайтів (React, Next.js, React Native).
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
    const expiresAt = Date.now() + (details?.expiresInSeconds ? details.expiresInSeconds * 1000 : 3600 * 1000);
    const session: AntigravitySession = {
      accessToken: token,
      refreshToken: details?.refreshToken,
      tokenType: 'Bearer',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      user: {
        id: details?.email || 'manual_user',
        email: details?.email || 'user@antigravity',
        name: details?.name || 'Authorized User'
      },
      expiry: calculateExpiry(expiresAt),
      source: 'manual'
    };

    this.cachedSession = session;
    this.addAccount(session);
    return session;
  }

  /**
   * Перевіряє, чи є активна валідна сесія (чи користувач авторизований)
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await this.getSession({ autoLogin: false });
      return Boolean(session && session.accessToken && !session.expiry.isExpired);
    } catch {
      return false;
    }
  }

  // ==========================================
  // 1. Пряма генерація тексту та AI-чат (Inference)
  // ==========================================

  /**
   * Повертає список моделей, доступних в Antigravity
   */
  getAvailableModels(): AntigravityModel[] {
    return [...AVAILABLE_MODELS];
  }

  /**
   * Відправляє запит до моделі (Gemini або Claude).
   * Приймає звичайний рядок, масив повідомлень messages, або об'єкт налаштувань (з tools, temperature, topP, stream тощо).
   * 
   * @example
   * // 1. Простий рядок:
   * const res = await ag.chat('Привіт!');
   * 
   * @example
   * // 2. Масив повідомлень з історією:
   * const res = await ag.chat([
   *   { role: 'user', content: 'Мене звати Ярослав' },
   *   { role: 'assistant', content: 'Привіт, Ярославе!' },
   *   { role: 'user', content: 'Як мене звати?' }
   * ]);
   * 
   * @example
   * // 3. Об'єкт із повними налаштуваннями (tools, temperature, effort):
   * const res = await ag.chat({
   *   model: 'Claude Sonnet 4.6 (Thinking)',
   *   temperature: 0.2,
   *   effort: 'high',
   *   messages: [{ role: 'user', content: 'Яка погода у Львові?' }],
   *   tools: [weatherTool]
   * });
   * if (res.toolCalls) {
   *   console.log('Модель викликає інструмент:', res.toolCalls);
   * }
   * 
   * @example
   * // 4. Стрімінг через ag.chat з опцією stream: true:
   * for await (const chunk of ag.chat({ messages: [...], stream: true })) {
   *   process.stdout.write(chunk);
   * }
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

    // Якщо інструменти мають метод execute — автоматично виконуємо повний цикл (Auto Tool Runner)
    const hasExecutableTools = options.tools?.some((t) => typeof t.execute === 'function');
    if (hasExecutableTools) {
      return this.runWithTools(options);
    }

    return this.executeChatUnified(options);
  }

  /**
   * Уніфікований метод виконання запиту:
   * 1. Якщо на машині є бінарник agy (десктопний режим розробки) — використовує його.
   * 2. Якщо бінарника немає (мобільні телефони, веб-браузери, серверлес) або він дав збій —
   *    автоматично перемикається на чистий HTTPS API запит через Google OAuth Access Token!
   */
  private async executeChatUnified(options: ChatOptions): Promise<ChatResponse> {
    const hasBinary =
      typeof process !== 'undefined' &&
      this.binaryPath &&
      fs.existsSync(this.binaryPath);

    if (hasBinary) {
      try {
        return await executeChat(this.binaryPath, options);
      } catch (err) {
        if (await this.isAuthenticated()) {
          const token = await this.getToken();
          return executeChatHttp(token, options);
        }
        throw err;
      }
    }

    const token = await this.getToken();
    return executeChatHttp(token, options);
  }

  /**
   * Генерує строго типізований об'єкт за вказаною схемою (Structured Output).
   * 
   * @example
   * interface WeatherReport {
   *   city: string;
   *   temperature: number;
   *   conditions: string;
   * }
   * 
   * const weather = await ag.structured<WeatherReport>({
   *   prompt: 'Яка зараз погода в Києві?',
   *   schema: {
   *     type: 'object',
   *     properties: {
   *       city: { type: 'string' },
   *       temperature: { type: 'number' },
   *       conditions: { type: 'string' }
   *     },
   *     required: ['city', 'temperature', 'conditions']
   *   }
   * });
   * 
   * console.log(weather.city, weather.temperature);
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
      throw new Error(`Не вдалося розпарсити структуровану відповідь: ${res.text}`);
    }
  }

  /**
   * Автоматичний виконавець інструментів (Auto Tool Runner).
   * Викликає execute() для всіх toolCalls паралельно, повертає результат моделі та віддає фінальну відповідь.
   */
  private async runWithTools(options: ChatOptions): Promise<ChatResponse> {
    const maxSteps = options.maxSteps || 5;
    let steps = 0;
    const messages: ChatMessage[] = options.messages ? [...options.messages] : [];
    if (options.prompt && messages.length === 0) {
      messages.push({ role: 'user', content: options.prompt });
    }

    while (steps < maxSteps) {
      steps++;
      const res = await this.executeChatUnified({ ...options, messages });

      // Якщо модель не викликала тули — повертаємо готову відповідь
      if (!res.toolCalls || res.toolCalls.length === 0) {
        return { ...res, steps };
      }

      // Знаходимо викликані тули, для яких є функція execute
      const executableCalls = res.toolCalls.filter((c) => {
        const toolDef = options.tools?.find(
          (t) => (t.function?.name || t.name) === c.function.name
        );
        return typeof toolDef?.execute === 'function';
      });

      if (executableCalls.length === 0) {
        return { ...res, steps };
      }

      // Додаємо виклик асистента до історії
      messages.push({
        role: 'assistant',
        tool_calls: res.toolCalls
      });

      // Виконуємо всі тули паралельно
      const executed = await Promise.all(
        executableCalls.map(async (call) => {
          const toolDef = options.tools?.find(
            (t) => (t.function?.name || t.name) === call.function.name
          )!;
          let parsedArgs = {};
          try {
            parsedArgs =
              typeof call.function.arguments === 'string'
                ? JSON.parse(call.function.arguments)
                : call.function.arguments;
          } catch {}
          const result = await toolDef.execute!(parsedArgs);
          return {
            callId: call.id,
            name: call.function.name,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          };
        })
      );

      // Додаємо кожен результат з role: 'tool'
      for (const item of executed) {
        messages.push({
          role: 'tool',
          tool_call_id: item.callId,
          name: item.name,
          content: item.content
        });
      }
    }

    return this.executeChatUnified({ ...options, messages });
  }

  /**
   * Стрімінг відповіді в реальному часі. Також підтримує рядок, масив messages або об'єкт.
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

    yield* executeStreamChat(this.binaryPath, options);
  }

  // ==========================================
  // 2. Отримання даних та поточної сесії
  // ==========================================

  /**
   * Отримує повну активну сесію (користувач, токени, детальний статус придатності).
   * Якщо autoLogin = false, повертає null (або викидає), не запускаючи браузер.
   */
  async getSession(options?: boolean | { forceRefresh?: boolean; autoLogin?: boolean }): Promise<AntigravitySession> {
    const forceRefresh = typeof options === 'boolean' ? options : !!options?.forceRefresh;
    const autoLogin = typeof options === 'object' && options.autoLogin !== undefined ? options.autoLogin : true;

    if (!forceRefresh && this.cachedSession && !this.cachedSession.expiry.isExpired) {
      this.cachedSession.expiry = calculateExpiry(this.cachedSession.expiry.expiresAt);
      return this.cachedSession;
    }

    if (this.accountsList.length > 0 && this.activeAccountIndex >= 0) {
      const acc = this.accountsList[this.activeAccountIndex];
      if (acc && !acc.expiry.isExpired) {
        this.cachedSession = acc;
        return acc;
      }
    }

    try {
      const localSession = await this.localStore.readSession();
      if (localSession && !localSession.expiry.isExpired) {
        this.cachedSession = localSession;
        this.addAccount(localSession);
        return localSession;
      }
    } catch {
      // Ігноруємо помилки читання (наприклад, у середовищах без FS)
    }

    if (!autoLogin) {
      return null as any;
    }

    console.log('ℹ️ Не знайдено дійсної сесії. Запуск авторизації...');
    const newSession = await this.login();
    this.cachedSession = newSession;
    this.addAccount(newSession);
    return newSession;
  }

  /**
   * Повертає тільки рядок дійсного Access Token (ya29...).
   */
  async getToken(): Promise<string> {
    const session = await this.getSession();
    return session.accessToken;
  }

  /**
   * Повертає профіль користувача (ім'я, email, аватар, ID, статус верифікації).
   */
  async getUser(): Promise<AntigravityUser> {
    const session = await this.getSession();
    return session.user;
  }

  /**
   * Повертає детальний статус придатності токена (дати, хвилини, чи прострочений).
   */
  async getExpiry(): Promise<ExpiryDetails> {
    const session = await this.getSession();
    return session.expiry;
  }

  /**
   * Повертає готові HTTP-заголовки для API запитів.
   */
  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // ==========================================
  // 3. Підписка, тарифи та ліміти (Subscription & Quotas)
  // ==========================================

  /**
   * Отримує статус підписки Antigravity / Gemini Code Assist від Google Cloud.
   */
  async getSubscription(): Promise<AntigravitySubscription> {
    const token = await this.getToken();

    try {
      const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (res.ok) {
        const data = (await res.json()) as {
          allowedTiers?: Array<{
            id: string;
            name: string;
            description: string;
            isDefault?: boolean;
            usesGcpTos?: boolean;
          }>;
          ineligibleTiers?: Array<{
            tierId: string;
            tierName: string;
            reasonCode: string;
            reasonMessage: string;
          }>;
          [key: string]: unknown;
        };

        const allowedTiers: SubscriptionTier[] = (data.allowedTiers || []).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          isDefault: !!t.isDefault,
          usesGcpTos: t.usesGcpTos
        }));

        const activeTier = allowedTiers.find((t) => t.isDefault) || allowedTiers[0] || null;

        return {
          hasActiveSubscription: allowedTiers.length > 0,
          activeTier,
          allowedTiers,
          ineligibleTiers: data.ineligibleTiers || [],
          raw: data
        };
      }
    } catch {
      // Ігноруємо помилки мережі
    }

    return {
      hasActiveSubscription: false,
      activeTier: null,
      allowedTiers: [],
      ineligibleTiers: [],
      raw: {}
    };
  }

  /**
   * Повертає актуальні дані про поточні Rate Limits.
   */
  getRateLimits(): RateLimitInfo {
    return { ...this.lastRateLimitInfo };
  }

  // ==========================================
  // 4. Для Web-серверів та бекендів (Next.js, Express, Fastify)
  // ==========================================

  getAuthUrl(options?: AuthUrlOptions): AuthUrlResult {
    return this.oauth.generateAuthUrl(options);
  }

  async exchangeCode(options: ExchangeCodeOptions): Promise<AntigravitySession> {
    const session = await this.oauth.exchangeCode(options);
    try {
      await this.localStore.writeSession(session);
    } catch {
      // Ігноруємо помилки файлової системи (для середовищ без доступу до FS, браузерів тощо)
    }
    this.cachedSession = session;
    this.addAccount(session);
    return session;
  }

  // ==========================================
  // 5. Для CLI та десктоп-додатків & Зміна акаунта
  // ==========================================

  /**
   * Швидка зміна акаунта: примушує Google відкрити вікно вибору облікового запису ("Виберіть акаунт").
   * Можна передати конкретний email через loginHint, щоб одразу підставити його.
   */
  async switchAccount(loginHint?: string): Promise<AntigravitySession> {
    console.log('🔄 Зміна облікового запису Antigravity...');
    return this.login({
      prompt: 'select_account',
      loginHint
    });
  }

  async login(options?: LoginInteractiveOptions): Promise<AntigravitySession> {
    const session = await this.oauth.loginInteractive(options);
    await this.localStore.writeSession(session);
    this.cachedSession = session;
    return session;
  }

  async refresh(): Promise<AntigravitySession> {
    const session = await this.getSession();
    if (!session.refreshToken) {
      throw new Error('Refresh token відсутній. Потрібно пройти повторну авторизацію.');
    }

    console.log('🔄 Подовження терміну дії токена через Google OAuth...');
    const refreshed = await this.oauth.refreshToken(session.refreshToken);

    session.accessToken = refreshed.accessToken;
    if (refreshed.refreshToken) session.refreshToken = refreshed.refreshToken;
    session.expiry = calculateExpiry(refreshed.expiresAt);

    await this.localStore.writeSession(session);
    this.cachedSession = session;
    return session;
  }

  async logout(): Promise<void> {
    if (this.cachedSession?.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.cachedSession.accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      } catch {
        // Ігноруємо помилки мережі
      }
    }

    this.cachedSession = null;
  }

  async sync(): Promise<AntigravitySession | null> {
    this.cachedSession = null;
    return this.localStore.readSession();
  }

  async getProjects(): Promise<Record<string, string>> {
    return this.localStore.getProjects();
  }

  async getInstallationId(): Promise<string | null> {
    return this.localStore.getInstallationId();
  }

  // ==========================================
  // 6. Розумний клієнт запитів & OpenAI Bridge Server
  // ==========================================

  /**
   * Запускає локальний OpenAI-сумісний HTTP сервер на вибраному порті (за замовчуванням 3000).
   * Дозволяє підключати офіційну бібліотеку `openai` (`new OpenAI({ baseURL, apiKey })`),
   * Cursor, Vercel AI SDK, LangChain або будь-які готові інструменти.
   */
  async serve(options?: ServerOptions) {
    return startOpenAIServer(this, options);
  }

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
}
