import { Antigravity, MemoryStorage, LocalStorageAdapter } from '../src/index.js';

async function main() {
  console.log('🌌 Testing Universal Antigravity Client...');

  // 1. Initializing client with direct token or API key
  // On Mobile (React Native) or Web (React), pass token from your backend or OAuth
  const ag = new Antigravity({
    token: 'ya29.sample_or_real_token',
    defaultModel: 'gemini-2.5-flash',
    storage: new MemoryStorage() // or new LocalStorageAdapter() in React Web
  });

  console.log('✅ Client created successfully');
  console.log('Available models:', ag.getAvailableModels());

  // 2. Generating OAuth PKCE Auth URL (Universal: Works in React, React Native, Expo, Browser)
  const authUrlData = await ag.getAuthUrl({
    redirectUri: 'https://myapp.com/callback'
  });
  console.log('\nGenerated OAuth URL:', authUrlData.url.slice(0, 80) + '...');
  console.log('PKCE Code Verifier:', authUrlData.codeVerifier.slice(0, 20) + '...');

  // 3. Example Chat syntax (messages history or simple prompt)
  console.log('\nChat call structure ready for pure HTTP execution without any binary or node modules!');
}

main().catch(console.error);
