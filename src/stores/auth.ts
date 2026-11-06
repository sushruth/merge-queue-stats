import { create } from 'zustand';

export interface AuthState {
  token: string | null;
  setToken(token: string): void;
  clearToken(): void;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  setToken(token) {
    set({ token: token.trim() || null });
  },
  clearToken() {
    set({ token: null });
  },
}));
