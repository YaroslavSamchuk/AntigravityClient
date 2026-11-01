import { Antigravity } from './src/index.js';

interface HeroProfile {
  name: string;
  role: string;
  level: number;
  skills: string[];
}

async function main() {
  console.log('🧪 Тестування Structured Outputs (відповіді за схемою)...\n');

  const ag = new Antigravity();

  // 1. Тест через ag.structured<T>()
  console.log('1️⃣ Виклик ag.structured<HeroProfile>():');
  const heroSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Ім\'я героя' },
      role: { type: 'string', description: 'Клас (воїн, маг тощо)' },
      level: { type: 'number', description: 'Рівень від 1 до 100' },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Список з 3 навичок'
      }
    },
    required: ['name', 'role', 'level', 'skills']
  };

  const hero = await ag.structured<HeroProfile>({
    model: 'gemini-3.8-flash-high',
    prompt: 'Створи сильного мага вогню на ім\'я Іґніс',
    schema: heroSchema
  });

  console.log('✅ Отримано чистий типізований об\'єкт:');
  console.log(hero);
  console.log(`Ім'я: ${hero.name}, Клас: ${hero.role}, Рівень: ${hero.level}`);
  console.log(`Навички: ${hero.skills.join(', ')}\n`);

  // 2. Тест через OpenAI response_format у ag.chat()
  console.log('2️⃣ Виклик ag.chat() із response_format (OpenAI standard):');
  const chatRes = await ag.chat({
    model: 'gemini-3.8-flash-high',
    prompt: 'Скільки буде 25 * 4 і коротко поясни',
    response_format: {
      type: 'json_schema',
      json_schema: {
        schema: {
          type: 'object',
          properties: {
            calculation: { type: 'string' },
            result: { type: 'number' },
            explanation: { type: 'string' }
          },
          required: ['calculation', 'result', 'explanation']
        }
      }
    }
  });

  console.log('✅ res.data:');
  console.log(chatRes.data);
  console.log('✅ res.text (сирий JSON):', chatRes.text);
}

main().catch(console.error);
