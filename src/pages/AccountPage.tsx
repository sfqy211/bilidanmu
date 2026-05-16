import { useEffect, useMemo, useState } from "react";
import { Check, LogOut, UserRound } from "lucide-react";
import { toDataURL } from "qrcode";
import { PageTabs, TabContent } from "@/components/ui/PageTabs";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useAuth } from "@/hooks/useAuth";
import type { Credential } from "@/types/bilibili";

export function AccountPage() {
  const {
    accounts,
    activeAccountId,
    addAccount,
    removeAccount,
    setAccounts,
    setActiveAccount,
    clearAuth,
  } = useAuth();

  const [cookie, setCookie] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrKey, setQrKey] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("未生成二维码");
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("login");

  const activeAccount = useMemo(
    () => accounts.find((a) => a.accountId === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );

  useEffect(() => {
    if (!qrKey) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const result = await tauriCommands.auth.pollQr(qrKey);
        if (cancelled) return;

        setQrStatus(result.message ?? "等待扫码...");

        if (result.status === "success" && result.credential) {
          addAccount(result.credential);
          setSuccess("扫码登录成功");
          setError(null);
          setQrKey(null);
          setQrUrl(null);
          setQrImageUrl(null);
          setQrStatus("扫码登录成功");
        }

        if (result.status === "expired") {
          setQrKey(null);
          setQrStatus("二维码已过期，正在自动刷新...");
          void handleCreateQr(true);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "轮询二维码失败");
          setQrKey(null);
          setQrStatus("二维码轮询失败");
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [qrKey, addAccount]);

  const handleLogin = async () => {
    const trimmed = cookie.trim();
    if (!trimmed) {
      setError("请先粘贴 Cookie");
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const credential = await tauriCommands.auth.loginByCookie(trimmed);
      addAccount(credential);
      setCookie("");
      setSuccess("Cookie 登录成功");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Cookie 登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    try {
      const newActiveId = await tauriCommands.auth.removeAccount(accountId);
      removeAccount(accountId, newActiveId);
      setSuccess("已移除账号");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除账号失败");
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    setSwitchingId(accountId);
    setError(null);
    try {
      const credential = await tauriCommands.auth.switchAccount(accountId);
      setActiveAccount(accountId, credential);
      setSuccess(`已切换到 ${credential.username}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换账号失败");
    } finally {
      setSwitchingId(null);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const remaining = await tauriCommands.auth.logout();
      if (remaining.length > 0) {
        // 还有其他账号，更新列表但清除活跃状态
        setAccounts(remaining);
        setActiveAccount(null);
      } else {
        clearAuth();
      }
      setSuccess("已退出登录");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "退出登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQr = async (silent = false) => {
    setLoading(true);
    if (!silent) {
      setError(null);
      setSuccess(null);
    }

    try {
      const result = await tauriCommands.auth.loginByQr();
      const imageUrl = await toDataURL(result.url, {
        margin: 1,
        width: 180,
        color: {
          dark: "#111827",
          light: "#ffffff"
        }
      });
      setQrUrl(result.url);
      setQrImageUrl(imageUrl);
      setQrKey(result.qrcodeKey);
      setQrStatus("请使用哔哩哔哩 App 扫码登录，并在手机端确认");
    } catch (qrError) {
      setError(qrError instanceof Error ? qrError.message : "获取二维码失败");
      setQrStatus("获取二维码失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">账号</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">扫码或 Cookie 登录，支持多账号切换。</p>
        </div>
        {error ? <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p> : null}
      </div>

      <PageTabs
        tabs={[
          { value: "login", label: "登录" },
          { value: "account", label: "账号" }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <TabContent value="login" className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col border border-slate-300 bg-white p-5 dark:border-white/[0.06] dark:bg-[#12141e]">
            <h3 className="text-base font-medium text-slate-900 dark:text-white">扫码登录</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">使用 Bilibili App 扫码并在手机端确认。</p>

            <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-4">
              {qrUrl ? (
                <div className="flex h-48 w-48 items-center justify-center border border-slate-300 bg-slate-50 p-3 dark:border-white/[0.06] dark:bg-[#0c0e18]">
                  <img
                    src={qrImageUrl ?? undefined}
                    alt="Bilibili 登录二维码"
                    className="h-[180px] w-[180px] bg-white p-2"
                  />
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => void handleCreateQr()}
                  disabled={loading}
                  className="border border-cyan-200 px-5 py-2.5 text-sm text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-500/20 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                >
                  {loading ? "生成中..." : qrUrl ? "刷新二维码" : "生成二维码"}
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400">使用 Bilibili App 扫码，每 3 秒自动轮询状态。</p>
              </div>

              {qrUrl ? <p className="text-xs text-slate-400 dark:text-slate-500">{qrStatus}</p> : null}
            </div>
          </div>

          <div className="flex flex-col border border-slate-300 bg-white p-5 dark:border-white/[0.06] dark:bg-[#12141e]">
            <h3 className="text-base font-medium text-slate-900 dark:text-white">Cookie 登录</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              粘贴浏览器导出的 B 站 Cookie，需包含 <code className="text-slate-700 dark:text-slate-200">SESSDATA</code>
              与 <code className="text-slate-700 dark:text-slate-200">bili_jct</code>。
            </p>

            <textarea
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
              placeholder="粘贴完整 Cookie 字符串..."
              className="mt-3 h-40 w-full flex-1 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
            />

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => void handleLogin()}
                disabled={loading}
                className="bg-pink-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "登录中..." : "使用 Cookie 登录"}
              </button>
              <span className="text-xs text-slate-400 dark:text-slate-500">登录后会自动添加到账号列表并设为当前。</span>
            </div>
          </div>
        </TabContent>

        <TabContent value="account" className="flex flex-col gap-4">
          {accounts.length === 0 ? (
            <div className="border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-400 dark:border-white/[0.06] dark:bg-[#0c0e18] dark:text-slate-500">
              当前还没有登录账号。先从登录页完成登录。
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                const isActive = account.accountId === activeAccountId;
                const isSwitching = switchingId === account.accountId;
                return (
                  <div
                    key={account.accountId}
                    className={`border bg-white p-4 dark:bg-[#161822] ${
                      isActive
                        ? "border-pink-300 dark:border-pink-500/40"
                        : "border-slate-200 dark:border-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        {account.avatar ? (
                          <ProxiedImage
                            src={account.avatar}
                            alt={account.username}
                            className="h-12 w-12 shrink-0 border border-slate-200 object-cover dark:border-white/[0.06]"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-slate-200 bg-slate-100 text-slate-400 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                            <UserRound className="h-5 w-5" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-medium text-slate-900 dark:text-white">{account.username}</p>
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                                <Check className="h-3 w-3" />
                                当前
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">UID: {account.uid}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {!isActive ? (
                          <button
                            onClick={() => void handleSwitchAccount(account.accountId)}
                            disabled={isSwitching}
                            className="border border-pink-200 px-3 py-1.5 text-xs text-pink-600 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-pink-500/30 dark:text-pink-300 dark:hover:bg-pink-500/10"
                          >
                            {isSwitching ? "切换中..." : "切换"}
                          </button>
                        ) : null}
                        <button
                          onClick={() => void handleRemoveAccount(account.accountId)}
                          className="border border-rose-200 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <LogOut className="inline h-3 w-3" /> 移除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeAccount ? (
            <div className="border border-slate-300 bg-white p-5 dark:border-white/[0.06] dark:bg-[#12141e]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium text-slate-900 dark:text-white">快捷操作</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">退出当前账号将从列表中移除并断开连接。</p>
                </div>
                <button
                  onClick={() => void handleLogout()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  {loading ? "退出中..." : "退出当前账号"}
                </button>
              </div>
            </div>
          ) : null}
        </TabContent>
      </PageTabs>
    </section>
  );
}
