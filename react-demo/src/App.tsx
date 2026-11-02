import { useState, useEffect, useRef } from 'react';
import { ag } from './ag.js';
import type { AntigravityModel, AntigravityUser, ChatMessage } from 'antigravity-client';
import './App.css';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AntigravityUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat state (сумісний з OpenAI ChatMessage[])
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Привіт! Я підключений до Antigravity API. Задайте будь-яке запитання.'
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<AntigravityModel>('gemini-3.8-flash-high');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Перевірка авторизації та обробка OAuth редиректу
  useEffect(() => {
    async function initAuth() {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const verifier = sessionStorage.getItem('pkce_verifier');

      // 1. Повернення після Google OAuth
      if (code && verifier) {
        try {
          const session = await ag.exchangeCode({
            code,
            codeVerifier: verifier,
            redirectUri: window.location.origin + window.location.pathname
          });
          setUser(session.user);
          setIsAuthenticated(true);
        } catch (err: any) {
          setError(`Помилка OAuth: ${err.message}`);
          setIsAuthenticated(false);
        } finally {
          sessionStorage.removeItem('pkce_verifier');
          window.history.replaceState({}, '', window.location.pathname);
        }
        return;
      }

      // 2. Перевірка збереженої сесії
      try {
        const isAuth = await ag.isAuthenticated();
        if (isAuth) {
          const profile = await ag.getUser();
          setUser(profile);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      }
    }

    initAuth();
  }, []);

  // Вхід через Google
  const handleLogin = async () => {
    setError(null);
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const auth = await ag.getAuthUrl({ redirectUri });
      sessionStorage.setItem('pkce_verifier', auth.codeVerifier);
      window.location.href = auth.url;
    } catch (err: any) {
      setError(`Не вдалося запустити авторизацію: ${err.message}`);
    }
  };

  // Вихід
  const handleLogout = async () => {
    await ag.logout();
    setIsAuthenticated(false);
    setUser(null);
    setMessages([]);
  };

  // Надсилання повідомлення (звичайний Chat з історією, сумісний з OpenAI)
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);

    const userMessage: ChatMessage = { role: 'user', content: userText };
    const updated = [...messages, userMessage];
    setMessages(updated);

    try {
      const res = await ag.chat({
        messages: updated,
        model: selectedModel
      });

      setMessages([...updated, { role: 'assistant', content: res.text }]);
    } catch (err: any) {
      setMessages([...updated, { role: 'assistant', content: `❌ Помилка: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Стан завантаження сесії
  if (isAuthenticated === null) {
    return (
      <div className="container">
        <div className="status-box">
          <p>Завантаження сесії...</p>
        </div>
      </div>
    );
  }

  // 1. Екран авторизації
  if (!isAuthenticated) {
    return (
      <div className="container">
        <div className="auth-card">
          <h1>Antigravity AI Client 🌌</h1>
          <p>Вхід через Google OAuth (PKCE) для доступу до Antigravity моделей</p>

          {error && <div className="status-box error">{error}</div>}

          <button className="btn-google" onClick={handleLogin}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Увійти через Google
          </button>
        </div>
      </div>
    );
  }

  // 2. Екран чату
  return (
    <div className="container">
      <header className="chat-header">
        <div className="user-info">
          <div className="avatar">
            {user?.picture ? (
              <img src={user.picture} alt="Avatar" />
            ) : (
              (user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()
            )}
          </div>
          <div>
            <strong>{user?.name || 'Користувач'}</strong>
            <div style={{ fontSize: 12, color: '#666' }}>{user?.email || ''}</div>
          </div>
        </div>

        <div className="header-actions">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as AntigravityModel)}
          >
            {ag.getAvailableModels().map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button className="btn-logout" onClick={handleLogout}>
            Вийти
          </button>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div>
              {typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                ? msg.content.map((p) => (typeof p === 'string' ? p : ('text' in p ? p.text : JSON.stringify(p)))).join('\n')
                : ''}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="loading-dots">Генерація відповіді...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="input-row">
          <textarea
            placeholder="Введіть запитання... (Enter для надсилання)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <button
            className="btn-send"
            disabled={!input.trim() || isLoading}
            onClick={handleSendMessage}
          >
            {isLoading ? '...' : 'Надіслати'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
