import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { AntigravityModel, ChatOptions, ChatResponse, MessageContent, ToolCall } from './types.js';

export const AVAILABLE_MODELS: AntigravityModel[] = [
  'gemini-3.8-flash-high',
  'Claude Sonnet 4.6 (Thinking)',
  'Claude Opus 4.6 (Thinking)',
  'gemini-3.8-flash-medium',
  'gemini-3.8-flash-low',
  'GPT-OSS 120B (Medium)'
];

export function resolveAgyBinary(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const isWindows = os.platform() === 'win32';
  const binaryName = isWindows ? 'agy.exe' : 'agy';
  const defaultGeminiPath = path.join(os.homedir(), '.gemini', 'bin', binaryName);

  if (fs.existsSync(defaultGeminiPath)) {
    return defaultGeminiPath;
  }

  return binaryName;
}

/**
 * Extracts plain text and handles multimodal parts (text, image_url, etc.)
 * from standard OpenAI-compatible MessageContent.
 */
export function extractContentText(content?: MessageContent | null): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part === 'object') {
          if ('text' in part && typeof part.text === 'string') {
            return part.text;
          }
          if ('image_url' in part && part.image_url && typeof part.image_url.url === 'string') {
            return `[Attached Image URL: ${part.image_url.url}]`;
          }
          if ('image' in part && typeof part.image === 'string') {
            return `[Attached Image: ${part.image}]`;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content);
}

/**
 * Transforms ChatOptions (whether given as string prompt or array of messages)
 * into a single unified prompt payload for Antigravity engine.
 */
export function formatMessagesToPrompt(options: ChatOptions): string {
  let promptText = options.prompt || '';
  const messages = options.messages || [];

  if (!promptText && messages.length === 0) {
    throw new Error('Необхідно надати або prompt (рядок), або messages (масив повідомлень).');
  }

  let systemPrompt = options.system || '';
  const historyParts: string[] = [];
  let lastUserMessage = '';

  // 1. Інструкції щодо доступних інструментів (tools)
  if (options.tools && options.tools.length > 0) {
    const toolsDesc = options.tools
      .map((t) => {
        const fn = t.function || t;
        const name = fn.name || t.name || 'unnamed_tool';
        const desc = fn.description || t.description || 'No description';
        const params = fn.parameters || t.parameters || {};
        return `- ${name}: ${desc}\n  Parameters schema: ${JSON.stringify(params)}`;
      })
      .join('\n');

    const allowParallel = options.parallel_tool_calls !== false && options.parallelToolCalls !== false;

    let toolSection = `[Available Tools/Functions]\nYou have access to the following functions:\n${toolsDesc}\n\nTo call functions, respond ONLY with a valid JSON object in this format:\n{"tool_calls": [{"name": "<function_name>", "arguments": { ... }}, ...]}\nOr if calling a single function:\n{"tool_call": {"name": "<function_name>", "arguments": { ... }}}\n${allowParallel ? 'You can call multiple tools simultaneously in parallel when helpful.' : 'Call only one tool at a time (parallel tool calling disabled).'}\nDo not add commentary or markdown around the JSON when calling tools.`;

    if (options.toolChoice) {
      if (options.toolChoice === 'required') {
        toolSection += '\nYou MUST call at least one of the available functions.';
      } else if (options.toolChoice === 'none') {
        toolSection += '\nDo NOT call any function, answer directly in plain text.';
      } else if (typeof options.toolChoice === 'object') {
        const targetName = options.toolChoice.function?.name;
        if (targetName) {
          toolSection += `\nYou MUST call the function "${targetName}".`;
        }
      }
    }

    systemPrompt += (systemPrompt ? '\n\n' : '') + toolSection;
  }

  // 2. Налаштування генерації (temperature, topP)
  if (options.temperature !== undefined || options.topP !== undefined) {
    const genDirectives: string[] = [];
    if (options.temperature !== undefined) {
      if (options.temperature <= 0.2) {
        genDirectives.push('Be highly deterministic, analytical, strictly factual and concise.');
      } else if (options.temperature >= 0.8) {
        genDirectives.push('Be creative, expansive, and offer diverse perspectives.');
      }
    }
    if (options.topP !== undefined && options.topP < 0.5) {
      genDirectives.push('Focus only on high-probability, canonical answers.');
    }
    if (genDirectives.length > 0) {
      systemPrompt += (systemPrompt ? '\n\n' : '') + `[Style Directives]\n${genDirectives.join('\n')}`;
    }
  }

  // 3. Обробка історії повідомлень
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgText = extractContentText(msg.content);

    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msgText;
    } else if (msg.role === 'tool') {
      historyParts.push(`Tool Output [${msg.name || msg.tool_call_id || 'function'}]: ${msgText}`);
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls && (!msgText || msgText.trim() === '')) {
        const callsStr = msg.tool_calls.map((c) => `${c.function.name}(${c.function.arguments})`).join(', ');
        historyParts.push(`Assistant: [Invoking Tool: ${callsStr}]`);
      } else {
        let assistantMsg = `Assistant: ${msgText}`;
        if (msg.reasoning_content) {
          assistantMsg = `Assistant [Reasoning: ${msg.reasoning_content}]\n${msgText}`;
        }
        historyParts.push(assistantMsg);
      }
    } else if (i === messages.length - 1 && msg.role === 'user' && !promptText) {
      lastUserMessage = msgText;
    } else {
      historyParts.push(`User: ${msgText}`);
    }
  }

  let finalPrompt = '';
  if (systemPrompt) {
    finalPrompt += `[System Instructions]\n${systemPrompt}\n\n`;
  }

  if (historyParts.length > 0) {
    finalPrompt += `[Conversation History]\n${historyParts.join('\n')}\n\n`;
  }

  if (lastUserMessage) {
    finalPrompt += `User: ${lastUserMessage}`;
  } else if (promptText) {
    finalPrompt += `User: ${promptText}`;
  }

  return finalPrompt.trim();
}

