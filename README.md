# Antigravity Client 🌌

[![npm version](https://img.shields.io/npm/v/antigravity-client.svg?style=flat-square)](https://www.npmjs.com/package/antigravity-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Universal](https://img.shields.io/badge/platform-Browser%20%7C%20React%20Native%20%7C%20Node.js%20%7C%20Edge-purple?style=flat-square)](#-підтримувані-платформи)

**Antigravity Client** — ультрашвидка, ізоморфна TypeScript-бібліотека з **нульовими сторонніми залежностями (0 dependencies)** для підключення до офіційного **Google Antigravity Backend API**. Надає прямий доступ до найпотужніших флагманських моделей: **Gemini 3.8 Flash High**, **Claude Sonnet 4.6**, **Claude Opus 4.6 (Thinking)**, **GPT-OSS 120B** та інших за підпискою Google One AI Premium.

Побудована виключно на сучасних веб-стандартах (`fetch`, `ReadableStream`, `Web Crypto API`). Працює скрізь: у браузері (**React**, **Vue**, **Svelte**, **Next.js**), на мобільних пристроях (**React Native / Expo**), на сервері (**Node.js**, **Bun**, **Deno**) та у serverless/edge (**Cloudflare Workers**, **Vercel Edge**).

---

## 📑 Зміст

1. [⚡ Головні переваги](#-головні-переваги)
2. [📦 Встановлення](#-встановлення)
3. [🔐 Авторизація та токени](#-авторизація-та-токени)
   * [Спосіб 1: Прямий токен або API-ключ](#спосіб-1-прямий-токен-або-api-ключ)
   * [Спосіб 2: Вхід через Google OAuth 2.0 PKCE](#спосіб-2-вхід-через-google-oauth-20-pkce)
   * [Сховища сесій (Storage Adapters)](#сховища-сесій-storage-adapters)
4. [🚀 Швидкий старт](#-швидкий-старт)
   * [Простий текстовий запит](#1-простий-текстовий-запит)
   * [Діалог з історією повідомлень](#2-діалог-з-історією-повідомлень-openai-формат)
5. [🖼️ Мультимодальність: Фото, PDF та Файли](#️-мультимодальність-фото-pdf-та-файли)
   * [Зображення (JPEG, PNG, WebP)](#1-зображення-jpeg-png-webp)
   * [Документи (PDF, аудіо)](#2-документи-pdf-аудіо)
   * [Текстові файли та вихідний код](#3-текстові-файли-та-код)
6. [⚡ Стрімінг у реальному часі (SSE)](#-стрімінг-у-реальному-часі-sse)
7. [🛠️ Автоматичний виклик інструментів (Tools / Function Calling)](#️-автоматичний-виклик-інструментів-tools--function-calling)
8. [🎯 Структуровані відповіді (JSON Schema)](#-структуровані-відповіді-json-schema)
9. [🧠 Доступні моделі та конфігурація](#-доступні-моделі-та-конфігурація)
10. [💻 Готові приклади для платформ](#-готові-приклади-для-платформ)
    * [React (Vite / Next.js)](#1-react-vite--nextjs)
    * [React Native & Expo](#2-react-native--expo)
    * [Node.js / Express](#3-nodejs--express)
11. [📚 Повний API Reference](#-повний-api-reference)
12. [❓ Часті запитання (FAQ & Troubleshooting)](#-часті-запитання-faq--troubleshooting)
13. [📄 Ліцензія](#-ліцензія)

---

## ⚡ Головні переваги

* **🚀 Нуль залежностей**: чистий TypeScript, мінімальний розмір бандла (~34 kB), жодних важких зовнішніх пакетів.
* **💬 100% сумісність з OpenAI**: формат ролей (`system`, `user`, `assistant`) та мультимодальний масив частин `content`.
* **🔒 Google OAuth 2.0 PKCE**: нативна безпечна авторизація користувача без витоку секретів у браузері чи мобільному додатку.
* **🔄 Автоматичний Refresh токенів**: бібліотека сама оновлює `access_token` за допомогою `refresh_token`, якщо термін дії закінчився.
* **⚡ Нативний HTTP/SSE стрімінг**: отримання токенів у режимі реального часу через `for await (const chunk of ...)`.
* **🛠️ Автономний Tool Runner**: автоматичне паралельне виконання JavaScript/TypeScript функцій (`.execute()`) без написання циклів вручну.
* **📐 Structured Outputs**: сувора валідація JSON за JSON Schema із повною типізацією TypeScript (`ag.structured<T>`).

---

## 📦 Встановлення

```bash
# npm
npm install antigravity-client

# yarn
yarn add antigravity-client

# pnpm
pnpm add antigravity-client
```

---

## 🔐 Авторизація та токени

Antigravity Backend вимагає автентифікації Google. Бібліотека підтримує два зручні варіанти підключення:

### Спосіб 1: Прямий токен або API-ключ
Підходить для бекенду (Node.js/Express), серверлес-функцій або швидкого тестування:

```typescript
import { Antigravity } from 'antigravity-client';

const ag = new Antigravity({
  token: 'ya29.ваш_google_access_token' // або options.apiKey
});
```

Також токен можна оновити динамічно в будь-який момент:
```typescript
ag.setToken('ya29.новий_токен', {
  refreshToken: '1//ваш_refresh_token',
  expiresInSeconds: 3600
});
```

---

### Спосіб 2: Вхід через Google OAuth 2.0 PKCE
Стандарт для браузерних (React/Vue) та мобільних додатків (React Native / Expo). Користувач логіниться через офіційне вікно Google, а ваш клієнт отримує токени без необхідності зберігати `client_secret` на клієнті.

#### 1. Генерація посилання для входу:
```typescript
// Отримуємо URL авторизації та PKCE codeVerifier
const auth = await ag.getAuthUrl({
  redirectUri: window.location.origin + '/callback'
});

// Зберігаємо codeVerifier (наприклад, у sessionStorage) для завершення входу
sessionStorage.setItem('pkce_verifier', auth.codeVerifier);

// Перенаправляємо користувача на вікно входу Google
window.location.href = auth.url;
```

#### 2. Обмін коду на сесію (Callback):
Після успішного логіну Google повертає користувача на ваш `redirectUri` з параметром `?code=...`:
```typescript
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const codeVerifier = sessionStorage.getItem('pkce_verifier');

if (code && codeVerifier) {
  const session = await ag.exchangeCode({
    code,
    codeVerifier,
    redirectUri: window.location.origin + '/callback'
  });

  console.log('Авторизовано як:', session.user.name, session.user.email);
}
```

---

### Сховища сесій (Storage Adapters)
Клієнт автоматично зберігає активну сесію та оновлює її. Ви можете передати будь-яке сховище:

* **`MemoryStorage`** (за замовчуванням) — зберігає сесію в пам'яті (Node.js / тести).
* **`LocalStorageAdapter`** — автоматично зберігає сесію у `window.localStorage` браузера.
* **Власний адаптер** (наприклад, для `AsyncStorage` чи `SecureStore` у React Native):

```typescript
import { Antigravity, LocalStorageAdapter } from 'antigravity-client';

// У браузері:
const ag = new Antigravity({
  storage: new LocalStorageAdapter()
});

// У React Native (Expo):
import AsyncStorage from '@react-native-async-storage/async-storage';

const ag = new Antigravity({
  storage: {
    getItem: (key) => AsyncStorage.getItem(`ag_${key}`),
    setItem: (key, val) => AsyncStorage.setItem(`ag_${key}`, val),
    removeItem: (key) => AsyncStorage.removeItem(`ag_${key}`)
  }
});
```

---

## 🚀 Швидкий старт

### 1. Простий текстовий запит
Найкоротший спосіб отримати відповідь від моделі за замовчуванням (`gemini-3.8-flash-high`):

```typescript
import { Antigravity } from 'antigravity-client';

const ag = new Antigravity({ token: 'ya29...' });

const res = await ag.chat('Поясни що таке квантова заплутаність у двох реченнях.');

console.log(res.text);
console.log('Використано токенів:', res.usage?.totalTokens);
```

---

### 2. Діалог з історією повідомлень (OpenAI формат)
Бібліотека використовує звичний та інтуїтивний формат масиву `ChatMessage[]`:

```typescript
const res = await ag.chat({
  model: 'gemini-3.8-flash-high', // або 'claude-sonnet-4-6'
  messages: [
    {
      role: 'system',
      content: 'Ти стислий технічний помічник. Відповідай українською.'
    },
    {
      role: 'user',
      content: 'Мене звати Ярослав, я пишу клієнт для Antigravity на TypeScript.'
    },
    {
      role: 'assistant',
      content: 'Приємно познайомитися, Ярославе! Чим можу допомогти у розробці клієнта?'
    },
    {
      role: 'user',
      content: 'Нагадай, як мене звати і що саме я пишу?'
    }
  ]
});

console.log(res.text);
// "Вас звати Ярослав, і ви пишете клієнт для Antigravity на TypeScript."
```

---

## 🖼️ Мультимодальність: Фото, PDF та Файли

Завдяки повній сумісності з OpenAI Vision API ви можете передавати `content` як **масив частин**, комбінуючи текст, зображення, файли та код.

### 1. Зображення (JPEG, PNG, WebP)
Зображення передаються через стандартний об'єкт `{ type: 'image_url', image_url: { url } }` із Base64 Data URL:

```typescript
const res = await ag.chat({
  model: 'gemini-3.8-flash-high',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Опиши, що зображено на цьому фото, та виділи головні обʼєкти:'
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
          }
        }
      ]
    }
  ]
});

console.log(res.text);
```

> [!TIP]
> У браузері перетворити файл з `<input type="file" />` у Data URL можна за допомогою стандартного `FileReader`:
> ```typescript
> const reader = new FileReader();
> reader.onload = () => {
>   const dataUrl = reader.result as string; // "data:image/jpeg;base64,..."
> };
> reader.readAsDataURL(file);
> ```

---

### 2. Документи (PDF, аудіо)
Моделі Antigravity нативно розуміють PDF-документи (таблиці, схеми, багатосторінковий текст). Їх можна передавати як Data URL або через `{ type: 'file' }`:

```typescript
const res = await ag.chat({
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Знайди загальну суму та реквізити в цьому рахунку:' },
        {
          type: 'file',
          file: {
            url: 'data:application/pdf;base64,JVBERi0xLjQKJ...',
            mimeType: 'application/pdf'
          }
        }
      ]
    }
  ]
});
```

---

### 3. Текстові файли та код
Для текстових файлів (`.txt`, `.py`, `.ts`, `.json`, `.csv`, `.md`) кодування у Base64 **не потрібне**. Їх набагато ефективніше передавати звичайним текстом:

```typescript
const fileContent = `function add(a: number, b: number) { return a + b; }`;

const res = await ag.chat({
  messages: [
    {
      role: 'user',
      content: `Зроби ревʼю цього коду на TypeScript:\n\`\`\`typescript\n${fileContent}\n\`\`\``
    }
  ]
});
```

---

## ⚡ Стрімінг у реальному часі (SSE)

Клієнт підтримує нативний асинхронний ітератор (`AsyncIterable<string>`), який працює скрізь без спеціальних Node-бібліотек:

```typescript
// Варіант 1: Через метод streamChat
for await (const chunk of ag.streamChat('Напиши коротку казку про робота')) {
  process.stdout.write(chunk); // або оновлюйте стан у React
}

// Варіант 2: Через звичайний chat з прапорцем stream: true
for await (const chunk of ag.chat({ prompt: 'Привіт!', stream: true })) {
  console.log(chunk);
}
```

---

## 🛠️ Автоматичний виклик інструментів (Tools / Function Calling)

Бібліотека має вбудований **Auto Tool Runner**. Якщо визначення інструменту містить функцію `execute`, клієнт автоматично виконає її, передасть результат моделі та поверне фінальну людську відповідь:

```typescript
const weatherTool = {
  name: 'getWeather',
  description: 'Повертає поточну погоду для вказаного міста',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'Назва міста, наприклад Київ' }
    },
    required: ['city']
  },
  // Автоматично викликається бібліотекою при запиті моделі
  execute: async ({ city }: { city: string }) => {
    return { city, temperature: '+19°C', condition: 'Сонячно, без опадів' };
  }
};

const res = await ag.chat({
  prompt: 'Яка зараз погода у Львові та Києві?',
  tools: [weatherTool]
});

console.log(res.text);
// "Зараз у Києві та Львові близько +19°C, сонячно і без опадів."
```

---

## 🎯 Структуровані відповіді (JSON Schema)

Метод `ag.structured<T>` змушує модель генерувати валідний JSON за вказаною схемою та повертає готовий, суворо типізований JavaScript-об'єкт:

```typescript
interface ProductAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  pros: string[];
  cons: string[];
}

const analysis = await ag.structured<ProductAnalysis>({
  prompt: 'Проаналізуй відгук: "Ноутбук чудовий і дуже швидкий, але екран міг би бути трохи яскравішим."',
  schema: {
    type: 'object',
    properties: {
      sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
      score: { type: 'number', minimum: 1, maximum: 10 },
      pros: { type: 'array', items: { type: 'string' } },
      cons: { type: 'array', items: { type: 'string' } }
    },
    required: ['sentiment', 'score', 'pros', 'cons']
  }
});

console.log(analysis.sentiment); // "positive"
console.log(analysis.score);     // 8
console.log(analysis.pros);      // ["Дуже швидкий", "Чудовий ноутбук"]
console.log(analysis.cons);      // ["Недостатня яскравість екрану"]
```

---

## 🧠 Доступні моделі та конфігурація

Ви можете використовувати будь-яку з доступних моделей бекенду Google Antigravity:

| Ідентифікатор моделі | Опис моделі |
| :--- | :--- |
| `gemini-3.8-flash-high` | **За замовчуванням**. Найновіша флагманська модель із глибоким міркуванням (reasoning) |
| `gemini-3.8-flash-medium` | Швидка модель середньої потужності |
| `gemini-3.8-flash-low` | Ультрашвидка модель для швидких операцій |
| `gemini-3.5-flash-lite` | Низька затримка та оптимізація для агентських задач і парсингу документів |
| `gemini-3-flash` | Базова високошвидкісна модель покоління 3 (відповідь ~700 мс) |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 від Anthropic через інфраструктуру Google Antigravity (~1 сек) |
| `claude-opus-4-6-thinking` | Claude Opus 4.6 з розширеним ланцюжком роздумів (Thinking Blocks) |
| `gpt-oss-120b-medium` | Велика відкрита модель на 120 мільярдів параметрів |
| `gemini-2.5-flash` | Швидка модель попереднього покоління Flash |
| `gemini-2.5-pro` | Модель 2.5 Pro з високою місткістю контексту |

### Додаткові параметри генерації:
```typescript
const res = await ag.chat({
  prompt: 'Склади план...',
  model: 'claude-sonnet-4-6',
  temperature: 0.7,        // Креативність (0.0 - 2.0)
  maxTokens: 4096,         // Ліміт довжини відповіді
  effort: 'high',          // Рівень роздумів: 'low' | 'medium' | 'high'
  system: 'Ти професійний бізнес-аналітик.'
});
```

---

## 💻 Готові приклади для платформ

### 1. React (Vite / Next.js)

> [!IMPORTANT]
> **Чому потрібен дев-проксі у браузері?**  
> Браузери з міркувань безпеки забороняють клієнтському JavaScript встановлювати системний заголовок `User-Agent`. Оскільки бекенд Google Antigravity вимагає фірмовий User-Agent клієнта, у браузері для локальної розробки у `vite.config.ts` налаштовується проксі:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1internal': {
        target: 'https://daily-cloudcode-pa.googleapis.com',
        changeOrigin: true,
        headers: {
          'User-Agent':
            'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)'
        }
      }
    }
  }
});
```

#### Простий React компонент чату:
```tsx
import { useState, useEffect } from 'react';
import { Antigravity, LocalStorageAdapter, type ChatMessage } from 'antigravity-client';

const ag = new Antigravity({
  storage: new LocalStorageAdapter(),
  baseUrl: window.location.origin // запити підуть через /v1internal проксі
});

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Привіт! Чим можу допомогти?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Обробка повернення після входу Google OAuth
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (code && verifier) {
      ag.exchangeCode({
        code,
        codeVerifier: verifier,
        redirectUri: window.location.origin
      }).then(() => {
        sessionStorage.removeItem('pkce_verifier');
        window.history.replaceState({}, '', window.location.pathname);
      });
    }
  }, []);

  const handleLogin = async () => {
    const auth = await ag.getAuthUrl({ redirectUri: window.location.origin });
    sessionStorage.setItem('pkce_verifier', auth.codeVerifier);
    window.location.href = auth.url;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const res = await ag.chat({ messages: updated });
      setMessages([...updated, { role: 'assistant', content: res.text }]);
    } catch (err: any) {
      setMessages([...updated, { role: 'assistant', content: `Помилка: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <button onClick={handleLogin}>Увійти через Google</button>

      <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <strong>{m.role}: </strong>{m.content as string}
          </div>
        ))}
      </div>

      <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
      <button onClick={handleSend} disabled={loading}>{loading ? '...' : 'Надіслати'}</button>
    </div>
  );
}
```

#### 🚀 Деплой на Vercel (Production Edge Proxy):
Щоб ваш React/Vite додаток працював у браузері на продакшені у Vercel, достатньо створити безсерверний файл `api/v1internal.ts`:

```typescript
// api/v1internal.ts (Vercel Edge Proxy)
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const target = new URL(`https://daily-cloudcode-pa.googleapis.com${url.pathname}${url.search}`);

  const headers = new Headers(req.headers);
  headers.set('User-Agent', 'antigravity/cli/1.4.12 (aidev_client; os_type=windows; arch=amd64; cl=1010700967; auth_method=consumer)');
  headers.delete('host');

  const res = await fetch(target.toString(), {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
  });

  return new Response(res.body, { status: res.status, headers: res.headers });
}
```

І додати реврайт у `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/v1internal:path*", "destination": "/api/v1internal" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

### 2. React Native & Expo
У мобільних додатках клієнт працює нативно без будь-яких проксі-серверів (бо мобільний `fetch` дозволяє встановлювати довільні заголовки):

```typescript
import { Antigravity } from 'antigravity-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

export const ag = new Antigravity({
  defaultModel: 'gemini-3.8-flash-high',
  storage: {
    getItem: (key) => AsyncStorage.getItem(`ag_${key}`),
    setItem: (key, val) => AsyncStorage.setItem(`ag_${key}`, val),
    removeItem: (key) => AsyncStorage.removeItem(`ag_${key}`)
  }
});

export async function loginInMobile() {
  const redirectUri = 'myapp://oauth';
  const auth = await ag.getAuthUrl({ redirectUri });

  const result = await WebBrowser.openAuthSessionAsync(auth.url, redirectUri);
  if (result.type === 'success') {
    const code = new URL(result.url).searchParams.get('code');
    if (code) {
      return ag.exchangeCode({
        code,
        codeVerifier: auth.codeVerifier,
        redirectUri
      });
    }
  }
}
```

---

### 3. Node.js / Express
Створення власного легкого AI API-сервера:

```typescript
import express from 'express';
import { Antigravity } from 'antigravity-client';

const app = express();
app.use(express.json());

const ag = new Antigravity({
  token: process.env.GOOGLE_ANTIGRAVITY_TOKEN
});

// Звичайний запит
app.post('/api/chat', async (req, res) => {
  try {
    const response = await ag.chat({
      messages: req.body.messages,
      model: req.body.model
    });
    res.json({ text: response.text, usage: response.usage });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SSE Стрімінг
app.get('/api/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const chunk of ag.streamChat(req.query.prompt as string)) {
    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

---

## 📚 Повний API Reference

### Клас `Antigravity`

```typescript
const ag = new Antigravity(options?: AntigravityClientOptions);
```

#### Опції конструктора (`AntigravityClientOptions`):
* `token?: string` — Google OAuth Access Token (`ya29...`) або API ключ.
* `storage?: StorageAdapter` — адаптер збереження (`LocalStorageAdapter`, `MemoryStorage` або власний).
* `defaultModel?: AntigravityModel` — модель за замовчуванням (`gemini-3.8-flash-high`).
* `baseUrl?: string` — базовий URL для проксі (`window.location.origin` у браузері).
* `clientId?: string` / `clientSecret?: string` — власні OAuth облікові дані (якщо не вказано — використовуються офіційні Antigravity).

#### Основні методи:
* **`ag.chat(input: ChatInput): Promise<ChatResponse> | AsyncIterable<string>`**  
  Універсальний метод відправки запиту до ШІ. Приймає рядок, масив `ChatMessage[]` або повний об'єкт налаштувань `ChatOptions`.
* **`ag.streamChat(input: ChatInput): AsyncIterable<string>`**  
  Повертає асинхронний ітератор частин тексту в реальному часі.
* **`ag.structured<T>(options): Promise<T>`**  
  Генерує суворо валідований JSON за схемою та повертає готовий об'єкт типу `T`.
* **`ag.getAuthUrl(options?): Promise<AuthUrlResult>`**  
  Створює безпечний URL авторизації Google із генерацією PKCE `codeVerifier`.
* **`ag.exchangeCode(options): Promise<AntigravitySession>`**  
  Обмінює код авторизації на сесію з токенами.
* **`ag.isAuthenticated(): Promise<boolean>`**  
  Перевіряє, чи є активна та дійсна сесія.
* **`ag.getUser(): Promise<AntigravityUser>`**  
  Повертає профіль авторизованого користувача Google (ім'я, email, аватар).
* **`ag.getSubscription(): Promise<AntigravitySubscription>`**  
  Повертає статус підписки Google One AI / Cloud Code та доступні тарифні плани.
* **`ag.logout(): Promise<void>`**  
  Вихід із сесії та відкликання токена в Google.
* **`ag.getAvailableModels(): AntigravityModel[]`**  
  Повертає повний список підтримуваних моделей.

---

## ❓ Часті запитання (FAQ & Troubleshooting)

<details>
<summary><strong>1. Чому виникає помилка <code>403 SUBSCRIPTION_REQUIRED</code> у браузері?</strong></summary>

Бекенд Google Antigravity перевіряє системний заголовок `User-Agent`. Браузер забороняє змінювати цей заголовок з міркувань безпеки. Для локальної розробки у Vite достатньо налаштувати дев-проксі (див. розділ [React (Vite / Next.js)](#1-react-vite--nextjs)), який додає потрібний заголовок на стороні локального сервера.
</details>

<details>
<summary><strong>2. Чи потрібен окремий Google Cloud API Key або платний білінг у консолі GCP?</strong></summary>

Ні! Клієнт підключається напряму до персонального Antigravity Backend через ваш Google-акаунт з активною підпискою **Google One AI Premium**. Ніяких API ключів у GCP створювати не потрібно.
</details>

<details>
<summary><strong>3. Скільки часу діє access token і чи потрібно логінитись щогодини?</strong></summary>

Access token діє приблизно 1 годину. Але якщо при першому вході ви отримали `refresh_token` (бібліотека запитує його автоматично), `antigravity-client` самостійно оновлює прострочений токен «на льоту» перед кожним наступним викликом API.
</details>

<details>
<summary><strong>4. Чи можна використовувати бібліотеку на бекенді та фронтенді одночасно?</strong></summary>

Так. Бібліотека на 100% універсальна: вона не має прив'язок ні до Node.js модулів (`fs`, `crypto`, `http`), ні до специфічних API браузера (DOM).
</details>

---

## 📄 Ліцензія

Розповсюджується під ліцензією **MIT**.  
Автор: **Yaroslav Samchuk** © 2026.
