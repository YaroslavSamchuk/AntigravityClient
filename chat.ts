import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Antigravity, ToolDefinition, ChatMessage } from './src/index.js';

// 1. Реальна функція отримання актуальних курсів валют
async function getRealExchangeRate(fromCurrency: string, toCurrency: string, amount: number = 1) {
  const from = fromCurrency.toUpperCase().trim();
  const to = toCurrency.toUpperCase().trim();

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    const data = await res.json();

    if (data.result !== 'success' || !data.rates || !data.rates[to]) {
      // Якщо це гривня (UAH) — резервне звернення до офіційного API НБУ
      if (to === 'UAH') {
        const nbuRes = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${from}&json`);
        const nbuData = await nbuRes.json();
        if (Array.isArray(nbuData) && nbuData.length > 0) {
          const rate = nbuData[0].rate;
          return { success: true, source: 'НБУ', from, to, rate, amount, total: amount * rate };
        }
      }
      return { success: false, error: `Курс ${from}/${to} не знайдено` };
    }

    const rate = data.rates[to];
    return {
      success: true,
      source: 'Global Exchange Rates API',
      from,
      to,
      rate,
      amount,
      total: Number((amount * rate).toFixed(2))
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// 2. Опис інструменту (Tool) для моделі
const currencyTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_exchange_rate',
    description: 'Отримує точний актуальний курс валют і конвертує суму (USD, UAH, EUR тощо).',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Валюта відправника, наприклад USD' },
        to: { type: 'string', description: 'Цільова валюта, наприклад UAH' },
        amount: { type: 'number', description: 'Сума для конвертації' }
      },
      required: ['from', 'to']
    }
  }
};

async function main() {
  console.log('🌌 Ініціалізація Antigravity Client...');
  const ag = new Antigravity();

  // Відкривається інтерактивний інпут
  const rl = readline.createInterface({ input, output });
  const userQuestion = await rl.question('👤 Введіть запитання (наприклад: "Скільки зараз 100 USD у гривнях?"): ');

  const promptText = userQuestion.trim() || 'Скільки зараз 100 USD у гривнях?';
  console.log(`\n🔍 Запит: "${promptText}"`);
  console.log('⏳ Відправляємо запит до моделі...\n');

  const messages: ChatMessage[] = [{ role: 'user', content: promptText }];

  // 1-й запит до моделі
  const initialResponse = await ag.chat({
    model: 'gemini-3.8-flash-high', // або 'Claude Sonnet 4.6 (Thinking)'
    messages,
    tools: [currencyTool],
    toolChoice: 'auto'
  });

  // Обробка тула, якщо модель вирішила його викликати
  if (initialResponse.toolCalls && initialResponse.toolCalls.length > 0) {
    const call = initialResponse.toolCalls[0];
    const args = JSON.parse(call.function.arguments);

    console.log(`🛠️ [Модель викликає інструмент]: "${call.function.name}"`, args);

    // Отримуємо реальні курси
    console.log('🌐 Звертаємось до реального API курсів валют...');
    const toolResult = await getRealExchangeRate(args.from, args.to, args.amount || 1);
    console.log('📊 Отримані дані:', toolResult);

    // Додаємо виклик і результат тула в історію
    messages.push({
      role: 'assistant',
      tool_calls: initialResponse.toolCalls
    });

    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content: JSON.stringify(toolResult)
    });

    console.log('\n⏳ Відправляємо результат назад моделі для формування відповіді...\n');

    // 2-й запит до моделі (для фінальної відповіді на основі реальних даних)
    const finalResponse = await ag.chat({
      model: 'gemini-3.8-flash-high',
      messages
    });

    console.log('🤖 Відповідь асистента:');
    console.log('--------------------------------------------------');
    console.log(finalResponse.text);
    console.log('--------------------------------------------------');
  } else {
    console.log('🤖 Відповідь:', initialResponse.text);
  }

  // Закінчується чат
  rl.close();
  console.log('\n🏁 Чат успішно завершено!');
}

main().catch(console.error);