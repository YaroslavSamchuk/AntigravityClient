import type {
  AntigravityModel,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  MessageContent,
  ToolCall
} from './types.js';
import { generateUUID, streamSSE } from './utils.js';

export const AVAILABLE_MODELS: AntigravityModel[] = [
  'gemini-3.8-flash-high',
  'gemini-3.8-flash-medium',
  'gemini-3.8-flash-low',
  'claude-sonnet-4-6',
  'claude-opus-4-6-thinking',
  'gpt-oss-120b-medium',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
];

/**
 * Normalizes user-specified model to standard Antigravity model identifier.
 */
export function normalizeModel(model?: string): string {
  if (!model) return 'gemini-3.8-flash-high';
  return model;
}

/**
 * Extracts plain text from standard OpenAI-compatible MessageContent.
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
          if ('image_url' in part && part.image_url?.url) {
            return `[Image URL: ${part.image_url.url}]`;
          }
          if ('image' in part && typeof part.image === 'string') {
            return `[Image Data]`;
          }
          if ('file' in part || part.type === 'file') {
            return `[File Data]`;
          }
          if ('document' in part || part.type === 'document') {
            return `[Document Data]`;
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
 * Formats ChatMessages or string prompt into Google Antigravity backend request structure.
 */
export function buildAntigravityPayload(options: ChatOptions): Record<string, any> {
  const contents: Array<{ role: string; parts: any[] }> = [];

  if (options.messages && options.messages.length > 0) {
    for (const msg of options.messages) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'assistant' || (msg.role as string) === 'model' ? 'model' : 'user';
      const parts: any[] = [];

      // Multimodal parts handling (OpenAI / Anthropic / Antigravity format)
      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (!item) continue;
          if (typeof item === 'string') {
            parts.push({ text: item });
          } else if (typeof item === 'object') {
            // Already Google-formatted Part
            if ('inline_data' in item || 'inlineData' in item) {
              parts.push(item);
              continue;
            }

            // 1. OpenAI / standard text part: { type: 'text', text: '...' }
            if ('text' in item && typeof item.text === 'string') {
              parts.push({ text: item.text });
            }
            // 2. OpenAI image_url part: { type: 'image_url', image_url: { url: 'data:image/...;base64,...' } }
            else if ('image_url' in item && item.image_url?.url) {
              const url = item.image_url.url;
              if (url.startsWith('data:')) {
                const match = url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  parts.push({
                    inline_data: {
                      mime_type: match[1],
                      data: match[2]
                    }
                  });
                  continue;
                }
              }
              parts.push({ text: `[Image: ${url}]` });
            }
            // 3. Direct image part: { type: 'image', image: '...', mimeType: '...' }
            else if ('image' in item && typeof item.image === 'string') {
              const cleanData = item.image.replace(/^data:[^;]+;base64,/, '');
              parts.push({
                inline_data: {
                  mime_type: item.mimeType || 'image/jpeg',
                  data: cleanData
                }
              });
            }
            // 4. Anthropic document part: { type: 'document', source: { data: '...', media_type: '...' } }
            else if ('source' in item && item.source?.data) {
              const mime = item.source.media_type || item.source.mimeType || 'application/pdf';
              parts.push({
                inline_data: {
                  mime_type: mime,
                  data: item.source.data
                }
              });
            }
            // 5. Generic file part (PDF, documents, audio, video): { type: 'file', file?: { data/url }, data?: '...' }
            else if (item.type === 'file' || 'file' in item) {
              const fileObj = item.file || item;
              const fileData = fileObj.data || fileObj.url || '';
              if (typeof fileData === 'string' && fileData.startsWith('data:')) {
                const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  parts.push({
                    inline_data: {
                      mime_type: match[1],
                      data: match[2]
                    }
                  });
                  continue;
                }
              }
              const mime = fileObj.mimeType || fileObj.mime_type || 'application/pdf';
              const cleanData = typeof fileData === 'string' ? fileData.replace(/^data:[^;]+;base64,/, '') : '';
              if (cleanData) {
                parts.push({
                  inline_data: {
                    mime_type: mime,
                    data: cleanData
                  }
                });
              }
            }
          }
        }
      } else if (msg.content) {
        parts.push({ text: extractContentText(msg.content) });
      }

      // Assistant tool calls history
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let args = {};
          try {
            args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
          } catch {}
          parts.push({
            functionCall: {
              name: tc.function.name,
              args
            }
          });
        }
      }

      // Tool responses history
      if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name || msg.tool_call_id || 'tool',
                response: {
                  content: extractContentText(msg.content)
                }
              }
            }
          ]
        });
        continue;
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }
  } else if (options.prompt) {
    contents.push({
      role: 'user',
      parts: [{ text: options.prompt }]
    });
  }

  // System instruction extraction (from options.system or messages with role: 'system')
  let systemText = options.system || '';
  if (options.messages) {
    const sysMsgs = options.messages
      .filter((m) => m.role === 'system')
      .map((m) => extractContentText(m.content))
      .filter(Boolean);
    if (sysMsgs.length > 0) {
      systemText = (systemText ? systemText + '\n' : '') + sysMsgs.join('\n');
    }
  }

  const generationConfig: Record<string, any> = {
    maxOutputTokens: options.maxTokens || 65536
  };
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  if (options.topP !== undefined) generationConfig.topP = options.topP;
  if (options.topK !== undefined) generationConfig.topK = options.topK;

  if (options.thinkingConfig) {
    generationConfig.thinkingConfig = options.thinkingConfig;
  } else if (options.effort) {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: options.effort === 'low' ? 'LOW' : 'HIGH'
    };
  } else {
    generationConfig.thinkingConfig = {
      includeThoughts: true
    };
  }

  // JSON / Structured Outputs
  const schema =
    options.jsonSchema ||
    (options.response_format?.type === 'json_schema'
      ? options.response_format.json_schema?.schema
      : options.response_format?.type === 'json_object'
      ? { type: 'object' }
      : undefined);

  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    if (typeof schema === 'object') {
      generationConfig.responseSchema = schema;
    }
  }

  const innerRequest: Record<string, any> = {
    contents,
    generationConfig
  };

  if (systemText) {
    innerRequest.systemInstruction = {
      role: 'user',
      parts: [{ text: systemText }]
    };
  }

  // Tools definition
  if (options.tools && options.tools.length > 0) {
    innerRequest.tools = [
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

  const model = normalizeModel(options.model);

  return {
    project: options.project || 'aicode-consumers',
    requestId: options.requestId || `agent/${Date.now()}/${generateUUID()}`,
    model,
    request: innerRequest,
    userAgent: 'antigravity',
    requestType: 'agent',
    enabledCreditTypes: ['GOOGLE_ONE_AI']
  };
}

export const buildGeminiPayload = buildAntigravityPayload;

export const ANTIGRAVITY_ENDPOINT = 'https://daily-cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_USER_AGENT =
  'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)';

/**
 * Builds HTTP headers for Google Antigravity Cloud Code PA API.
 */
export function buildAuthHeaders(
  tokenOrKey: string,
  customHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': ANTIGRAVITY_USER_AGENT,
    ...customHeaders
  };

  const token = tokenOrKey.startsWith('Bearer ') ? tokenOrKey : `Bearer ${tokenOrKey}`;
  headers['Authorization'] = token;

  return headers;
}

