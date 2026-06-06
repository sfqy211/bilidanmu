import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Radio, Users } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { tauriCommands } from "@/lib/tauri";

interface AccountSwitcherProps {
  /** 观看账号 ID（弹幕/音频来源，来自 auth store 的 activeAccountId） */
  viewingAccountId: string | null;
}

export function AccountSwitcher({ viewingAccountId }: AccountSwitcherProps) {
  const { accounts, setActiveAccount } = useAuthStore();
  const [sendingAccountId, setSendingAccountId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // 打开窗口时的观看账号，auth store 初始化后固定不变
  const viewingAccountIdRef = useRef(viewingAccountId);
  useEffect(() => {
    if (!viewingAccountIdRef.current && viewingAccountId) {
      viewingAccountIdRef.current = viewingAccountId;
    }
  }, [viewingAccountId]);

  // 获取当前发送账号 ID
  useEffect(() => {
    void tauriCommands.auth.getSendingAccountId().then((id) => {
      setSendingAccountId(id);
    });
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 切换发送账号
  const handleSelect = useCallback(
    async (accountId: string) => {
      if (accountId === sendingAccountId) {
        setOpen(false);
        return;
      }
      try {
        const credential = await tauriCommands.auth.switchSendingAccount(accountId);
        setSendingAccountId(accountId);
        setActiveAccount(accountId, credential);
        setOpen(false);
      } catch (err) {
        console.error("切换发送账号失败:", err);
      }
    },
    [sendingAccountId, setActiveAccount],
  );

  if (accounts.length <= 1) return null;

  // 未手动切换时显示观看账号，切换后显示发送账号
  const effectiveSendingId = sendingAccountId ?? viewingAccountIdRef.current;
  const sendingAccount = accounts.find((a) => a.accountId === effectiveSendingId);
  const displayName = sendingAccount?.username ?? "切换账号";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300 dark:hover:bg-white/[0.04]"
      >
        <Users className="h-3.5 w-3.5" />
        {displayName}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/[0.06] dark:bg-[#12141e]">
          <div className="max-h-48 overflow-y-auto py-0.5">
            {accounts.map((account) => {
              const isSelected = account.accountId === effectiveSendingId;
              const isViewing = account.accountId === viewingAccountIdRef.current;

              return (
                <button
                  key={account.accountId}
                  type="button"
                  onClick={() => void handleSelect(account.accountId)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {account.username}
                  </span>
                  {isViewing && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-500 dark:bg-blue-500/10 dark:text-blue-400">
                      <Radio className="h-2.5 w-2.5" />
                      弹幕/音频
                    </span>
                  )}
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
