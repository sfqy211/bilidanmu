import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Radio, Users } from "lucide-react";
import { PanelListRow, PanelShell } from "@/components/ui/DanmakuPanel";
import { usePanelDismiss } from "@/hooks/usePanelDismiss";
import { useAuthStore } from "@/stores/auth-store";
import { tauriCommands } from "@/lib/tauri";

interface AccountSwitcherProps {
  /** 观看账号 ID（弹幕/音频来源，来自 auth store 的 activeAccountId） */
  viewingAccountId: string | null;
}

export function AccountSwitcher({ viewingAccountId }: AccountSwitcherProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const { accounts, setActiveAccount, isAnonymous } = useAuthStore();
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

  usePanelDismiss({
    open,
    onClose: () => setOpen(false),
    ignoreRef: containerRef,
  });

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

  // 匿名模式下只显示"匿名模式"标签，不显示下拉
  if (isAnonymous) {
    return (
      <div className="inline-flex items-center gap-1 rounded-md bg-[var(--panel-control-bg)] px-2.5 py-1 text-xs text-ink-muted">
        <Users className="h-3.5 w-3.5" />
        {translate("sender.anonymous")}
      </div>
    );
  }

  if (accounts.length <= 1) return null;

  // 未手动切换时显示观看账号，切换后显示发送账号
  const effectiveSendingId = sendingAccountId ?? viewingAccountIdRef.current;
  const sendingAccount = accounts.find((a) => a.accountId === effectiveSendingId);
  const displayName = sendingAccount?.username ?? translate("sender.switch");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={displayName}
        aria-label={displayName}
        aria-expanded={open}
        className="panel-icon-btn text-sm font-bold"
        data-active={open ? "true" : "false"}
      >
        {displayName.charAt(0).toUpperCase()}
      </button>

      {open && (
        <PanelShell
          variant="menu"
          hideHeader
          ariaLabel={translate("sender.switchSender")}
          maxHeight="192px"
          className="absolute bottom-full left-0 z-50 mb-1 w-48"
        >
          <div className="panel-list">
            {accounts.map((account) => {
              const isSelected = account.accountId === effectiveSendingId;
              const isViewing = account.accountId === viewingAccountIdRef.current;

              return (
                <PanelListRow
                  key={account.accountId}
                  label={account.username}
                  icon={
                    <span className="flex h-5 w-5 items-center justify-center text-sm font-bold">
                      {account.username.charAt(0).toUpperCase()}
                    </span>
                  }
                  selected={isSelected}
                  right={
                    <span className="flex items-center gap-1">
                      {isViewing && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-500 dark:bg-blue-500/10 dark:text-blue-400">
                          <Radio className="h-2.5 w-2.5" />
                          {translate("sender.receive")}
                        </span>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                  }
                  onClick={() => void handleSelect(account.accountId)}
                />
              );
            })}
          </div>
        </PanelShell>
      )}
    </div>
  );
}
