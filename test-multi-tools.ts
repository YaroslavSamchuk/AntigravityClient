import { Antigravity, ToolDefinition, ChatMessage } from './src/index.js';

// Реальна функція курсів
async function getRealExchangeRate(from: string, to: string, amount: number = 1) {
  const f = from.toUpperCase().trim();
  const t = to.toUpperCase().trim();
  const res = await fetch(`https://open.er-api.com/v6/latest/${f}`);
  const data = await res.json();
  const rate = data.rates[t];
  return {
    from: f,
    to: t,
    rate,
    amount,
    total: Number((amount * rate).toFixed(2))
  };
}

const currencyTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_exchange_rate',
    description: 'Отримує курс валют для пари валют та рахує загальну суму.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Валюта відправника (USD, EUR тощо)' },
        to: { type: 'string', description: 'Цільова валюта (UAH)' },
        amount: { type: 'number', description: 'Сума' }
      },
      required: ['from', 'to']
    }
  }
};

async function main() {
  console.log('🧪 Тестування мультитульності (декілька tool calls в одній відповіді)...\n');

  const ag = new Antigravity();

  // Запит, що вимагає 2 паралельні виклики інструменту
  const userPrompt = 'Порівняй: скільки буде 100 USD в UAH, і скільки буде 100 EUR в UAH?';
  console.log(`👤 Запит користувача: "${userPrompt}"\n`);

  const messages: ChatMessage[] = [
    { role: 'user', content: userPrompt }
  ];

  // 1-й крок: запит до моделі з проханням викликати тули
  console.log('⏳ Відправляємо запит до моделі...');
  const res = await ag.chat({
    model: 'Claude Sonnet 4.6 (Thinking)', // або 'gemini-3.8-flash-high'
    messages,
    tools: [currencyTool],
    toolChoice: 'required',
    parallelToolCalls: true
  });

  if (!res.toolCalls || res.toolCalls.length === 0) {
    console.log('Модель не викликала тули:', res.text);
    return;
  }

  console.log(`\n🛠️ Модель викликала ОДРАЗУ ${res.toolCalls.length} інструменти(ів) в одній відповіді!`);
  console.log(JSON.stringify(res.toolCalls, null, 2));

  // Додаємо повідомлення асистента з усіма tool_calls
  messages.push({
    role: 'assistant',
    tool_calls: res.toolCalls
  });

  // 2-й крок: паралельне виконання всіх отриманих тулів через Promise.all
  console.log('\n🚀 Виконуємо всі тули паралельно через Promise.all...');
  const toolResults = await Promise.all(
    res.toolCalls.map(async (call) => {
      const args = JSON.parse(call.function.arguments);
      console.log(`   ⚙️ Обробка ${call.function.name}(${args.from} -> ${args.to}, amount: ${args.amount})...`);
      const result = await getRealExchangeRate(args.from, args.to, args.amount || 1);
      return {
        callId: call.id,
        name: call.function.name,
        result
      };
    })
  );

  // Додаємо кожен результат у messages з role: 'tool'
  for (const item of toolResults) {
    messages.push({
      role: 'tool',
      tool_call_id: item.callId,
      name: item.name,
      content: JSON.stringify(item.result)
    });
  }

  // 3-й крок: відправляємо всі результати назад моделі
  console.log('\n⏳ Відправляємо всі результати назад моделі для підсумку...');
  const finalRes = await ag.chat({
    model: 'Claude Sonnet 4.6 (Thinking)',
    messages
  });

  console.log('\n🤖 Фінальна відповідь асистента:');
  console.log('--------------------------------------------------');
  console.log(finalRes.text);
  console.log('--------------------------------------------------');
}

main().catch(console.error);
