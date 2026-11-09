import type { ProxyServerInstance, ProxyServerOptions } from './types.js';

export const ANTIGRAVITY_PROXY_TARGET = 'https://daily-cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_PROXY_UA =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

/**
 * Universal Web Standards HTTP Handler (Vercel Edge, Next.js, Cloudflare, Bun, Deno, Node 18+).
 * Handles CORS and transparently injects Google Antigravity User-Agent.
 */
export async function handleProxyRequest(
  req: Request,
  options?: { targetUrl?: string }
): Promise<Response> {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': '*'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const targetBase = options?.targetUrl || ANTIGRAVITY_PROXY_TARGET;
  const targetUrl = new URL(`${targetBase}${url.pathname}${url.search}`);

  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.set('User-Agent', ANTIGRAVITY_PROXY_UA);
  forwardHeaders.delete('host');

  try {
    const upstreamRes = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
    });

    const responseHeaders = new Headers(upstreamRes.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      responseHeaders.set(k, v);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: { message: `Antigravity Proxy Error: ${err.message}` }
      }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Starts a built-in zero-dependency local proxy server using Node.js standard library.
 * Solves browser CORS and User-Agent restrictions with 1 line of code!
 */
export async function startProxyServer(
  options?: ProxyServerOptions
): Promise<ProxyServerInstance> {
  if (typeof window !== 'undefined') {
    throw new Error('startProxyServer can only run in Node.js, Bun or server environments.');
  }

  const http = await import('node:http');
  const https = await import('node:https');

  const port = options?.port || 3000;
  const host = options?.host || '0.0.0.0';
  const targetUrl = options?.targetUrl || ANTIGRAVITY_PROXY_TARGET;
  const target = new URL(targetUrl);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 1. CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 2. Health check endpoint
      if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: 'antigravity-proxy',
            target: target.origin
          })
        );
        return;
      }

      // 3. Forward request to Google Antigravity backend
      const headers = { ...req.headers };
      headers['user-agent'] = ANTIGRAVITY_PROXY_UA;
      headers['host'] = target.host;

      const proxyReq = https.request(
        {
          hostname: target.hostname,
          port: 443,
          path: req.url,
          method: req.method,
          headers
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, {
            ...proxyRes.headers,
            'access-control-allow-origin': '*'
          });
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: `Proxy connection error: ${err.message}` }
            })
          );
        }
      });

      req.pipe(proxyReq);
    });

    server.on('error', reject);

    server.listen(port, host, () => {
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      const url = `http://${displayHost}:${port}`;

      if (options?.verbose !== false) {
        console.log(`🌌 Antigravity Proxy Server running on ${url}`);
        console.log(`👉 In your React client use:`);
        console.log(`   const ag = new Antigravity({ serverUrl: '${url}' });\n`);
      }

      resolve({
        port,
        host,
        url,
        close: () =>
          new Promise<void>((closeResolve) => {
            server.close(() => closeResolve());
          })
      });
    });
  });
}
