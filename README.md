# Antigravity Client 🌌

Універсальний, ізоморфний TypeScript-клієнт із **нульовими сторонніми залежностями** для **офіційного Google Antigravity Backend API**. Підтримує найновіші флагманські моделі Antigravity: **Gemini 3.8 Flash High**, **Claude Sonnet 4.6**, **Claude Opus 4.6 (Thinking)**, **GPT-OSS 120B** тощо.

Працює скрізь: у браузері, **React**, **Next.js**, на мобільних телефонах (**React Native / Expo**), на сервері (**Node.js**, **Bun**, **Deno**) та в Edge-середовищах (**Cloudflare Workers**, **Vercel Edge**).

---

## ⚡ Особливості

* **🚀 Прямий доступ до Antigravity Backend**: працює з внутрішніми ендпоінтами Cloud Code PA (`cloudcode-pa.googleapis.com` / `daily-cloudcode-pa.googleapis.com`), надаючи доступ до моделей рівня `gemini-3.8-flash-high` та `claude-sonnet-4-6`.
* **🔐 Google OAuth 2.0 PKCE**: нативна авторизація облікового запису Google з офіційними Antigravity-скоупами (`https://www.googleapis.com/auth/aicode` тощо).
* **🌍 100% Ізоморфний (Universal)**: побудований виключно на відкритих веб-стандартах (`fetch`, `Headers`, `ReadableStream`, `Web Crypto API`). Жодних `node:fs`, `node:child_process`, `node:http` чи `Buffer` у ядрі!
* **📱 Працює на телефоні та в React**: нульові проблеми з бандлерами (Vite, Webpack, Metro). Пряме підключення в мобільних додатках та SPA.
* **💬 Повний AI-чат**: передача історії повідомлень (`messages: [...]`), системних інструкцій (`system`), мультимодальності (`image_url`, base64).
* **⚡ Нативний HTTP-стрімінг**: `ag.chat({ stream: true })` та `ag.streamChat(...)` через SSE / ReadableStream у реальному часі.
* **🛠️ Auto Tool Runner**: підтримка інструментів із автоматичним циклом виконання функцій (`.execute()`).
* **🎯 Строга типізація (Structured Outputs)**: генерація типізованого JSON за JSON Schema (`ag.structured<T>`).
* **💾 Гнучкі сховища (Storage Adapters)**: `MemoryStorage`, `LocalStorageAdapter` або власний адаптер для `AsyncStorage` / `SecureStore`.

---

## 📦 Встановлення

```bash
npm install antigravity-client
```

---

## 🚀 Швидкий старт

### 1. Простий виклик у будь-якому React або Node.js середовищі

```typescript
import { Antigravity } from 'antigravity-client';

const ag = new Antigravity({
  token: 'ya29.ваш_гугл_токен_або_апі_ключ'
});

// Простий текстовий запит:
const res = await ag.chat('Привіт! Розкажи коротко про себе.');
console.log(res.text);
```

### 2. Діалог з історією повідомлень (OpenAI-сумісний формат)

```typescript
const res = await ag.chat({
  model: 'gemini-2.5-flash',
  messages: [
    { role: 'system', content: 'Ти стислий технічний експерт.' },
    { role: 'user', content: 'Мене звати Ярослав і я розробляю мобільний додаток на React Native.' },
    { role: 'assistant', content: 'Привіт, Ярославе! Чим можу допомогти по React Native?' },
    { role: 'user', content: 'Як мене звати і під яку платформу я пишу?' }
  ]
});

console.log(res.text);
// "Вас звати Ярослав, і ви розробляєте додаток під React Native."
```

### 3. Стрімінг відповіді в реальному часі

Працює нативно у браузері, React Native та Node.js без додаткових бібліотек:

```typescript
for await (const chunk of ag.streamChat('Напиши план розробки стартапу на 5 пунктів')) {
  process.stdout.write(chunk);
}

// Або через метод chat:
for await (const chunk of ag.chat({ prompt: 'Привіт!', stream: true })) {
  console.log(chunk);
}
```

---

## 🛠️ Виклик інструментів (Auto Tool Runner)

Якщо інструмент має метод `execute`, бібліотека автоматично виконає його паралельно і надішле результат моделі для фінальної відповіді:

```typescript
const weatherTool = {
  name: 'getWeather',
  description: 'Отримує поточну погоду за містом',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string' }
    },
    required: ['city']
  },
  execute: async ({ city }: { city: string }) => {
    return { temperature: '+18°C', condition: 'Сонячно' };
  }
};

const res = await ag.chat({
  prompt: 'Яка зараз погода в Києві?',
  tools: [weatherTool]
});

console.log(res.text);
// "Зараз у Києві +18°C, сонячно."
```

---