/**
 * Parses single or multiple tool calls from model output.
 * Handles:
 * - {"tool_calls": [{"name": "...", "arguments": {...}}, ...]}
 * - [{"tool_call": ...}, ...]
 * - {"tool_call": {"name": "...", "arguments": {...}}}
 * - Markdown fences (```json ... ```)
 */
export function parseToolCalls(text: string): ToolCall[] | undefined {
  if (!text || (!text.includes('tool_call') && !text.includes('tool_calls'))) {
    return undefined;
  }

  const calls: ToolCall[] = [];

  try {
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();

    // 1. Пошук прямого JSON об'єкта або масиву
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Випадок: {"tool_calls": [...]}
      if (parsed && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        for (const item of parsed.tool_calls) {
          const fn = item.function || item;
          if (fn && fn.name) {
            calls.push({
              id: item.id || `call_${crypto.randomUUID().slice(0, 8)}`,
              type: 'function',
              function: {
                name: fn.name,
                arguments:
                  typeof fn.arguments === 'string'
                    ? fn.arguments
                    : JSON.stringify(fn.arguments || {})
              }
            });
          }
        }
        if (calls.length > 0) return calls;
      }

      // Випадок: масив об'єктів [{"tool_call": ...}, {"tool_call": ...}]
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const tc = item.tool_call || item;
          const fn = tc.function || tc;
          if (fn && fn.name) {
            calls.push({
              id: item.id || tc.id || `call_${crypto.randomUUID().slice(0, 8)}`,
              type: 'function',
              function: {
                name: fn.name,
                arguments:
                  typeof fn.arguments === 'string'
                    ? fn.arguments
                    : JSON.stringify(fn.arguments || {})
              }
            });
          }
        }
        if (calls.length > 0) return calls;
      }

      // Випадок: одиночний {"tool_call": { name, arguments }}
      if (parsed && parsed.tool_call && parsed.tool_call.name) {
        calls.push({
          id: `call_${crypto.randomUUID().slice(0, 8)}`,
          type: 'function',
          function: {
            name: parsed.tool_call.name,
            arguments:
              typeof parsed.tool_call.arguments === 'string'
                ? parsed.tool_call.arguments
                : JSON.stringify(parsed.tool_call.arguments || {})
          }
        });
        return calls;
      }
    }
  } catch {
    // Якщо прямий парсинг не вдався, пробуємо regex нижче
  }

  // 2. Fallback: пошук окремих входжень tool_call
  const regex = /"tool_call"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\}|"[^"]*")[\s\S]*?\}/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    try {
      const blockStr = `{${m[0]}}`;
      const parsedBlock = JSON.parse(blockStr);
      if (parsedBlock.tool_call && parsedBlock.tool_call.name) {
        calls.push({
          id: `call_${crypto.randomUUID().slice(0, 8)}`,
          type: 'function',
          function: {
            name: parsedBlock.tool_call.name,
            arguments:
              typeof parsedBlock.tool_call.arguments === 'string'
                ? parsedBlock.tool_call.arguments
                : JSON.stringify(parsedBlock.tool_call.arguments || {})
          }
        });
      }
    } catch {}
  }

  return calls.length > 0 ? calls : undefined;
}

