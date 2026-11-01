import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Antigravity, ToolDefinition, ChatMessage } from './src/index.js';

// 1. Реальна функція отримання актуальних курсів валют (використовує відкритий API курсів)
async function getRealExchangeRate(fromCurrency: string, toCurrency: string, amount: number = 1) {
  const from = fromCurrency.toUpperCase().trim();
  const to = toCurrency.toUpperCase().trim();

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    const data = await res.json();

    if (data.result !== 'success' || !data.rates || !data.rates[to]) {
      // Запасний варіант: якщо це гривня (UAH), перевіряємо офіційний курс НБУ
      if (to === 'UAH') {
        const nbuRes = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${from}&json`);
        const nbuData = await nbuRes.json();
        if (Array.isArray(nbuData) && nbuData.length > 0) {
          const rate = nbuData[0].rate;
          return {
            success: true,
            source: 'Національний банк України (НБУ)',
            from,
            to,
            rate,
            amount,
            convertedTotal: amount * rate
          };
        }
      }
      return { success: false, error: `Курс для валютної пари ${from} -> ${to} не знайдено.` };
    }

    const rate = data.rates[to];
    const convertedTotal = Number((amount * rate).toFixed(2));

    return {
      success: true,
      source: 'Global Exchange Rates API',
      from,
      to,
      rate,
      amount,
      convertedTotal,
      lastUpdated: data.time_last_update_utc
    };
  } catch (err: any) {
    return { success: false, error: `Помилка запиту курсів: ${err.message}` };
  }
}

// 2. Опис інструменту (Tool Definition) для моделі
const currencyTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_exchange_rate',
    description: 'Отримує точний актуальний курс валют і конвертує суму між будь-якими валютами (USD, UAH, EUR, GBP тощо).',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Код валюти відправника (наприклад: USD, EUR, UAH)'
        },
        to: {
          type: 'string',
          description: 'Код цільової валюти (наприклад: UAH, USD, EUR)'
        },
        amount: {
          type: 'number',
          description: 'Сума для конвертації (за замовчуванням 1)'
        }
      },
      required: ['from', 'to']
    }
  }
};

async function main() {
  console.log('🌌 ==============================================');
  console.log('   Antigravity Client: Тест із реальними курсами   ');
  console.log('==============================================\n');

  // Відкривається антигравіті
  const ag = new Antigravity();
  console.log('✅ Клієнт Antigravity ініціалізовано.');

  // Відкривається інтерактивний інпут у терміналі
  const rl = readline.createInterface({ input, output });

  console.log('\n💡 Підказка: запитайте щось на кшталт "Скільки зараз 100 доларів у гривнях?"');
  const userQuestion = await rl.question('👤 Ваше запитання: ');

  const promptText = userQuestion.trim() || 'Скільки зараз коштує 100 доларів у гривнях?';
  console.log(`\n🔍 Запит: "${promptText}"`);
  console.log('⏳ Відправляємо запит до моделі з підключеним інструментом currencyTool...\n');

  // Починається історія повідомлень
  const messages: ChatMessage[] = [
    { role: 'user', content: promptText }
  ];

  // 1-й запит до моделі (з тулом)
  const initialResponse = await ag.chat({
    model: 'gemini-3.8-flash-high', // або 'Claude Sonnet 4.6 (Thinking)'
    messages,
    tools: [currencyTool],
    toolChoice: 'auto'
  });

  // Перевіряємо, чи вирішила модель викликати інструменти (мультитульність: один або декілька за раз)
  if (initialResponse.toolCalls && initialResponse.toolCalls.length > 0) {
    console.log(`🛠️ [Модель викликала ${initialResponse.toolCalls.length} інструмент(ів) одночасно]:`);

    // Додаємо повідомлення асистента з усіма tool_calls
    messages.push({
      role: 'assistant',
      tool_calls: initialResponse.toolCalls
    });

    // Виконуємо всі тули паралельно через Promise.all
    console.log('🌐 Виконуємо всі інструменти паралельно...');
    const results = await Promise.all(
      initialResponse.toolCalls.map(async (call) => {
        const args = JSON.parse(call.function.arguments);
        console.log(`   ⚙️ ${call.function.name}: ${args.amount || 1} ${args.from} -> ${args.to}`);
        const result = await getRealExchangeRate(args.from, args.to, args.amount || 1);
        return { call, result };
      })
    );

    // Додаємо кожен результат у messages з role: 'tool'
    for (const { call, result } of results) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result)
      });
    }

    console.log('\n⏳ Відправляємо всі результати назад моделі для формування відповіді...\n');

    // 2-й запит до моделі (для формування фінальної відповіді на основі всіх отриманих даних)
    const finalResponse = await ag.chat({
      model: 'gemini-3.8-flash-high',
      messages
    });

    console.log('🤖 Відповідь асистента:');
    console.log('--------------------------------------------------');
    console.log(finalResponse.text);
    console.log('--------------------------------------------------');
  } else {
    // Якщо модель відповіла відразу без виклику тула
    console.log('🤖 Відповідь асистента (без виклику тула):');
    console.log('--------------------------------------------------');
    console.log(initialResponse.text);
    console.log('--------------------------------------------------');
  }

  // Закінчується чат
  rl.close();
  console.log('\n🏁 Чат успішно завершено!');
}

main().catch((err) => {
  console.error('❌ Виникла помилка:', err);
  process.exit(1);
});
