import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { AntigravitySession, AntigravityUser, ExpiryDetails } from './types.js';
import { decodeJwtPayload } from './utils/jwt.js';

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

export class LocalGeminiStore {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.join(os.homedir(), '.gemini');
  }

  get credsPath(): string {
    return path.join(this.baseDir, 'oauth_creds.json');
  }

  get accountsPath(): string {
    return path.join(this.baseDir, 'google_accounts.json');
  }

  get projectsPath(): string {
    return path.join(this.baseDir, 'projects.json');
  }

  get installationIdPath(): string {
    return path.join(this.baseDir, 'installation_id');
  }

  async getInstallationId(): Promise<string | null> {
    try {
      const content = await fs.readFile(this.installationIdPath, 'utf-8');
      return content.trim();
    } catch {
      return null;
    }
  }

  async getProjects(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.projectsPath, 'utf-8');
      const data = JSON.parse(content);
      return data.projects || {};
    } catch {
      return {};
    }
  }

  async readSession(): Promise<AntigravitySession | null> {
    try {
      const content = await fs.readFile(this.credsPath, 'utf-8');
      const creds = JSON.parse(content);

      const accessToken = creds.access_token || creds.token;
      if (!accessToken) return null;

      const refreshToken = creds.refresh_token;
      const idToken = creds.id_token;
      const expiryDate = creds.expiry_date || creds.expires_at || Date.now() + 3600 * 1000;
      const expiresAt = typeof expiryDate === 'number' ? expiryDate : Date.parse(expiryDate);
      const scopes = typeof creds.scope === 'string' ? creds.scope.split(' ') : [];

      // Extract basic user info from id_token if available
      const claims = decodeJwtPayload<{
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
        email_verified?: boolean;
      }>(idToken);

      let user: AntigravityUser = {
        id: claims?.sub || 'unknown',
        email: claims?.email || 'unknown',
        name: claims?.name,
        picture: claims?.picture,
        emailVerified: claims?.email_verified
      };

      const expiry = calculateExpiry(expiresAt);

      // Enrich user profile via Google OAuth userinfo API if token is valid and details are missing
      if (!expiry.isExpired && (!user.name || !user.picture)) {
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (res.ok) {
            const profile = (await res.json()) as {
              sub: string;
              name?: string;
              given_name?: string;
              family_name?: string;
              picture?: string;
              email?: string;
              locale?: string;
              email_verified?: boolean;
            };

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
          // Ignore network errors, fallback to local claims
        }
      }

      return {
        accessToken,
        refreshToken,
        idToken,
        tokenType: creds.token_type || 'Bearer',
        scopes,
        user,
        expiry,
        source: 'local_gemini',
        raw: creds
      };
    } catch {
      return null;
    }
  }

  async writeSession(session: AntigravitySession): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });

    const credsData = {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      id_token: session.idToken,
      expiry_date: session.expiry.expiresAt,
      token_type: session.tokenType,
      scope: session.scopes.join(' ')
    };

    await fs.writeFile(this.credsPath, JSON.stringify(credsData, null, 2), 'utf-8');

    if (session.user?.email) {
      const accountsData = {
        active: session.user.email,
        old: []
      };
      await fs.writeFile(this.accountsPath, JSON.stringify(accountsData, null, 2), 'utf-8');
    }
  }
}
