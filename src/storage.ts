import type { StorageAdapter } from './types.js';

/**
 * Universal in-memory storage adapter (default for all environments).
 */
export class MemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Safe LocalStorage adapter for Web and React browser applications.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'antigravity:') {
    this.prefix = prefix;
  }

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  getItem(key: string): string | null {
    if (!this.isAvailable()) return null;
    try {
      return window.localStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.setItem(this.prefix + key, value);
    } catch {
      // Ignore storage errors (quota exceeded / private mode)
    }
  }

  removeItem(key: string): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.removeItem(this.prefix + key);
    } catch {
      // Ignore
    }
  }
}
