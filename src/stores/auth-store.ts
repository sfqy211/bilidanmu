import { create } from "zustand";
import type { Credential } from "@/types/bilibili";

interface AuthState {
  accounts: Credential[];
  activeAccountId: string | null;
  setAccounts: (accounts: Credential[]) => void;
  addAccount: (account: Credential) => void;
  removeAccount: (accountId: string, newActiveAccountId?: string | null) => void;
  setActiveAccount: (accountId: string | null, account?: Credential) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accounts: [],
  activeAccountId: null,
  setAccounts: (accounts) => set({ accounts }),
  addAccount: (account) =>
    set((state) => {
      const existing = state.accounts.findIndex((a) => a.accountId === account.accountId);
      const next = [...state.accounts];
      if (existing >= 0) {
        next[existing] = account;
      } else {
        next.push(account);
      }
      return { accounts: next, activeAccountId: account.accountId };
    }),
  removeAccount: (accountId, newActiveAccountId) =>
    set((state) => ({
      accounts: state.accounts.filter((a) => a.accountId !== accountId),
      activeAccountId: newActiveAccountId !== undefined
        ? newActiveAccountId
        : state.activeAccountId === accountId
          ? null
          : state.activeAccountId,
    })),
  setActiveAccount: (accountId, account) =>
    set((state) => ({
      activeAccountId: accountId,
      accounts: account && accountId
        ? state.accounts.map((a) => (a.accountId === accountId ? account : a))
        : state.accounts,
    })),
  clearAuth: () => set({ accounts: [], activeAccountId: null }),
}));
