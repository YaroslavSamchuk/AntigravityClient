import http from 'node:http';

export interface CallbackResult {
  code: string;
  state?: string;
}

export function listenForOAuthCallback(
  port: number,
  timeoutMs = 120000
): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    let timeoutTimer: NodeJS.Timeout | null = null;

    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://localhost:${port}`);
        const code = reqUrl.searchParams.get('code');
        const state = reqUrl.searchParams.get('state') || undefined;
        const error = reqUrl.searchParams.get('error');
        const errorDesc = reqUrl.searchParams.get('error_description');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fff1f0; margin: 0;">
                <div style="background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center;">
                  <h2 style="color: #cf1322;">❌ Помилка авторизації</h2>
                  <p style="color: #434343;">${errorDesc || error}</p>
                </div>
              </body>
            </html>
          `);
          cleanup();
          reject(new Error(`OAuth Error: ${error} - ${errorDesc || ''}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f6ffed; margin: 0;">
                <div style="background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center;">
                  <h2 style="color: #389e0d;">✅ Авторизація успішна!</h2>
                  <p style="color: #434343;">Ви можете закрити цю вкладку та повернутися до свого терміналу.</p>
                </div>
              </body>
            </html>
          `);
          cleanup();
          resolve({ code, state });
          return;
        }

        // If something else hits the server
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      server.close();
    };

    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error(`Час очікування авторизації вичерпано (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });

    server.listen(port, '127.0.0.1');
  });
}
