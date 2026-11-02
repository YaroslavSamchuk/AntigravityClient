/**
 * React Native & Expo Example (Pure Client, No Server)
 *
 * Install in your React Native / Expo project:
 *   npm install antigravity-client @react-native-async-storage/async-storage expo-web-browser
 */

import { Antigravity } from 'antigravity-client';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import * as WebBrowser from 'expo-web-browser';

// 1. Create client with AsyncStorage for session persistence
export const ag = new Antigravity({
  defaultModel: 'gemini-3.8-flash-high',
  // storage: {
  //   getItem: (key) => AsyncStorage.getItem(key),
  //   setItem: (key, val) => AsyncStorage.setItem(key, val),
  //   removeItem: (key) => AsyncStorage.removeItem(key)
  // }
});

// 2. Pure client OAuth flow with deep linking (myapp://oauth)
export async function loginWithGoogle() {
  const redirectUri = 'myapp://oauth';

  // Generates OAuth URL + PKCE verifier inside React Native
  const auth = await ag.getAuthUrl({ redirectUri });

  // Open browser for OAuth login
  // const result = await WebBrowser.openAuthSessionAsync(auth.url, redirectUri);
  // if (result.type === 'success') {
  //   const code = new URL(result.url).searchParams.get('code');
  //   if (code) {
  //     // Direct exchange with Google OAuth token endpoint (CORS/HTTPS supported)
  //     const session = await ag.exchangeCode({
  //       code,
  //       codeVerifier: auth.codeVerifier,
  //       redirectUri
  //     });
  //     return session.user;
  //   }
  // }
}

// 3. Streaming Chat directly from phone without any proxy/backend
export async function askAntigravity(prompt: string, onChunk: (text: string) => void) {
  // Direct HTTPS call to Antigravity endpoint (daily-cloudcode-pa.googleapis.com)
  for await (const chunk of ag.streamChat({
    prompt,
    model: 'gemini-3.8-flash-high' // Or 'claude-sonnet-4-6'
  })) {
    onChunk(chunk);
  }
}
