import crypto from 'node:crypto';

export function generateCodeVerifier(length = 64): string {
  return crypto.randomBytes(length).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}
