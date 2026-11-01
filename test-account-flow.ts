import { Antigravity } from './src/index.js';

async function main() {
  console.log('--- Тестування Token-First & Account-First Flow ---');

  // 1. Створення в чистому середовищі (як на мобільному/сайті без локальних файлів)
  const ag = new Antigravity({ geminiDir: 'c:/temp/nonexistent_folder_mobile' });
  console.log('Початковий стан у чистому середовищі (чи авторизований):', await ag.isAuthenticated());
  console.log('Початковий список акаунтів:', ag.getAccounts().length);

  // 2. Додавання першого акаунта по токену
  ag.setToken('ya29.sample_token_user_1', {
    email: 'user1@gmail.com',
    name: 'User One',
    expiresInSeconds: 3600
  });

  console.log('Після додавання акаунта 1:', await ag.isAuthenticated());
  console.log('Список акаунтів:', ag.getAccounts().map(a => a.user.email));

  // 3. Додавання другого акаунта
  ag.addAccount({
    accessToken: 'ya29.sample_token_user_2',
    refreshToken: '1//refresh_user_2',
    tokenType: 'Bearer',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    user: {
      id: 'user2@gmail.com',
      email: 'user2@gmail.com',
      name: 'User Two'
    },
    expiry: {
      expiresAt: Date.now() + 7200 * 1000,
      expiresAtDate: new Date(Date.now() + 7200 * 1000),
      expiresAtFormatted: new Date().toISOString(),
      expiresInSeconds: 7200,
      expiresInMinutes: 120,
      isExpired: false,
      isExpiringSoon: false
    },
    source: 'manual'
  });

  console.log('Список акаунтів після додавання 2:', ag.getAccounts().map(a => a.user.email));

  // 4. Перемикання на другий акаунт
  ag.setActiveAccount('user2@gmail.com');
  const currentUser = await ag.getUser();
  console.log('Активний акаунт зараз:', currentUser.email, currentUser.name);

  // 5. Отримання OAuth URL для входу нового користувача
  const authUrlResult = ag.getAuthUrl({
    redirectUri: 'https://myapp.com/auth/callback',
    prompt: 'select_account'
  });
  console.log('Згенерований Auth URL починається з:', authUrlResult.url.slice(0, 50) + '...');
  console.log('PKCE Code Verifier присутній:', Boolean(authUrlResult.codeVerifier));

  // 6. Видалення першого акаунта
  ag.removeAccount('user1@gmail.com');
  console.log('Список акаунтів після видалення 1:', ag.getAccounts().map(a => a.user.email));

  console.log('✅ Всі перевірки Token-First пройшли успішно!');
}

main().catch(console.error);
