import { Antigravity } from './src/index.js';

async function main() {
  const ag = new Antigravity();

  console.log('⏱️ Вимірювання TTFT (Time To First Token) та загального часу:\n');

  // Тест 1: Gemini 3.8 Flash High
  console.log('1️⃣ Тестування gemini-3.8-flash-high:');
  const t0 = Date.now();
  let firstChunkTime = 0;
  let chunkCount = 0;

  for await (const chunk of ag.streamChat({
    model: 'gemini-3.8-flash-high',
    messages: [{ role: 'user', content: 'Привіт! Скажи одне речення про сонце.' }]
  })) {
    if (!firstChunkTime) {
      firstChunkTime = Date.now() - t0;
    }
    chunkCount++;
  }
  const totalTime = Date.now() - t0;
  console.log(`   ⚡ Перший токен (TTFT): ${firstChunkTime} ms`);
  console.log(`   🏁 Повний час відповіді: ${totalTime} ms (${chunkCount} chunks)\n`);

  // Тест 2: Claude Sonnet 4.6 Thinking
  console.log('2️⃣ Тестування Claude Sonnet 4.6 (Thinking):');
  const t1 = Date.now();
  let claudeFirstChunkTime = 0;
  let claudeChunkCount = 0;

  for await (const chunk of ag.streamChat({
    model: 'Claude Sonnet 4.6 (Thinking)',
    messages: [{ role: 'user', content: 'Привіт! Скажи одне речення про місяць.' }]
  })) {
    if (!claudeFirstChunkTime) {
      claudeFirstChunkTime = Date.now() - t1;
    }
    claudeChunkCount++;
  }
  const claudeTotalTime = Date.now() - t1;
  console.log(`   ⚡ Перший токен (TTFT): ${claudeFirstChunkTime} ms`);
  console.log(`   🏁 Повний час відповіді: ${claudeTotalTime} ms (${claudeChunkCount} chunks)\n`);
}

main().catch(console.error);
