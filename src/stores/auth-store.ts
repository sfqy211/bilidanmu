import { create } from "zustand";
import type { Credential } from "@/types/bilibili";

interface AuthState {
  accounts: Credential[];
  activeAccountId: string | null;
  setAccounts: (accounts: Credential[]) => void;
  addAccount: (account: Credential) => void;
  removeAccount: (accountId: string) => void;
  setActiveAccount: (accountId: string, account: Credential) => void;
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
  removeAccount: (accountId) =>
    set((state) => ({
      accounts: state.accounts.filter((a) => a.accountId !== accountId),
      activeAccountId: state.activeAccountId === accountId ? null : state.activeAccountId,
    })),
  setActiveAccount: (accountId, account) =>
    set((state) => ({
      activeAccountId: accountId,
      accounts: state.accounts.map((a) => (a.accountId === accountId ? account : a)),
    })),
  clearAuth: () => set({ accounts: [], activeAccountId: null }),
}));