export function executeChat(
  binaryPath: string,
  options: ChatOptions
): Promise<ChatResponse> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const model = options.model || 'gemini-3.8-flash-high';
    const formattedPrompt = formatMessagesToPrompt(options);

    const args = ['--model', model, '--disable-slash-commands', '--dangerously-skip-permissions'];

    // --effort підтримується для моделей Gemini / GPT, але не для Claude
    if (options.effort && !model.toLowerCase().includes('claude')) {
      args.push('--effort', options.effort);
    }

    const schema =
      options.jsonSchema ||
      (options.response_format?.type === 'json_schema'
        ? options.response_format.json_schema?.schema
        : options.response_format?.type === 'json_object'
        ? { type: 'object' }
        : undefined);

    if (schema) {
      const schemaStr = typeof schema === 'string' ? schema : JSON.stringify(schema);
      args.push('--output-format', 'json');
      args.push('--json-schema', schemaStr);
    }

    args.push('--print', formattedPrompt);

    const child = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdoutData += text;
      if (options.onChunk) {
        options.onChunk(text);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      reject(new Error(`Не вдалося запустити Antigravity engine (${binaryPath}): ${err.message}`));
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      if (code !== 0) {
        reject(
          new Error(
            `Помилка генерації Antigravity [code ${code}]: ${stderrData.trim() || 'Unknown error'}`
          )
        );
        return;
      }

      let outputText = stdoutData.trim();
      let structuredData: any = undefined;
      let usage: any = undefined;

      // Якщо передавалася схема або рушій повернув JSON обгортку
      if (schema || (outputText.startsWith('{') && outputText.includes('"response"'))) {
        try {
          const parsed = JSON.parse(outputText);
          if (parsed.structured_output !== undefined) {
            structuredData = parsed.structured_output;
            outputText =
              typeof parsed.response === 'string'
                ? parsed.response.trim()
                : JSON.stringify(parsed.structured_output);
          } else if (parsed.response) {
            outputText = parsed.response.trim();
          }
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.input_tokens || 0,
              completionTokens: parsed.usage.output_tokens || 0,
              thinkingTokens: parsed.usage.thinking_tokens,
              totalTokens: parsed.usage.total_tokens || 0
            };
          }
        } catch {}
      }

      if (structuredData === undefined && schema) {
        try {
          structuredData = JSON.parse(outputText);
        } catch {}
      }

      const toolCalls = parseToolCalls(outputText);
      const finishReason: 'stop' | 'tool_calls' =
        toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop';

      resolve({
        text: outputText,
        data: structuredData,
        model,
        durationMs,
        toolCalls,
        finishReason,
        usage
      });
    });

    if (options.timeoutMs) {
      setTimeout(() => {
        child.kill();
        reject(new Error(`Час генерації вичерпано (${options.timeoutMs}ms)`));
      }, options.timeoutMs);
    }
  });
}