/**
 * Builds Antigravity internal API endpoint URL.
 */
export function buildEndpoint(
  modelOrToken?: string,
  streamOrModel: boolean | string = false,
  streamOrBase?: boolean | string,
  baseUrl = ANTIGRAVITY_ENDPOINT
): string {
  let stream = false;
  let base = baseUrl;

  if (typeof streamOrModel === 'boolean') {
    stream = streamOrModel;
    if (typeof streamOrBase === 'string') base = streamOrBase;
  } else if (typeof streamOrBase === 'boolean') {
    stream = streamOrBase;
    if (typeof baseUrl === 'string') base = baseUrl;
  }

  const method = stream ? 'streamGenerateContent' : 'generateContent';
  const url = new URL(`${base}/v1internal:${method}`);
  if (stream) {
    url.searchParams.set('alt', 'sse');
  }
  return url.toString();
}

/**
 * Pure HTTP inference with Google Antigravity Internal REST API.
 * 100% portable for Mobile (React Native), Web (React, Next.js, Vite), and Node.js.
 */
export async function executeChatHttp(
  tokenOrKey: string,
  options: ChatOptions,
  baseUrl?: string
): Promise<ChatResponse> {
  const startTime = Date.now();
  const rawModel = options.model || 'gemini-3.8-flash-high';
  const normalizedModel = normalizeModel(rawModel);

  const endpoint = buildEndpoint(normalizedModel, false, baseUrl);
  const headers = buildAuthHeaders(tokenOrKey, options.headers);
  const body = buildAntigravityPayload(options);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {}
    throw new Error(`Google Antigravity API error (${res.status}): ${message}`);
  }

  const data = (await res.json()) as any;
  const candidate = data.response?.candidates?.[0] || data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  let text = '';
  let reasoningContent = '';
  const toolCalls: ToolCall[] = [];

  for (const p of parts) {
    if (p.thought) {
      reasoningContent += p.text || '';
    } else if (p.text) {
      text += p.text;
    }
    if (p.functionCall) {
      toolCalls.push({
        id: `call_${generateUUID().slice(0, 8)}`,
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
  if (options.jsonSchema || options.response_format?.type === 'json_schema') {
    try {
      structuredData = JSON.parse(text);
    } catch {}
  }

  const usageMetadata = data.response?.usageMetadata || data.usageMetadata;
  const promptTokens = usageMetadata?.promptTokenCount || 0;
  const completionTokens = usageMetadata?.candidatesTokenCount || 0;
  const thoughtsTokens = usageMetadata?.thoughtsTokenCount;

  return {
    text: text.trim(),
    data: structuredData,
    model: rawModel,
    durationMs: Date.now() - startTime,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: candidate?.finishReason || (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
    reasoningContent: reasoningContent || undefined,
    usage: {
      promptTokens,
      completionTokens,
      thinkingTokens: thoughtsTokens,
      totalTokens: promptTokens + completionTokens + (thoughtsTokens || 0)
    }
  };
}

/**
 * Pure HTTP streaming chat using Server-Sent Events (SSE).
 * Runs seamlessly in React, React Native, and Node.js.
 */
export async function* executeStreamChatHttp(
  tokenOrKey: string,
  options: ChatOptions,
  baseUrl?: string
): AsyncGenerator<string, void, unknown> {
  const rawModel = options.model || 'gemini-3.8-flash-high';
  const normalizedModel = normalizeModel(rawModel);

  const endpoint = buildEndpoint(normalizedModel, true, baseUrl);
  const headers = buildAuthHeaders(tokenOrKey, options.headers);
  const body = buildAntigravityPayload(options);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {}
    throw new Error(`Google Antigravity Stream API error (${res.status}): ${message}`);
  }

  for await (const chunk of streamSSE(res)) {
    if (options.onChunk) {
      options.onChunk(chunk);
    }
    yield chunk;
  }
}

/**
 * Auto Tool Runner: executes tool definitions with an `.execute()` method.
 */
export async function runWithTools(
  tokenOrKey: string,
  options: ChatOptions,
  baseUrl?: string
): Promise<ChatResponse> {
  const maxSteps = options.maxSteps || 5;
  let steps = 0;
  const messages: ChatMessage[] = options.messages ? [...options.messages] : [];

  if (options.prompt && messages.length === 0) {
    messages.push({ role: 'user', content: options.prompt });
  }

  while (steps < maxSteps) {
    steps++;
    const res = await executeChatHttp(tokenOrKey, { ...options, messages }, baseUrl);

    // If no tool was requested by model, return answer
    if (!res.toolCalls || res.toolCalls.length === 0) {
      return { ...res, steps };
    }

    // Filter tools with execute functions
    const executableCalls = res.toolCalls.filter((c) => {
      const toolDef = options.tools?.find(
        (t) => (t.function?.name || t.name) === c.function.name
      );
      return typeof toolDef?.execute === 'function';
    });

    if (executableCalls.length === 0) {
      return { ...res, steps };
    }

    // Append model's tool calls to messages
    messages.push({
      role: 'assistant',
      tool_calls: res.toolCalls
    });

    // Run executable tools concurrently
    const executed = await Promise.all(
      executableCalls.map(async (call) => {
        const toolDef = options.tools?.find(
          (t) => (t.function?.name || t.name) === call.function.name
        )!;
        let parsedArgs = {};
        try {
          parsedArgs =
            typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function.arguments;
        } catch {}
        const result = await toolDef.execute!(parsedArgs);
        return {
          callId: call.id,
          name: call.function.name,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        };
      })
    );

    // Append tool responses
    for (const item of executed) {
      messages.push({
        role: 'tool',
        tool_call_id: item.callId,
        name: item.name,
        content: item.content
      });
    }
  }

  return executeChatHttp(tokenOrKey, { ...options, messages }, baseUrl);
}