## 🎯 Структуровані виходи (Structured Output)

Отримайте суворо типізований об'єкт TypeScript без ручного парсингу:

```typescript
interface UserProfile {
  name: string;
  age: number;
  skills: string[];
}

const profile = await ag.structured<UserProfile>({
  prompt: 'Створи профіль для інженера Олександра, 29 років, TypeScript і React.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      skills: { type: 'array', items: { type: 'string' } }
    },
    required: ['name', 'age', 'skills']
  }
});

console.log(profile.name);   // "Олександр"
console.log(profile.skills); // ["TypeScript", "React"]
```

---

## 📱 1. Чистий клієнт у React Native / Expo (без бекенду)

У мобільних додатках клієнт працює на 100% автономно: авторизація Google OAuth через Deep Link (`myapp://oauth`), збереження сесії в `AsyncStorage` чи `SecureStore` та прямі виклики Antigravity через нативний `fetch`:

```typescript
import { Antigravity } from 'antigravity-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

// Створюємо клієнт з адаптером AsyncStorage
export const ag = new Antigravity({
  defaultModel: 'gemini-3.8-flash-high',
  storage: {
    getItem: (key) => AsyncStorage.getItem(`agy_${key}`),
    setItem: (key, val) => AsyncStorage.setItem(`agy_${key}`, val),
    removeItem: (key) => AsyncStorage.removeItem(`agy_${key}`)
  }
});

// Авторизація через браузер смартфона
export async function loginWithGoogle() {
  const redirectUri = 'myapp://oauth';
  const auth = await ag.getAuthUrl({ redirectUri });

  const result = await WebBrowser.openAuthSessionAsync(auth.url, redirectUri);
  if (result.type === 'success') {
    const code = new URL(result.url).searchParams.get('code');
    if (code) {
      const session = await ag.exchangeCode({
        code,
        codeVerifier: auth.codeVerifier,
        redirectUri
      });
      return session.user;
    }
  }
}

// Прямий стрімінг у чат без сервера
export async function streamMessage(prompt: string, onChunk: (text: string) => void) {
  for await (const chunk of ag.streamChat(prompt)) {
    onChunk(chunk);
  }
}
```

---

## 🌐 2. Використання у React (Vite / Next.js)

Оскільки браузери безпеково забороняють JavaScript змінювати системний заголовок `User-Agent` на довільний (через що шлюз Google блокує прямий браузерний запит з помилкою `403 SUBSCRIPTION_REQUIRED`), у середовищі браузера для Vite достатньо додати дев-проксі у `vite.config.ts`:

```typescript
// vite.config.ts
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

А в коді React передати `baseUrl`:

```tsx
import React, { useState, useEffect } from 'react';
import { Antigravity, LocalStorageAdapter } from 'antigravity-client';

const ag = new Antigravity({
  storage: new LocalStorageAdapter(),
  baseUrl: window.location.origin
});

export function ChatApp() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');

  // Обробка повернення з Google OAuth
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
    if (!input.trim()) return;
    const userText = input;
    setInput('');
    setMessages((prev) => [...prev, `Ви: ${userText}`]);

    const res = await ag.chat(userText);
    setMessages((prev) => [...prev, `AI: ${res.text}`]);
  };

  return (
    <div>
      <button onClick={handleLogin}>Увійти через Google</button>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSend}>Надіслати</button>
    </div>
  );
}
```

---

## 🖥️ 3. Використання у Node.js & Express

Якщо ви все ж хочете проксувати запити через власний Express API:

```typescript
import express from 'express';
import { Antigravity } from 'antigravity-client';

const app = express();
app.use(express.json());

const ag = new Antigravity({
  token: process.env.ANTIGRAVITY_TOKEN // або сесія після OAuth
});

// Звичайний запит
app.post('/api/chat', async (req, res) => {
  const answer = await ag.chat(req.body.prompt);
  res.json({ reply: answer.text, usage: answer.usage });
});

// Realtime SSE-стрімінг
app.get('/api/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const chunk of ag.streamChat(req.query.prompt as string)) {
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(3000);
```

---

## 🧠 Доступні моделі Antigravity

Бібліотека надає доступ до всього пулу моделей Antigravity:

| Модель | Опис |
| :--- | :--- |
| `gemini-3.8-flash-high` | **За замовчуванням**. Швидка флагманська модель із високим рівнем reasoning |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 від Anthropic через бекенд Antigravity |
| `claude-opus-4-6-thinking` | Потужний Claude Opus з глибинним ланцюжком роздумів (Thinking) |
| `gemini-3.8-flash-medium` | Збалансована швидкість і reasoning |
| `gpt-oss-120b-medium` | Відкрита масштабна модель 120B |

---

## 📄 Ліцензія

MIT © Yaroslav Samchuk