export async function* executeStreamChat(
  binaryPath: string,
  options: ChatOptions
): AsyncGenerator<string, void, unknown> {
  const model = options.model || 'gemini-3.8-flash-high';
  const formattedPrompt = formatMessagesToPrompt(options);

  const args = ['--model', model, '--disable-slash-commands', '--dangerously-skip-permissions'];
  if (options.effort && !model.toLowerCase().includes('claude')) {
    args.push('--effort', options.effort);
  }
  if (options.jsonSchema) {
    const schemaStr =
      typeof options.jsonSchema === 'string'
        ? options.jsonSchema
        : JSON.stringify(options.jsonSchema);
    args.push('--json-schema', schemaStr);
  }
  args.push('--print', formattedPrompt);

  const child = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const queue: string[] = [];
  let isDone = false;
  let error: Error | null = null;
  let notify: (() => void) | null = null;

  child.stdout.on('data', (chunk: Buffer) => {
    queue.push(chunk.toString('utf-8'));
    if (notify) {
      notify();
      notify = null;
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    // Non-fatal stderr logging
  });

  child.on('error', (err) => {
    error = err;
    if (notify) {
      notify();
      notify = null;
    }
  });

  child.on('close', (code) => {
    isDone = true;
    if (code !== 0 && !error) {
      error = new Error(`Antigravity process exited with code ${code}`);
    }
    if (notify) {
      notify();
      notify = null;
    }
  });

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else if (isDone) {
      if (error) throw error;
      break;
    } else {
      await new Promise<void>((r) => {
        notify = r;
      });
    }
  }
}

/**
 * Pure HTTP inference with Google Gemini REST API.
 * Uses zero binary, zero child_process - 100% portable for Mobile (React Native, iOS, Android),
 * Web Browsers (React, Vue, Vite), and Serverless/Edge (Vercel, Cloudflare, AWS).
 */
export async function executeChatHttp(
  token: string,
  options: ChatOptions
): Promise<ChatResponse> {
  const startTime = Date.now();
  let model = options.model || 'gemini-2.0-flash';
  if (model.includes('gemini-3.8-flash')) {
    model = 'gemini-2.0-flash';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const contents: Array<{ role: string; parts: any[] }> = [];
  if (options.messages && options.messages.length > 0) {
    for (const msg of options.messages) {
      if (msg.role === 'system') continue;
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: extractContentText(msg.content) }]
      });
    }
  } else if (options.prompt) {
    contents.push({
      role: 'user',
      parts: [{ text: options.prompt }]
    });
  }

  const systemInstruction = options.system
    ? { parts: [{ text: options.system }] }
    : undefined;

  const body: Record<string, any> = {
    contents,
    generationConfig: {}
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  if (options.temperature !== undefined) {
    body.generationConfig.temperature = options.temperature;
  }
  if (options.topP !== undefined) {
    body.generationConfig.topP = options.topP;
  }
  if (options.maxTokens !== undefined) {
    body.generationConfig.maxOutputTokens = options.maxTokens;
  }

  if (options.jsonSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    if (typeof options.jsonSchema === 'object') {
      body.generationConfig.responseSchema = options.jsonSchema;
    }
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: options.tools.map((t) => {
          const fn = t.function || t;
          return {
            name: fn.name || t.name,
            description: fn.description || t.description,
            parameters: fn.parameters || t.parameters
          };
        })
      }
    ];
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Gemini API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  let text = '';
  const toolCalls: ToolCall[] = [];

  for (const p of parts) {
    if (p.text) text += p.text;
    if (p.functionCall) {
      toolCalls.push({
        id: `call_${crypto.randomUUID().slice(0, 8)}`,
        type: 'function',
        function: {
          name: p.functionCall.name,
          arguments:
            typeof p.functionCall.args === 'string'
              ? p.functionCall.args
              : JSON.stringify(p.functionCall.args || {})
        }
      });
    }
  }

  let structuredData: any;
  if (options.jsonSchema) {
    try {
      structuredData = JSON.parse(text);
    } catch {}
  }

  const promptTokens = data.usageMetadata?.promptTokenCount || 0;
  const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;

  return {
    text: text.trim(),
    data: structuredData,
    model,
    durationMs: Date.now() - startTime,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    }
  };
}
