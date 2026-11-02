import { Antigravity, LocalStorageAdapter } from 'antigravity-client';

// Client initialized with local storage persistence and browser dev proxy
export const ag = new Antigravity({
  storage: new LocalStorageAdapter(),
  baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined
});
