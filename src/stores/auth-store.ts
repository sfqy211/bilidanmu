import { create } from "zustand";
import type { Account } from "@/types/bilibili";

interface AuthState {
  accounts: Account[];
  sendAccountId: string | null;
  recvAccountId: string | null;
  stealthMode: boolean;
  setAccounts: (accounts: Account[]) => void;
  setSendAccountId: (id: string | null) => void;
  setRecvAccountId: (id: string | null) => void;
  setStealthMode: (enabled: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accounts: [],
  sendAccountId: null,
  recvAccountId: null,
  stealthMode: false,
  setAccounts: (accounts) => set({ accounts }),
  setSendAccountId: (sendAccountId) => set({ sendAccountId }),
  setRecvAccountId: (recvAccountId) => set({ recvAccountId }),
  setStealthMode: (stealthMode) => set({ stealthMode })
}));
