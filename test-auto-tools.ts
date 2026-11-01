import { Antigravity } from './src/index.js';

async function main() {
  const ag = new Antigravity();

  const currencyTool = {
    name: 'get_exchange_rate',
    description: 'Отримує актуальний курс валют та рахує суму.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        amount: { type: 'number' }
      },
      required: ['from', 'to']
    },
    // Реальна функція виконання під капотом тула
    execute: async ({ from, to, amount = 1 }: any) => {
      console.log(`⚡ [AutoRunner виконує]: ${amount} ${from} -> ${to}`);
      const res = await fetch(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
      const data = await res.json();
      const rate = data.rates[to.toUpperCase()];
      return { from, to, rate, amount, total: Number((amount * rate).toFixed(2)) };
    }
  };

  console.log('🚀 Викликаємо ag.chat() з parallel_tool_calls: true та auto-execute...\n');

  // Лише один виклик — жодних циклів вручну!
  const res = await ag.chat({
    model: 'gemini-3.8-flash-high',
    messages: [
      { role: 'user', content: 'Порівняй: скільки буде 100 USD в UAH та 100 EUR в UAH?' }
    ],
    tools: [currencyTool],
    parallel_tool_calls: true
  });

  console.log('\n✅ Фінальна відповідь (кроків виконано: ' + (res.steps || 1) + '):');
  console.log('--------------------------------------------------');
  console.log(res.text);
  console.log('--------------------------------------------------');
}

main().catch(console.error);
