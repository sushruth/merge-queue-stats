import { create } from 'zustand';
import { fetchMe, fetchToken, logOut, NotSignedInError, type Account } from '../core/auth';

export type LoginStatus = 'checking' | 'signed_out' | 'signed_in' | 'unavailable';
export type InstallCheck = 'idle' | 'checking' | 'not_found' | 'failed';

export interface AuthState {
  status: LoginStatus;
  login: string | null;
  accounts: Account[];
  owner: string | null;
  token: string | null;
  tokenError: string | null;
  installCheck: InstallCheck;
  checkLogin(): Promise<void>;
  recheckInstall(): Promise<void>;
  selectOwner(repoOwner: string | null): void;
  requestToken(): Promise<void>;
  renewRejectedToken(): void;
  logOut(): Promise<void>;
}

const signedOut = {
  login: null,
  accounts: [],
  owner: null,
  token: null,
  tokenError: null,
  installCheck: 'idle' as InstallCheck,
};

const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
  a?.toLowerCase() === b?.toLowerCase();

export const isInstalled = ({ accounts, owner }: Pick<AuthState, 'accounts' | 'owner'>): boolean =>
  accounts.some((account) => same(account.login, owner));

export const needsInstall = (state: Pick<AuthState, 'status' | 'accounts' | 'owner'>): boolean =>
  state.status === 'signed_in' && !isInstalled(state);

const RENEW_MARGIN_MS = 5 * 60e3;
const MIN_RENEW_DELAY_MS = 60e3;

let tokenRun = 0;
let tokenIssuedAt = 0;
let renewTimer: ReturnType<typeof setTimeout> | undefined;

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

  async recheckInstall() {
    const { status, installCheck } = get();
    if (status !== 'signed_in' || installCheck === 'checking') return;
    set({ installCheck: 'checking' });
    try {
      const { login, accounts } = await fetchMe();
      if (get().status !== 'signed_in') return;
      const { owner } = get();
      set({ login, accounts, installCheck: 'idle' });
      const current = get();
      if (!isInstalled(current)) set({ installCheck: 'not_found' });
      else if (same(current.owner, owner) && !current.token) void get().requestToken();
    } catch (e) {
      if (get().status !== 'signed_in') return;
      if (e instanceof NotSignedInError) set({ status: 'signed_out', ...signedOut });
      else set({ installCheck: 'failed' });
    }
  },

  selectOwner(repoOwner) {
    const { status, login, accounts, owner } = get();
    if (status !== 'signed_in') return;
    const fallback = accounts.find((account) => same(account.login, login)) ?? accounts[0];
    const next = repoOwner ?? owner ?? fallback?.login ?? null;
    if (same(next, owner)) return;
    tokenRun++;
    clearTimeout(renewTimer);
    set({ owner: next, token: null, tokenError: null, installCheck: 'idle' });
    if (isInstalled(get())) void get().requestToken();
  },

  async requestToken() {
    const { owner } = get();
    if (!owner) return;
    const run = ++tokenRun;
    clearTimeout(renewTimer);
    try {
      const { token, expires_at } = await fetchToken(owner);
      if (run !== tokenRun) return;
      tokenIssuedAt = Date.now();
      const expiresAt = Date.parse(expires_at ?? '');
      if (expiresAt) {
        const delay = Math.max(expiresAt - RENEW_MARGIN_MS - tokenIssuedAt, MIN_RENEW_DELAY_MS);
        renewTimer = setTimeout(() => void get().requestToken(), delay);
      }
      set({ token, tokenError: null });
    } catch (e) {
      if (run !== tokenRun) return;
      if (e instanceof NotSignedInError) set({ status: 'signed_out', ...signedOut });
      else set({ tokenError: e instanceof Error ? e.message : 'Request failed.' });
    }
  },

  renewRejectedToken() {
    if (Date.now() - tokenIssuedAt >= MIN_RENEW_DELAY_MS) void get().requestToken();
  },

  async logOut() {
    tokenRun++;
    clearTimeout(renewTimer);
    set({ token: null, tokenError: null });
    try {
      await logOut();
      set({ status: 'signed_out', ...signedOut });
    } catch {
      set({ status: 'unavailable', ...signedOut });
    }
  },
}));
