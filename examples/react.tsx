import { useState, useEffect } from 'react';
import { Antigravity, LocalStorageAdapter } from 'antigravity-client';

// 1. Ініціалізація клієнта
const ag = new Antigravity({
  storage: new LocalStorageAdapter(),
  baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined
});

interface Message {
  role: 'user' | 'model';
  content: string;
}

export function AntigravityChat() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 2. Обробка OAuth Callback та перевірка поточної сесії
  useEffect(() => {
    async function initAuth() {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const verifier = sessionStorage.getItem('pkce_verifier');

      if (code && verifier) {
        try {
          await ag.exchangeCode({
            code,
            codeVerifier: verifier,
            redirectUri: window.location.origin + window.location.pathname
          });
          setIsAuthenticated(true);
        } finally {
          sessionStorage.removeItem('pkce_verifier');
          window.history.replaceState({}, '', window.location.pathname);
        }
        return;
      }

      const isAuth = await ag.isAuthenticated();
      setIsAuthenticated(isAuth);
    }

    initAuth();
  }, []);

  // 3. Вхід через Google OAuth (PKCE)
  const handleLogin = async () => {
    const redirectUri = window.location.origin + window.location.pathname;
    const auth = await ag.getAuthUrl({ redirectUri });
    sessionStorage.setItem('pkce_verifier', auth.codeVerifier);
    window.location.href = auth.url;
  };

  // 4. Вихід
  const handleLogout = async () => {
    await ag.logout();
    setIsAuthenticated(false);
    setMessages([]);
  };

  // 5. Звичайний виклик AI Chat (без стріму)
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);

    const updated: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages(updated);

    try {
      const res = await ag.chat({
        prompt: userText,
        model: 'gemini-3.8-flash-high' // або 'claude-sonnet-4-6', 'claude-opus-4-6-thinking'
      });

      setMessages([...updated, { role: 'model', content: res.text }]);
    } catch (err: any) {
      setMessages([...updated, { role: 'model', content: `Помилка: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthenticated === null) {
    return <div>Завантаження...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Вхід до Antigravity AI</h2>
        <button onClick={handleLogin}>Увійти через Google</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>Antigravity Chat</h3>
        <button onClick={handleLogout}>Вийти</button>
      </div>

      <div style={{ minHeight: 300, border: '1px solid #ccc', padding: 12, borderRadius: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <strong>{m.role === 'user' ? 'Ви: ' : 'AI: '}</strong>
            <span>{m.content}</span>
          </div>
        ))}
        {isLoading && <div>AI думає...</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          value={input}
          placeholder="Напишіть повідомлення..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button disabled={isLoading || !input.trim()} onClick={handleSend}>
          Надіслати
        </button>
      </div>
    </div>
  );
}
