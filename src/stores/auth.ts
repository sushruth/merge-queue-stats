import { create } from 'zustand';
import { fetchMe, fetchToken, logOut, NotSignedInError, type Account } from '../core/auth';

export type LoginStatus = 'checking' | 'signed_out' | 'signed_in' | 'unavailable';

export interface AuthState {
  status: LoginStatus;
  login: string | null;
  accounts: Account[];
  owner: string | null;
  token: string | null;
  tokenError: string | null;
  checkLogin(): Promise<void>;
  selectOwner(repoOwner: string | null): void;
  requestToken(): Promise<void>;
  logOut(): Promise<void>;
}

const signedOut = {
  login: null,
  accounts: [],
  owner: null,
  token: null,
  tokenError: null,
};

const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
  a?.toLowerCase() === b?.toLowerCase();

export const isInstalled = ({ accounts, owner }: Pick<AuthState, 'accounts' | 'owner'>): boolean =>
  accounts.some((account) => same(account.login, owner));

let tokenRun = 0;

export const useAuth = create<AuthState>((set, get) => ({
  status: 'checking',
  ...signedOut,

  async checkLogin() {
    try {
      const { login, accounts } = await fetchMe();
      set({ status: 'signed_in', login, accounts });
    } catch (e) {
      set({ status: e instanceof NotSignedInError ? 'signed_out' : 'unavailable', ...signedOut });
    }
  },

  selectOwner(repoOwner) {
    const { status, login, accounts, owner } = get();
    if (status !== 'signed_in') return;
    const fallback = accounts.find((account) => same(account.login, login)) ?? accounts[0];
    const next = repoOwner ?? owner ?? fallback?.login ?? null;
    if (same(next, owner)) return;
    tokenRun++;
    set({ owner: next, token: null, tokenError: null });
    if (isInstalled(get())) void get().requestToken();
  },

  async requestToken() {
    const { owner } = get();
    if (!owner) return;
    const run = ++tokenRun;
    try {
      const { token } = await fetchToken(owner);
      if (run === tokenRun) set({ token, tokenError: null });
    } catch (e) {
      if (run !== tokenRun) return;
      if (e instanceof NotSignedInError) set({ status: 'signed_out', ...signedOut });
      else set({ tokenError: e instanceof Error ? e.message : 'Request failed.' });
    }
  },

  async logOut() {
    tokenRun++;
    set({ token: null, tokenError: null });
    try {
      await logOut();
      set({ status: 'signed_out', ...signedOut });
    } catch {
      set({ status: 'unavailable', ...signedOut });
    }
  },
}));
