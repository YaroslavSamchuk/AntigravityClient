import { Antigravity } from './src/index.js';

async function main() {
  console.log('🚀 Тестування OpenAI-сумісного сервера та роботи з Tools (інструментами)...\n');

  const ag = new Antigravity();

  // 1. Запускаємо локальний OpenAI сервер на порту 3045
  console.log('1️⃣ Запуск локального OpenAI Bridge сервера...');
  const bridge = await ag.serve({ port: 3045 });
  console.log(`   ✅ Сервер успішно запущено: ${bridge.url}\n`);

  try {
    // 2. Тест 1: Звичайний HTTP POST запит через fetch (стандарт OpenAI)
    console.log('2️⃣ Відправка звичайного HTTP запиту через fetch (без тулів)...');
    const res1 = await fetch('http://127.0.0.1:3045/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer any-key'
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash-high',
        messages: [
          { role: 'user', content: 'Привіт! Скажи одне вітальне слово.' }
        ]
      })
    });

    const data1 = await res1.json();
    console.log('   Отримана відповідь у форматі OpenAI:');
    console.log(`   Текст: "${data1.choices[0].message.content.trim()}"`);
    console.log(`   Модель: ${data1.model}, ID: ${data1.id}\n`);

    // 3. Тест 2: Запит із Tools (Function Calling / Інструменти)
    console.log('3️⃣ Відправка запиту з Tools (Function Calling)...');
    const weatherTools = [
      {
        type: 'function',
        function: {
          name: 'get_current_weather',
          description: 'Отримує поточну погоду для вказаного міста',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'Назва міста, наприклад Київ, Львів'
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit']
              }
            },
            required: ['location']
          }
        }
      }
    ];

    const res2 = await fetch('http://127.0.0.1:3045/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer any-key'
      },
      body: JSON.stringify({
        model: 'Claude Sonnet 4.6 (Thinking)',
        messages: [
          { role: 'user', content: 'Яка зараз погода в Одесі?' }
        ],
        tools: weatherTools
      })
    });

    const data2 = await res2.json();
    console.log('   Отримана відповідь на запит із tools:');
    const msg = data2.choices[0].message;

    if (msg.tool_calls) {
      console.log('   🛠️ Модель вирішила викликати інструмент (tool_calls):');
      console.log(JSON.stringify(msg.tool_calls, null, 2));

      // 4. Тест 3: Виконання функції локально та відправка результату назад (Round-trip Function Calling)
      console.log('\n4️⃣ Симулюємо виконання тула та повертаємо результат моделі...');
      const call = msg.tool_calls[0];
      const toolArgs = JSON.parse(call.function.arguments);
      console.log(`   Виконуємо функцію "${call.function.name}" з параметрами:`, toolArgs);

      // Локальна функція
      const simulatedToolOutput = JSON.stringify({
        location: toolArgs.location,
        temperature: '21°C',
        condition: 'Сонячно, легкий теплий вітерець з моря'
      });

      const res3 = await fetch('http://127.0.0.1:3045/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer any-key'
        },
        body: JSON.stringify({
          model: 'Claude Sonnet 4.6 (Thinking)',
          messages: [
            { role: 'user', content: 'Яка зараз погода в Одесі?' },
            msg, // assistant повідомлення з tool_calls
            {
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: simulatedToolOutput
            }
          ]
        })
      });

      const data3 = await res3.json();
      console.log('   Остаточна відповідь моделі після отримання даних з інструменту:');
      console.log(`   "${data3.choices[0].message.content.trim()}"`);
    } else {
      console.log('   Текст відповіді:', msg.content);
    }
  } finally {
    // Зупиняємо сервер
    await bridge.close();
    console.log('\n🛑 Локальний сервер закрито.');
  }
}

main().catch(console.error);
