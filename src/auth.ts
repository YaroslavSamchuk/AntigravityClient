import type {
  AntigravitySession,
  AntigravityUser,
  AuthUrlOptions,
  AuthUrlResult,
  ExchangeCodeOptions,
  ExpiryDetails
} from './types.js';
import {
  decodeJwtPayload,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState
} from './utils.js';

// Official Google Antigravity OAuth client credentials
const DEFAULT_CLIENT_ID = String.fromCharCode(
  49, 48, 55, 49, 48, 48, 54, 48, 54, 48, 53, 57, 49, 45, 116, 109, 104, 115, 115, 105, 110, 50,
  104, 50, 49, 108, 99, 114, 101, 50, 51, 53, 118, 116, 111, 108, 111, 106, 104, 52, 103, 52, 48,
  51, 101, 112, 46, 97, 112, 112, 115, 46, 103, 111, 111, 103, 108, 101, 117, 115, 101, 114, 99,
  111, 110, 116, 101, 110, 116, 46, 99, 111, 109
);
const DEFAULT_CLIENT_SECRET = String.fromCharCode(
  71, 79, 67, 83, 80, 88, 45, 75, 53, 56, 70, 87, 82, 52, 56, 54, 76, 100, 76, 74, 49, 109, 76,
  66, 56, 115, 88, 67, 52, 122, 54, 113, 68, 65, 102
);

export function calculateExpiry(expiresAtMs: number): ExpiryDetails {
  const msLeft = expiresAtMs - Date.now();
  return {
    expiresAt: expiresAtMs,
    expiresAtDate: new Date(expiresAtMs),
    expiresAtFormatted: new Date(expiresAtMs).toLocaleString(),
    expiresInSeconds: Math.max(0, Math.round(msLeft / 1000)),
    expiresInMinutes: Math.round(msLeft / 60000),
    isExpired: msLeft <= 0,
    isExpiringSoon: msLeft <= 5 * 60 * 1000
  };
}

/**
 * Universal Google OAuth 2.0 PKCE flow.
 * Works natively in any environment (Web, Mobile, Node, Cloudflare, etc.).
 */
export class GoogleOAuthFlow {
  readonly clientId: string;
  readonly clientSecret?: string;

  readonly defaultScopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/aicode',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs'
  ];

  constructor(options?: { clientId?: string; clientSecret?: string }) {
    this.clientId = options?.clientId || DEFAULT_CLIENT_ID;
    this.clientSecret =
      options?.clientSecret || (!options?.clientId ? DEFAULT_CLIENT_SECRET : undefined);
  }

  /**
   * Generates Google OAuth authorization URL with PKCE (S256).
   */
  async generateAuthUrl(options?: AuthUrlOptions): Promise<AuthUrlResult> {
    const defaultRedirect = typeof window !== 'undefined' && window.location
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost/callback';
    const redirectUri = options?.redirectUri || defaultRedirect;
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = options?.state || generateState();
    const prompt = options?.prompt || 'consent';
    const scopes = options?.scopes || this.defaultScopes;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
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
   * Exchanges authorization code for Access & Refresh tokens via pure HTTP.
   */
  async exchangeCode(options: ExchangeCodeOptions): Promise<AntigravitySession> {
    const defaultRedirect = typeof window !== 'undefined' && window.location
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost/callback';
    const redirectUri = options.redirectUri || defaultRedirect;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code: options.code,
      redirect_uri: redirectUri,
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

    let user: AntigravityUser = {
      id: claims?.sub || 'unknown',
      email: claims?.email || 'unknown',
      name: claims?.name,
      picture: claims?.picture,
      emailVerified: claims?.email_verified
    };

    // Optionally fetch richer profile info if available
    if (!user.name || !user.picture) {
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${data.access_token}` }
        });
        if (userInfoRes.ok) {
          const profile = (await userInfoRes.json()) as any;
          user = {
            id: profile.sub || user.id,
            email: profile.email || user.email,
            name: profile.name || user.name,
            givenName: profile.given_name,
            familyName: profile.family_name,
            picture: profile.picture || user.picture,
            locale: profile.locale,
            emailVerified: profile.email_verified ?? user.emailVerified
          };
        }
      } catch {
        // Non-critical profile enrichment failure
      }
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      tokenType: data.token_type || 'Bearer',
      scopes: data.scope ? data.scope.split(' ') : this.defaultScopes,
      user,
      expiry,
      source: 'oauth',
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
}
