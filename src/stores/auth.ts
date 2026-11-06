import { create } from 'zustand';
import { readText, remove, TOKEN_KEY, writeText, type WriteResult } from '../core/storage';

function devToken(): string | null {
  return import.meta.env.DEV ? import.meta.env.VITE_DEV_GITHUB_TOKEN || null : null;
}

export interface AuthState {
  token: string | null;
  saveResult: WriteResult;
  setToken(token: string): void;
  clearToken(): void;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: readText(TOKEN_KEY) || devToken(),
  saveResult: 'ok',

  setToken(token) {
    const value = token.trim();
    if (!value) return get().clearToken();
    set({ token: value, saveResult: writeText(TOKEN_KEY, value) });
  },
  clearToken() {
    remove(TOKEN_KEY);
    set({ token: null, saveResult: 'ok' });
  },
}));
