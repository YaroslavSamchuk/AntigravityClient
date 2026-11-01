import { Antigravity } from './src/index.js';

async function main() {
  console.log('🧪 Тестування структури messages (OpenAI Multimodal format)...\n');

  const ag = new Antigravity();

  // Тест передачі messages з масивом контенту (text + image_url)
  const res = await ag.chat({
    model: 'gemini-3.8-flash-high',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Опиши коротко двома реченнями, що ти бачиш за цим посиланням:'
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

  console.log('✅ Отримана відповідь:');
  console.log(res.text);
}

main().catch(console.error);
