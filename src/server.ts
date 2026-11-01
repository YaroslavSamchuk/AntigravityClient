import http from 'node:http';
import crypto from 'node:crypto';
import type { Antigravity } from './index.js';
import type { AntigravityModel, ChatMessage, ToolDefinition } from './types.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  apiKey?: string; // Опціональна перевірка ключа (якщо хочете захистити від інших)
}

export interface OpenAIRequestPayload {
  model?: AntigravityModel;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
}

/**
 * Creates and starts a lightweight, zero-dependency OpenAI-compatible HTTP server.
 * Allows using official OpenAI SDK (`import OpenAI from 'openai'`), LangChain,
 * Vercel AI SDK, Cursor, or any client expecting the OpenAI standard.
 */
export function startOpenAIServer(
  ag: Antigravity,
  options?: ServerOptions
): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  const port = options?.port || 3000;
  const host = options?.host || '127.0.0.1';

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // 1. CORS Headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${host}:${port}`);

      // 2. GET /v1/models
      if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
        const models = ag.getAvailableModels().map((id) => ({
          id,
          object: 'model',
          created: 1700000000,
          owned_by: 'antigravity'
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: models }));
        return;
      }

      // 3. POST /v1/chat/completions
      if (
        req.method === 'POST' &&
        (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions')
      ) {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as OpenAIRequestPayload;
            const model = payload.model || ag.defaultModel;
            const rawMessages = (payload.messages || []) as any[];
            const messages: ChatMessage[] = rawMessages.map((m) => {
              if (m.role === 'tool') {
                return {
                  role: 'tool',
                  name: m.name,
                  tool_call_id: m.tool_call_id,
                  content: m.content
                };
              }
              if (m.role === 'assistant' && !m.content && m.tool_calls) {
                return {
                  role: 'assistant',
                  tool_calls: m.tool_calls,
                  reasoning_content: m.reasoning_content,
                  content: null
                };
              }
              return {
                role: m.role || 'user',
                content: m.content,
                reasoning_content: m.reasoning_content
              };
            });

            const id = `chatcmpl-${crypto.randomUUID()}`;
            const created = Math.floor(Date.now() / 1000);

            // Режим стрімінгу SSE (Server-Sent Events)
            if (payload.stream) {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
              });

              for await (const chunk of ag.streamChat({
                model,
                messages,
                tools: payload.tools,
                temperature: payload.temperature,
                topP: payload.top_p
              })) {
                const sseChunk = {
                  id,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: chunk },
                      finish_reason: null
                    }
                  ]
                };
                res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
              }

              // Сигнал закінчення стріму
              const doneChunk = {
                id,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
              };
              res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }

            // Стандартна відповідь (Non-streaming)
            const chatRes = await ag.chat({
              model,
              messages,
              tools: payload.tools,
              temperature: payload.temperature,
              topP: payload.top_p
            });

            const toolCalls = chatRes.toolCalls;
            const messageContent = toolCalls ? null : chatRes.text;

            const openAIResponse = {
              id,
              object: 'chat.completion',
              created,
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: messageContent,
                    ...(toolCalls ? { tool_calls: toolCalls } : {})
                  },
                  finish_reason: chatRes.finishReason || (toolCalls ? 'tool_calls' : 'stop')
                }
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
              }
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(openAIResponse));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: {
                  message: (err as Error).message,
                  type: 'internal_server_error'
                }
              })
            );
          }
        });
        return;
      }

      // 4. Головна сторінка-підказка
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <body style="font-family: system-ui, sans-serif; padding: 40px; line-height: 1.6; max-width: 600px; margin: 0 auto;">
            <h2>🌌 Antigravity OpenAI Bridge Online</h2>
            <p>Ендпоінт сумісний з офіційним OpenAI SDK:</p>
            <code>baseURL: http://${host}:${port}/v1</code><br>
            <code>apiKey: any-string</code>
          </body>
        </html>
      `);
    });

    server.on('error', reject);

    server.listen(port, host, () => {
      const serverUrl = `http://${host}:${port}/v1`;
      resolve({
        server,
        url: serverUrl,
        close: () => new Promise<void>((r) => server.close(() => r()))
      });
    });
  });
}
