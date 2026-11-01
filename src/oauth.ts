import type {
  AntigravitySession,
  AntigravityUser,
  AuthUrlOptions,
  AuthUrlResult,
  ExchangeCodeOptions,
  LoginInteractiveOptions
} from './types.js';
import { calculateExpiry } from './local.js';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './utils/pkce.js';
import { listenForOAuthCallback } from './utils/loopback.js';
import { openBrowser } from './utils/browser.js';
import { decodeJwtPayload } from './utils/jwt.js';

export class GoogleOAuthFlow {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly defaultPort: number;

  readonly scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cloud-platform'
  ];

  constructor(options?: { clientId?: string; clientSecret?: string; port?: number }) {
    this.clientId =
      options?.clientId ||
      '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
    this.clientSecret = options?.clientSecret;
    this.defaultPort = options?.port || 4321;
  }

  /**
   * Generates authorization URL, state, and PKCE verifier without launching anything.
   * Supports prompt='select_account' to force Google account chooser screen.
   */
  generateAuthUrl(options?: AuthUrlOptions): AuthUrlResult {
    const redirectUri = options?.redirectUri || `http://localhost:${this.defaultPort}/callback`;
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = options?.state || generateState();
    const prompt = options?.prompt || 'consent';

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', this.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', prompt);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    if (options?.loginHint) {
      authUrl.searchParams.set('login_hint', options.loginHint);
    }

    return {
      url: authUrl.toString(),
      state,
      codeVerifier: verifier,
      redirectUri
    };
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  async exchangeCode(options: ExchangeCodeOptions): Promise<AntigravitySession> {
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code: options.code,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier
    });

    if (this.clientSecret) {
      bodyParams.set('client_secret', this.clientSecret);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Google OAuth exchange failed (${tokenRes.status}): ${err}`);
    }

    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    const expiresAt = Date.now() + expiresInSec * 1000;
    const expiry = calculateExpiry(expiresAt);

    const claims = decodeJwtPayload<{
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    }>(data.id_token);

    const user: AntigravityUser = {
      id: claims?.sub || 'unknown',
      email: claims?.email || 'unknown',
      name: claims?.name,
      picture: claims?.picture,
      emailVerified: claims?.email_verified
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      tokenType: data.token_type || 'Bearer',
      scopes: data.scope ? data.scope.split(' ') : this.scopes,
      user,
      expiry,
      source: 'oauth_browser',
      raw: data
    };
  }

  /**
   * Refreshes an expired access token using a refresh token.
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    tokenType: string;
  }> {
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken
    });

    if (this.clientSecret) {
      bodyParams.set('client_secret', this.clientSecret);
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google OAuth refresh failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + expiresInSec * 1000,
      tokenType: data.token_type || 'Bearer'
    };
  }

  /**
   * High-level helper for CLI and desktop apps: opens browser and listens on localhost.
   */
  async loginInteractive(options?: LoginInteractiveOptions): Promise<AntigravitySession> {
    const port = options?.port || this.defaultPort;
    const authUrlData = this.generateAuthUrl({
      redirectUri: `http://localhost:${port}/callback`,
      prompt: options?.prompt || 'consent',
      loginHint: options?.loginHint
    });

    console.log(`\n🌌 Вхід в Google Antigravity...`);
    console.log(`📡 Очікування авторизації на ${authUrlData.redirectUri}`);

    const shouldOpen = options?.autoOpenBrowser ?? true;
    if (shouldOpen) {
      openBrowser(authUrlData.url);
    } else {
      console.log(`\nБудь ласка, відкрийте це посилання:\n${authUrlData.url}\n`);
    }

    const { code } = await listenForOAuthCallback(port, options?.timeoutMs);

    console.log(`📥 Код отримано! Завершення налаштування сесії...`);

    return this.exchangeCode({
      code,
      codeVerifier: authUrlData.codeVerifier,
      redirectUri: authUrlData.redirectUri
    });
  }
}
