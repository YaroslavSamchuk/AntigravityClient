/**
 * Zero-dependency JWT payload decoder.
 * Safely extracts claims (email, name, picture, sub, etc.) from standard JWT / ID tokens.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(token?: string): T | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    const payloadBase64 = parts[1];
    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}
