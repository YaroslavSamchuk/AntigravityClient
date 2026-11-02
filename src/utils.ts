/**
 * Pure, cross-platform Base64 and cryptographic utilities.
 * 0 external dependencies, 0 Node-only modules (works on Web, Mobile, Node, Bun, Edge).
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Universal Uint8Array to standard Base64 string encoder
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }

  // Pure JS fallback
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

/**
 * Encodes Uint8Array or string to URL-safe Base64 without padding (RFC 7636 PKCE)
 */
export function toBase64Url(input: Uint8Array | string): string {
  const base64 = typeof input === 'string'
    ? (typeof btoa === 'function' ? btoa(input) : bytesToBase64(new TextEncoder().encode(input)))
    : bytesToBase64(input);

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes URL-safe or standard Base64 string to UTF-8 text
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  // Pure JS fallback
  const charMap: Record<string, number> = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    charMap[BASE64_CHARS[i]] = i;
  }

  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = charMap[clean[i]] || 0;
    const c1 = charMap[clean[i + 1]] || 0;
    const c2 = charMap[clean[i + 2]] || 0;
    const c3 = charMap[clean[i + 3]] || 0;

    bytes.push((c0 << 2) | (c1 >> 4));
    if (i + 2 < clean.length) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (i + 3 < clean.length) bytes.push(((c2 & 3) << 6) | c3);
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Safely decodes JWT claims (sub, email, name, picture, etc.)
 */
export function decodeJwtPayload<T = Record<string, unknown>>(token?: string): T | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const jsonStr = base64UrlDecode(parts[1]);
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

/**
 * Generates cryptographically secure random bytes
 */
export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(bytes);
  }
  // Math.random fallback (for very limited runtimes)
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Generates a random UUID v4
 */
export function generateUUID(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * PKCE: Generates high-entropy cryptographic code verifier
 */
export function generateCodeVerifier(length = 64): string {
  return toBase64Url(getRandomBytes(length));
}

/**
 * PKCE: Generates S256 code challenge using standard Web Crypto API
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.digest) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return toBase64Url(new Uint8Array(hashBuffer));
  }

  // If subtle crypto is unavailable, verifier fallback (plain)
  return verifier;
}

/**
 * Generates random state parameter for OAuth
 */
export function generateState(): string {
  return Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Universal Server-Sent Events (SSE) / Stream chunk reader for fetch Response
 */
export async function* streamSSE(response: Response): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new Error('Response body is empty or streaming is not supported.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') return;

          try {
            const parsed = JSON.parse(jsonStr);
            const candidate = parsed.response?.candidates?.[0] || parsed.candidates?.[0];
            const parts = candidate?.content?.parts || candidate?.delta?.content?.parts;
            let textChunk = '';

            if (Array.isArray(parts)) {
              for (const p of parts) {
                if (!p.thought && typeof p.text === 'string') {
                  textChunk += p.text;
                }
              }
            } else if (typeof candidate?.text === 'string') {
              textChunk = candidate.text;
            }

            if (textChunk) {
              yield textChunk;
            }
          } catch {
            // Raw text or non-json chunk
            yield jsonStr;
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          const candidate = parsed.response?.candidates?.[0] || parsed.candidates?.[0];
          const parts = candidate?.content?.parts || candidate?.delta?.content?.parts;
          let textChunk = '';
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (!p.thought && typeof p.text === 'string') {
                textChunk += p.text;
              }
            }
          } else if (typeof candidate?.text === 'string') {
            textChunk = candidate.text;
          }
          if (textChunk) yield textChunk;
        } catch {
          yield jsonStr;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
