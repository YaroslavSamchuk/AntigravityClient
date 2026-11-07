/**
 * Vercel Edge Proxy for Antigravity Client
 * 
 * Place this file in your project at `api/v1internal.ts`
 * This solves the browser User-Agent restriction with 0 server maintenance!
 */

export const config = {
  runtime: 'edge'
};

const ANTIGRAVITY_USER_AGENT =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // 1. Forward request to official Google Antigravity backend
  const targetUrl = new URL(`https://daily-cloudcode-pa.googleapis.com${url.pathname}${url.search}`);

  const headers = new Headers(req.headers);
  headers.set('User-Agent', ANTIGRAVITY_USER_AGENT);
  headers.delete('host');

  // 2. Fetch and stream response directly back to the browser
  const response = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
}
