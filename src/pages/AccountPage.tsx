import { useMemo, useState } from "react";
import { EyeOff, LogOut, Shield, UserRound } from "lucide-react";
import { tauriCommands } from "@/lib/tauri";
import { useAuth } from "@/hooks/useAuth";

export function AccountPage() {
  const {
    accounts,
    sendAccountId,
    recvAccountId,
    stealthMode,
    setAccounts,
    setSendAccountId,
    setRecvAccountId,
    setStealthMode,
    clearAuth
  } = useAuth();

  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentAccount = useMemo(() => accounts[0] ?? null, [accounts]);

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
      const account = {
        id: credential.accountId,
        uid: credential.uid,
        username: credential.username,
        avatar: credential.avatar,
        cookie: credential.cookie
      };

      setAccounts([account]);
      setSendAccountId(account.id);
      setRecvAccountId(account.id);
      setCookie("");
      setSuccess("Cookie 登录成功");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Cookie 登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await tauriCommands.auth.logout();
      clearAuth();
      setSuccess("已退出登录");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "退出登录失败");
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">账号</h2>
        <p className="mt-1 text-sm text-slate-400">
          先提供 Cookie 登录、当前账号展示、发送/接收账号标记与隐身模式开关。
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-medium text-white">Cookie 登录</h3>
        <p className="mt-1 text-sm text-slate-400">
          粘贴浏览器导出的 B 站 Cookie，至少需要包含 <code className="text-slate-200">SESSDATA</code>
          与 <code className="text-slate-200">bili_jct</code>。
        </p>

        <textarea
          value={cookie}
          onChange={(event) => setCookie(event.target.value)}
          placeholder="粘贴完整 Cookie 字符串..."
          className="mt-4 min-h-32 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void handleLogin()}
            disabled={loading}
            className="rounded-xl bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "登录中..." : "使用 Cookie 登录"}
          </button>
          <span className="text-xs text-slate-500">当前阶段暂未接入扫码登录。</span>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-emerald-400">{success}</p> : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-medium">当前账号</h3>
          {currentAccount ? (
            <button
              onClick={() => void handleLogout()}
              disabled={logoutLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {logoutLoading ? "退出中..." : "退出登录"}
            </button>
          ) : null}
        </div>

        {!currentAccount ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-sm text-slate-500">
            当前还没有登录账号。上方完成 Cookie 登录后会显示在这里。
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                {currentAccount.avatar ? (
                  <img
                    src={currentAccount.avatar}
                    alt={currentAccount.username}
                    className="h-14 w-14 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300">
                    <UserRound className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <p className="text-base font-medium text-white">{currentAccount.username}</p>
                  <p className="mt-1 text-sm text-slate-400">UID: {currentAccount.uid}</p>
                  <p className="mt-1 text-xs text-emerald-400">
                    Cookie 已写入本地存储，可随应用启动自动恢复
                  </p>
                </div>
              </div>

              <div className="grid gap-2 text-sm text-slate-300">
                <button
                  onClick={() => setSendAccountId(currentAccount.id)}
                  className={`rounded-xl border px-4 py-2 text-left transition ${
                    sendAccountId === currentAccount.id
                      ? "border-pink-500/40 bg-pink-500/10 text-pink-200"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  发送账号：{sendAccountId === currentAccount.id ? "当前账号" : "设为当前"}
                </button>
                <button
                  onClick={() => setRecvAccountId(currentAccount.id)}
                  className={`rounded-xl border px-4 py-2 text-left transition ${
                    recvAccountId === currentAccount.id
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  接收账号：{recvAccountId === currentAccount.id ? "当前账号" : "设为当前"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-900/80 p-2 text-slate-200">
            <EyeOff className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-medium text-white">隐身模式</h3>
                <p className="mt-1 text-sm text-slate-400">
                  打开后，接收侧可视为匿名模式；当前仅保存为前端状态，后续会继续接入 WS 连接策略。
                </p>
              </div>
              <button
                onClick={() => setStealthMode(!stealthMode)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition ${
                  stealthMode
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                <Shield className="h-4 w-4" />
                {stealthMode ? "隐身模式已开启" : "开启隐身模式"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
