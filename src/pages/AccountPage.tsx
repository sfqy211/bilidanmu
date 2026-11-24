import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Eye, KeyRound, Loader2, LogOut, Plus, RefreshCw, UserRound, X } from "lucide-react";
import { getAllWindows } from "@tauri-apps/api/window";
import { toDataURL } from "qrcode";
import { ANONYMOUS_ACCOUNT_ID } from "@/lib/constants";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useAuth } from "@/hooks/useAuth";
import { useSettingsStore } from "@/stores/settings-store";
import { PageHeader } from "@/components/layout/PageHeader";

export function AccountPage() {
  const { t: translate } = useDesktopTranslation("desktop");
  const showAvatars = useSettingsStore((state) => state.settings.showAvatars);
  const {
    accounts,
    activeAccountId,
    addAccount,
    removeAccount,
    setActiveAccount,
  } = useAuth();

  const [showAdd, setShowAdd] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"waiting" | "scanned" | "qrExpired" | "scanHint" | null>(null);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const showError = (msg: string) => { setError(msg); setSuccess(null); setMsgKey((k) => k + 1); };
  const showSuccess = (msg: string) => { setSuccess(msg); setError(null); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); setSuccess(null); };

  // 轮询 TV 扫码状态
  useEffect(() => {
    if (!authCode) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const result = await tauriCommands.auth.pollTvQr(authCode);
        if (cancelled) return;

        if (result.status === "pending" || result.status === "scanned") {
          setQrStatus(result.status === "scanned" ? "scanned" : "waiting");
        }

        if (result.status === "success" && result.credential) {
          addAccount(result.credential);
          showSuccess(desktopI18n.t("desktop:account.signedIn"));
          resetQr();
          setShowAdd(false);
        }

        if (result.status === "expired") {
          setQrStatus("qrExpired");
          setAuthCode(null);
        }
      } catch (pollError) {
        if (!cancelled) {
          showError(pollError instanceof Error ? pollError.message : desktopI18n.t("desktop:account.pollFailed"));
          resetQr();
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authCode, addAccount]);

  const resetQr = () => {
    setAuthCode(null);
    setQrImageUrl(null);
    setQrStatus(null);
  };

  const handleCreateQr = async () => {
    setLoading(true);
    clearMessage();

    try {
      const result = await tauriCommands.auth.loginByTvQr();
      const imageUrl = await toDataURL(result.url, {
        margin: 1,
        width: 180,
        color: { dark: "#111827", light: "#ffffff" },
      });
      setQrImageUrl(imageUrl);
      setAuthCode(result.authCode);
      setQrStatus("scanHint");
    } catch (qrError) {
      showError(qrError instanceof Error ? qrError.message : translate("account.qrFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setShowWarning(true);
  };

  const handleConfirmWarning = () => {
    setShowWarning(false);
    setShowAdd(true);
    void handleCreateQr();
  };

  const handleCloseAdd = () => {
    setShowAdd(false);
    resetQr();
    clearMessage();
  };

  const handleRemoveAccount = async (accountId: string) => {
    try {
      const windows = await getAllWindows();
      if (windows.some((w) => w.label.startsWith("danmaku-"))) {
        showError(translate("account.closeToRemove"));
        return;
      }
    } catch { /* ignore */ }

    try {
      const newActiveId = await tauriCommands.auth.removeAccount(accountId);
      removeAccount(accountId, newActiveId);
      showSuccess(translate("account.removed"));
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : translate("account.removeFailed"));
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    try {
      const windows = await getAllWindows();
      if (windows.some((w) => w.label.startsWith("danmaku-"))) {
        showError(translate("account.closeToSwitch"));
        return;
      }
    } catch { /* ignore */ }

    setSwitchingId(accountId);
    clearMessage();
    try {
      const credential = await tauriCommands.auth.switchAccount(accountId);
      setActiveAccount(accountId, credential);
      showSuccess(translate("account.switched", { value: credential.username }));
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : translate("account.switchFailed"));
    } finally {
      setSwitchingId(null);
    }
  };

  const handleSwitchToAnonymous = async () => {
    try {
      const windows = await getAllWindows();
      if (windows.some((w) => w.label.startsWith("danmaku-"))) {
        showError(translate("account.closeToAnonymous"));
        return;
      }
    } catch { /* ignore */ }

    setSwitchingId(ANONYMOUS_ACCOUNT_ID);
    clearMessage();
    try {
      const credential = await tauriCommands.auth.switchToAnonymous();
      setActiveAccount(ANONYMOUS_ACCOUNT_ID, credential);
      showSuccess(translate("account.switchedAnonymous"));
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : translate("account.anonymousFailed"));
    } finally {
      setSwitchingId(null);
    }
  };

  const handleRefreshInfo = async (accountId: string) => {
    setRefreshingId(accountId);
    clearMessage();
    try {
      const credential = await tauriCommands.auth.refreshAccountInfo(accountId);
      addAccount(credential);
      showSuccess(translate("account.refreshed"));
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : translate("account.refreshFailed"));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRefreshCookie = async (accountId: string) => {
    setRefreshingId(accountId);
    clearMessage();
    try {
      const credential = await tauriCommands.auth.refreshCookie(accountId);
      addAccount(credential);
      showSuccess(translate("account.cookieRefreshed"));
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : translate("account.cookieFailed"));
    } finally {
      setRefreshingId(null);
    }
  };

  const getExpiryText = (expiresAt?: number): { text: string; color: string } => {
    if (!expiresAt) return { text: translate("account.expiryUnknown"), color: "text-slate-400 dark:text-slate-500" };
    const now = Date.now() / 1000;
    if (expiresAt <= now) return { text: translate("account.expired"), color: "text-rose-500 dark:text-rose-400" };
    const days = Math.floor((expiresAt - now) / 86400);
    if (days <= 0) return { text: translate("account.expiresToday"), color: "text-amber-500 dark:text-amber-400" };
    const text = translate("account.expires", { count: days });
    return { text, color: days <= 10 ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400" };
  };

  return (
    <section className="flex h-full min-h-0 flex-col select-none">
      <PageHeader title={translate("account.title")} description={translate("account.description")} actions={
        <div className="flex flex-wrap items-center gap-2">
          {!showAdd && !showWarning && (
            <>
              <button
                onClick={() => void handleSwitchToAnonymous()}
                disabled={switchingId === ANONYMOUS_ACCOUNT_ID || activeAccountId === ANONYMOUS_ACCOUNT_ID}
                className="workspace-button"
              >
                {switchingId === ANONYMOUS_ACCOUNT_ID ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {translate("account.anonymous")}
              </button>
              <button
                onClick={handleOpenAdd}
                className="workspace-button workspace-button-primary"
              >
                <Plus className="h-4 w-4" />
                {translate("account.add")}
              </button>
            </>
          )}
        </div>
      } />
      {error && <InlineMessage key={msgKey} type="error" className="mb-3">{error}</InlineMessage>}
      {success && <InlineMessage key={msgKey} type="success" className="mb-3">{success}</InlineMessage>}

      {showWarning ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex w-full max-w-lg flex-col items-center rounded-lg bg-app-surface p-6 shadow-sm dark:bg-app-surface dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-medium text-ink">{translate("account.risk")}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {translate("account.requestDisclosure")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {translate("account.responsibility")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {translate("account.consent")}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowWarning(false)}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.04]"
              >
                {translate("account.cancel")}
              </button>
              <button
                onClick={handleConfirmWarning}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90"
              >
                {translate("account.continue")}
              </button>
            </div>
          </div>
        </div>
      ) : showAdd ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex w-full max-w-sm flex-col items-center rounded-lg bg-app-surface p-6 shadow-sm dark:bg-app-surface dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex w-full items-center justify-between">
              <h3 className="text-base font-medium text-ink">{translate("account.scan")}</h3>
              <button
                onClick={handleCloseAdd}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-ink/[0.05] dark:text-slate-500 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 self-start text-xs text-ink-muted">
              {translate("account.scanDescription")}
            </p>

            <div className="mt-5 flex flex-col items-center gap-4">
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt={translate("account.qrImage")}
                  className="h-[180px] w-[180px] bg-white"
                />
              ) : (
                <div className="flex h-[180px] w-[180px] items-center justify-center bg-app-surface dark:bg-app-page">
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-xs text-slate-400">{translate("account.qrEmpty")}</span>
                  )}
                </div>
              )}

              <button
                onClick={() => void handleCreateQr()}
                disabled={loading}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? translate("account.generating") : authCode ? translate("account.refreshQr") : translate("account.generateQr")}
              </button>

              {qrStatus && (
                <p className="text-xs text-slate-400 dark:text-slate-500">{translate(`account.${qrStatus}`)}</p>
              )}
            </div>
          </div>
        </div>
      ) : accounts.length === 0 && activeAccountId !== ANONYMOUS_ACCOUNT_ID ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="py-10 text-center text-sm text-ink-muted">
            {translate("account.noAccount")}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 账号列表：行卡浮在页面底色上，与直播间主页同一套视觉 */}
          <div className="list-card">
          {/* 匿名模式条目 */}
          {activeAccountId === ANONYMOUS_ACCOUNT_ID && (
            <div className="workspace-account-row" data-current="true">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-ink-muted">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-medium text-ink">{translate("account.anonymous")}</p>
                  <span className="inline-flex items-center gap-1 rounded bg-brand/15 px-1.5 py-0.5 text-xs font-medium text-brand">
                    <Check className="h-3 w-3" />
                    {translate("account.current")}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-muted">{translate("account.receiveOnly")}</p>
              </div>
            </div>
          )}

          {/* 已登录账号列表 */}
          {accounts.map((account) => {
            const isActive = account.accountId === activeAccountId;
            const isSwitching = switchingId === account.accountId;
            const isRefreshing = refreshingId === account.accountId;
            // 跳过匿名模式条目（已在上方单独显示）
            if (account.accountId === ANONYMOUS_ACCOUNT_ID) return null;
            const expiry = getExpiryText(account.expiresAt);
            return (
              <div
                key={account.accountId}
                className="workspace-account-row"
                data-current={isActive}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {showAvatars && (account.avatar ? (
                    <ProxiedImage
                      src={account.avatar}
                      alt={account.username}
                      persistent
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-ink-muted">
                      <UserRound className="h-5 w-5" />
                    </div>
                  ))}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-ink" title={account.username}>{account.username}</p>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded bg-brand/15 px-1.5 py-0.5 text-xs font-medium text-brand">
                          <Check className="h-3 w-3" />
                          {translate("account.current")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-muted">
                      UID: {account.uid}
                      <span className={expiry.color}>{expiry.text}</span>
                    </p>
                  </div>
                </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleRefreshInfo(account.accountId)}
                      disabled={isRefreshing}
                      title={translate("account.refresh")}
                      className="p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                    >
                      {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => void handleRefreshCookie(account.accountId)}
                      disabled={isRefreshing}
                      title={translate("account.renew")}
                      className="p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => void handleSwitchAccount(account.accountId)}
                        disabled={isSwitching}
                        title={translate("account.switch")}
                        className="p-1.5 text-brand transition hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-brand dark:hover:bg-brand/10"
                      >
                        {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => void handleRemoveAccount(account.accountId)}
                      title={translate("account.remove")}
                      className="p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </section>
  );
}
