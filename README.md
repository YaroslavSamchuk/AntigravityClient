# Antigravity Client 🌌

Легкий, автономний TypeScript-клієнт із **нульовими сторонніми залежностями** для повної взаємодії з екосистемою **Google Antigravity**: від авторизації до прямої AI-генерації через **Gemini 3.8 Flash** та **Claude Sonnet 4.6 (Thinking)**.

---

## ⚡ Огляд можливостей

* **0 runtime-залежностей**: працює виключно на нативних API Node.js (`node:fs`, `node:http`, `node:crypto`, `node:child_process`, `fetch`).
* **Пряма передача `messages: [...]`**: як в OpenAI чи Anthropic — надсилайте історію листування та системні інструкції звичайним масивом об'єктів.
* **Швидка зміна акаунта (`ag.switchAccount()`)**: виклик Google-вікна вибору облікового запису.
* **Автоматична сесія**: миттєво підтягує активний Google-профіль із системи (`~/.gemini`).
* **Повний профіль**: ім'я, пошта, аватарка, статус підписки та термін придатності токена.
* **Стрімінг відповіді**: підтримка асинхронних генераторів (`for await (const chunk of ag.streamChat(...))`).

---

## 🚀 Як користуватися

### 1. Передача масиву повідомлень (Діалог з історією)

```typescript
import { Antigravity } from 'antigravity-client';

const ag = new Antigravity();

// Просто передаємо масив повідомлень — нуль зайвого клопоту!
const res = await ag.chat({
  model: 'Claude Sonnet 4.6 (Thinking)',
  messages: [
    { role: 'system', content: 'Ти стислий асистент.' },
    { role: 'user', content: 'Мене звати Ярослав і я пишу на TypeScript.' },
    { role: 'assistant', content: 'Привіт, Ярославе! Чим можу допомогти?' },
    { role: 'user', content: 'Як мене звати і якою мовою я пишу?' }
  ]
});

console.log(res.text);
// "Вас звати Ярослав, і ви пишете мовою TypeScript."
```

### 2. Мультимодальні повідомлення (Текст + Зображення `image_url`)

Повна сумісність із форматом OpenAI Vision / Multimodal:

```typescript
const res = await ag.chat({
  model: 'gemini-3.8-flash-high',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Що написано на дорожньому знаку на цьому фото і якого він кольору?'
        },
        {
          type: 'image_url',
          image_url: {
            url: 'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg'
          }
        }
      ]
    }
  ]
});

console.log(res.text);
// "На знаку написано STOP, він червоного кольору..."
```

### 3. Прямий виклик `ag.chat()` із `tools`, `temperature`, `topP`, `effort`

Вам **не обов'язково** запускати локальний HTTP-сервер — всі налаштування та інструменти передаються безпосередньо в метод `ag.chat()`:

```typescript
const res = await ag.chat({
  model: 'Claude Sonnet 4.6 (Thinking)',
  temperature: 0.2, // 0.0 - 2.0 (детермінізм або креативність)
  topP: 0.9,
  effort: 'high',   // 'low' | 'medium' | 'high' | 'xhigh' | 'max' (для моделей міркування)
  parallel_tool_calls: true, // Вмикає мультитульність (паралельні виклики)
  messages: [
    { role: 'user', content: 'Скільки гривень коштує 100 доларів?' }
  ],
  tools: [
    {
      name: 'get_exchange_rate',
      description: 'Отримує поточний курс валют',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' }
        },
        required: ['from', 'to']
      }
    }
  ],
  toolChoice: 'auto' // 'auto' | 'none' | 'required'
});

if (res.toolCalls) {
  console.log('Модель викликала інструменти:', res.toolCalls);
}
```

### 4. Автоматичне виконання інструментів (Auto Tool Runner в 1 рядок)

Якщо передати функцію `execute` прямо в об'єкт інструмента, бібліотека **сама паралельно виконає всі виклики** і поверне готову фінальну відповідь:

