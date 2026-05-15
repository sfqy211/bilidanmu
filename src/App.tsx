import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { tauriCommands } from "@/lib/tauri";
import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  useTheme();
  const { setAccounts, setSendAccountId, setRecvAccountId } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const credential = await tauriCommands.auth.restoreLogin();
        if (!cancelled && credential) {
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
        }
      } catch {
        // 恢复登录失败时静默处理，用户可手动登录
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [setAccounts, setRecvAccountId, setSendAccountId]);

  return <Outlet />;
}
