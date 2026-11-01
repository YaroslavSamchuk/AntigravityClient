import { Antigravity } from './src/index.js';

async function main() {
  console.log('🌌 Тестування відправки масиву повідомлень (messages)...\n');

  const ag = new Antigravity();

  // 1. Пряма відправка масиву повідомлень (як в OpenAI / Anthropic)
  console.log('💬 Тест 1: Передача масиву повідомлень (Claude Sonnet 4.6 Thinking)...');
  const res = await ag.chat({
    model: 'Claude Sonnet 4.6 (Thinking)',
    messages: [
      { role: 'system', content: 'Ти стислий асистент. Відповідай суворо одним реченням.' },
      { role: 'user', content: 'Мене звати Ярослав і я створюю власну бібліотеку.' },
      { role: 'assistant', content: 'Приємно познайомитись, Ярославе! Бажаю успіхів у розробці бібліотеки.' },
      { role: 'user', content: 'Нагадай, як мене звати і чим я займаюсь?' }
    ]
  });

  console.log(`\nВідповідь моделі (${res.durationMs}ms):`);
  console.log(`"${res.text}"`);

  // 2. Стрімінг масиву повідомлень
  console.log('\n⚡ Тест 2: Стрімінг діалогу (Gemini 3.8 Flash)...');
  process.stdout.write('   Відповідь: ');
  for await (const chunk of ag.streamChat([
    { role: 'user', content: 'Скільки континентів на Землі? Назви їх списком.' }
  ])) {
    process.stdout.write(chunk);
  }

  console.log('\n\n✅ Усе працює без жодної мороки з об\'єктами!');
}

main().catch(console.error);