```typescript
const res = await ag.chat({
  messages: [{ role: 'user', content: 'Порівняй 100 USD та 100 EUR у гривнях' }],
  parallel_tool_calls: true,
  tools: [
    {
      name: 'get_exchange_rate',
      description: 'Отримує курс валют',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, amount: { type: 'number' } },
        required: ['from', 'to']
      },
      // Виконавець тула
      execute: async ({ from, to, amount = 1 }) => {
        const data = await fetch(`https://open.er-api.com/v6/latest/${from}`).then(r => r.json());
        return { rate: data.rates[to], total: amount * data.rates[to] };
      }
    }
  ]
});

console.log(res.text); // Модель сама все порахувала і видала порівняння!
```

### 3. Стрімінг відповіді (`stream: true` або `ag.streamChat`)

Стрімінг можна запускати або прапорцем `stream: true` у `ag.chat()`, або окремим методом:

```typescript
// Варіант А: через ag.chat з опцією stream: true
for await (const chunk of ag.chat({
  messages: [{ role: 'user', content: 'Розкажи факт' }],
  stream: true
})) {
  process.stdout.write(chunk);
}

// Варіант Б: через ag.streamChat
for await (const chunk of ag.streamChat([
  { role: 'user', content: 'Розкажи коротку історію' }
])) {
  process.stdout.write(chunk);
}
```

### 4. Швидка зміна облікового запису (Google Account Chooser)

```typescript
// Примушує Google показати екран "Виберіть акаунт"
const newSession = await ag.switchAccount();
console.log(`Новий активний акаунт: ${newSession.user.email}`);
```

### 4. Отримання сесії, профілю та підписки

```typescript
const session = await ag.getSession();
console.log(`Користувач: ${session.user.name} (${session.user.email})`);

const sub = await ag.getSubscription();
console.log(`Тариф: ${sub.activeTier?.name} (${sub.activeTier?.description})`);
```

---

## 🔌 OpenAI-сумісний сервер та робота з SDK / Tools

Бібліотека має вбудований HTTP-міст, сумісний зі специфікацією OpenAI API. Ви можете використовувати офіційну бібліотеку `openai` (JavaScript, Python тощо) або звичайний `fetch`/`curl`.

### Запуск мосту (OpenAI Bridge)
```typescript
import { Antigravity } from 'antigravity-client';

const ag = new Antigravity();
const bridge = await ag.serve({ port: 3045 });
console.log(`OpenAI API доступно на: ${bridge.url}`); // http://127.0.0.1:3045/v1
```

### Підключення через офіційну бібліотеку `openai`
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:3045/v1',
  apiKey: 'antigravity' // будь-який рядок
});

const response = await client.chat.completions.create({
  model: 'gemini-3.8-flash-high', // або 'Claude Sonnet 4.6 (Thinking)'
  messages: [{ role: 'user', content: 'Привіт!' }]
});

console.log(response.choices[0].message.content);
```

### Робота через звичайний HTTP POST (Tools / Function Calling)
```typescript
const res = await fetch('http://127.0.0.1:3045/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer any-key'
  },
  body: JSON.stringify({
    model: 'Claude Sonnet 4.6 (Thinking)',
    messages: [{ role: 'user', content: 'Яка погода в Києві?' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Отримує погоду за містом',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' }
            },
            required: ['city']
          }
        }
      }
    ]
  })
});

const data = await res.json();
console.log(data.choices[0].message.tool_calls);
```

---

## 📋 Доступні моделі

* `gemini-3.8-flash-high` *(Швидка та потужна модель Gemini)*
* `Claude Sonnet 4.6 (Thinking)` *(Флагманська модель Claude з мисленням)*
* `Claude Opus 4.6 (Thinking)`
* `gemini-3.8-flash-medium`
* `gemini-3.8-flash-low`
* `GPT-OSS 120B (Medium)`

---

## 🧪 Запуск тестів

```bash
npm test
```
