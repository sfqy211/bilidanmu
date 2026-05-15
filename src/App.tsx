import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { tauriCommands } from "@/lib/tauri";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  useTheme();
  const { setAccounts, setSendAccountId, setRecvAccountId } = useAuthStore();
  const setSettings = useSettingsStore((state) => state.setSettings);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const [credential, settings] = await Promise.all([
          tauriCommands.auth.restoreLogin(),
          tauriCommands.settings.get()
        ]);

        if (cancelled) {
          return;
        }

        setSettings(settings);

        if (credential) {
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
        // 恢复失败时静默处理
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [setAccounts, setRecvAccountId, setSendAccountId, setSettings]);

  return <Outlet />;
}
