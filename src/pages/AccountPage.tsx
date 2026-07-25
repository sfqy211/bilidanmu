import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Eye, KeyRound, Loader2, LogOut, Plus, RefreshCw, UserRound, X } from "lucide-react";
import { getAllWindows } from "@tauri-apps/api/window";
import { toDataURL } from "qrcode";
import { ANONYMOUS_ACCOUNT_ID } from "@/lib/constants";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useAuth } from "@/hooks/useAuth";

export function AccountPage() {
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
  const [qrStatus, setQrStatus] = useState<string>("");
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

        setQrStatus(result.message ?? "等待扫码...");

        if (result.status === "success" && result.credential) {
          addAccount(result.credential);
          showSuccess("扫码登录成功");
          resetQr();
          setShowAdd(false);
        }

        if (result.status === "expired") {
          setQrStatus("二维码已过期，点击刷新");
          setAuthCode(null);
        }
      } catch (pollError) {
        if (!cancelled) {
          showError(pollError instanceof Error ? pollError.message : "轮询二维码失败");
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
    setQrStatus("");
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
      setQrStatus("请使用哔哩哔哩 App 扫码登录");
    } catch (qrError) {
      showError(qrError instanceof Error ? qrError.message : "获取二维码失败");
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
        showError("请先关闭所有弹幕窗口后再移除账号");
        return;
      }
    } catch { /* ignore */ }

    try {
      const newActiveId = await tauriCommands.auth.removeAccount(accountId);
      removeAccount(accountId, newActiveId);
      showSuccess("已移除账号");
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : "移除账号失败");
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    try {
      const windows = await getAllWindows();
      if (windows.some((w) => w.label.startsWith("danmaku-"))) {
        showError("请先关闭所有弹幕窗口后再切换账号");
        return;
      }
    } catch { /* ignore */ }

    setSwitchingId(accountId);
    clearMessage();
    try {
      const credential = await tauriCommands.auth.switchAccount(accountId);
      setActiveAccount(accountId, credential);
      showSuccess(`已切换到 ${credential.username}`);
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : "切换账号失败");
    } finally {
      setSwitchingId(null);
    }
  };

  const handleSwitchToAnonymous = async () => {
    try {
      const windows = await getAllWindows();
      if (windows.some((w) => w.label.startsWith("danmaku-"))) {
        showError("请先关闭所有弹幕窗口后再切换到匿名模式");
        return;
      }
    } catch { /* ignore */ }

    setSwitchingId(ANONYMOUS_ACCOUNT_ID);
    clearMessage();
    try {
      const credential = await tauriCommands.auth.switchToAnonymous();
      setActiveAccount(ANONYMOUS_ACCOUNT_ID, credential);
      showSuccess("已切换到匿名模式");
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : "切换到匿名模式失败");
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
      showSuccess("账号信息已刷新");
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : "刷新账号信息失败");
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
      showSuccess("Cookie 授权已续期");
    } catch (e) {
      showError(typeof e === "string" ? e : e instanceof Error ? e.message : "刷新 Cookie 失败");
    } finally {
      setRefreshingId(null);
    }
  };

  const getExpiryText = (expiresAt?: number): { text: string; color: string } => {
    if (!expiresAt) return { text: "过期时间未知", color: "text-slate-400 dark:text-slate-500" };
    const now = Date.now() / 1000;
    if (expiresAt <= now) return { text: "已过期", color: "text-rose-500 dark:text-rose-400" };
    const days = Math.floor((expiresAt - now) / 86400);
    if (days <= 0) return { text: "不足1天过期", color: "text-amber-500 dark:text-amber-400" };
    if (days <= 10) return { text: `${days}天后过期`, color: "text-amber-500 dark:text-amber-400" };
    return { text: `${days}天后过期`, color: "text-emerald-600 dark:text-emerald-400" };
  };

  return (
    <section className="flex h-full flex-col select-none">
      <div className="app-rise mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">账号</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">扫码登录，支持多账号切换。</p>
        </div>
        <div className="flex items-center gap-2">
          {error && <InlineMessage key={msgKey} type="error">{error}</InlineMessage>}
          {success && <InlineMessage key={msgKey} type="success">{success}</InlineMessage>}
          {!showAdd && !showWarning && (
            <>
              <button
                onClick={() => void handleSwitchToAnonymous()}
                disabled={switchingId === ANONYMOUS_ACCOUNT_ID || activeAccountId === ANONYMOUS_ACCOUNT_ID}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-500 px-4 text-sm font-medium text-white transition hover:bg-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {switchingId === ANONYMOUS_ACCOUNT_ID ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                匿名模式
              </button>
              <button
                onClick={handleOpenAdd}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-pink-500 px-4 text-sm font-medium text-white transition hover:bg-pink-400"
              >
                <Plus className="h-4 w-4" />
                添加账号
              </button>
            </>
          )}
        </div>
      </div>

      {showWarning ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex w-full max-w-lg flex-col items-center rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-medium text-slate-900 dark:text-white">风险提示</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              程序请求与浏览器内正常使用所发送的请求不完全一致，能通过分析请求日志识别出来。
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              软件开发者不对账号发生的任何事情负责，包括并不限于被标记为机器人账号、无法参与各种抽奖和活动等。
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              如您知晓您的账号会因以上所列出来的部分原因所导致无法使用或权益受损等情况，并愿意承担由此所会带来的一系列后果，请继续以下的操作，软件开发者不会对您账号所发生的任何后果承担责任。
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowWarning(false)}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.04]"
              >
                取消
              </button>
              <button
                onClick={handleConfirmWarning}
                className="rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-pink-400"
              >
                我已知晓，继续
              </button>
            </div>
          </div>
        </div>
      ) : showAdd ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex w-full max-w-sm flex-col items-center rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="flex w-full items-center justify-between">
              <h3 className="text-base font-medium text-slate-900 dark:text-white">扫码登录</h3>
              <button
                onClick={handleCloseAdd}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#ebebeb] dark:text-slate-500 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 self-start text-xs text-slate-500 dark:text-slate-400">
              使用 Bilibili App 扫码，获取观看时长所需的 access_key。
            </p>

            <div className="mt-5 flex flex-col items-center gap-4">
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="Bilibili 登录二维码"
                  className="h-[180px] w-[180px] bg-white"
                />
              ) : (
                <div className="flex h-[180px] w-[180px] items-center justify-center bg-[#f0f0f0] dark:bg-[#0e1018]">
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <span className="text-xs text-slate-400">点击下方生成二维码</span>
                  )}
                </div>
              )}

              <button
                onClick={() => void handleCreateQr()}
                disabled={loading}
                className="rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "生成中..." : authCode ? "刷新二维码" : "生成二维码"}
              </button>

              {qrStatus && (
                <p className="text-xs text-slate-400 dark:text-slate-500">{qrStatus}</p>
              )}
            </div>
          </div>
        </div>
      ) : accounts.length === 0 && activeAccountId !== ANONYMOUS_ACCOUNT_ID ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="rounded-lg bg-[#f0f0f0] p-6 text-sm text-slate-400 ring-1 ring-slate-200 dark:bg-[#0e1018] dark:text-slate-500 dark:ring-white/[0.06]">
            当前还没有登录账号。点击右上角「添加账号」扫码登录，或使用「匿名模式」。
          </div>
        </div>
      ) : (
        <div className="app-rise space-y-2">
          {/* 匿名模式条目 */}
          {activeAccountId === ANONYMOUS_ACCOUNT_ID && (
            <div className="rounded-lg bg-[#f8f8f8] p-4 shadow-sm ring-2 ring-pink-300 dark:bg-[#161822] dark:ring-1 dark:ring-white/[0.06] dark:ring-pink-500/40">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-medium text-slate-900 dark:text-white">匿名模式</p>
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <Check className="h-3 w-3" />
                        当前
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">仅可接收弹幕和音频流</p>
                  </div>
                </div>
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
                className={`rounded-lg bg-[#f8f8f8] p-4 shadow-sm dark:bg-[#161822] dark:ring-1 dark:ring-white/[0.06] ${
                  isActive ? "ring-2 ring-pink-300 dark:ring-pink-500/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {account.avatar ? (
                      <ProxiedImage
                        src={account.avatar}
                        alt={account.username}
                        persistent
                        className="h-12 w-12 shrink-0 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#ebebeb] text-slate-400 dark:bg-[#0e1018] dark:text-slate-300">
                        <UserRound className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-medium text-slate-900 dark:text-white">{account.username}</p>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <Check className="h-3 w-3" />
                            当前
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        UID: {account.uid}
                        <span className={`ml-2 ${expiry.color}`}>{expiry.text}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleRefreshInfo(account.accountId)}
                      disabled={isRefreshing}
                      title="刷新信息"
                      className="p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                    >
                      {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => void handleRefreshCookie(account.accountId)}
                      disabled={isRefreshing}
                      title="更新授权（续期 Cookie）"
                      className="p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => void handleSwitchAccount(account.accountId)}
                        disabled={isSwitching}
                        title="切换"
                        className="p-1.5 text-pink-600 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-pink-300 dark:hover:bg-pink-500/10"
                      >
                        {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => void handleRemoveAccount(account.accountId)}
                      title="移除"
                      className="p-1.5 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
