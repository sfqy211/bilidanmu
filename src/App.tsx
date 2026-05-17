import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { tauriCommands } from "@/lib/tauri";
import type { Credential } from "@/types/bilibili";
import { useAuthStore } from "@/stores/auth-store";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  useTheme();
  const { setAccounts, setActiveAccount } = useAuthStore();
  const setCurrentRoomId = useRoomStore((state) => state.setCurrentRoomId);
  const setRooms = useRoomStore((state) => state.setRooms);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const setSttAvailable = useSettingsStore((state) => state.setSttAvailable);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const [activeCredential, settings, rooms, sttAvailable] = await Promise.all([
          tauriCommands.auth.restoreLogin(),
          tauriCommands.settings.get(),
          tauriCommands.state.getRooms(),
          tauriCommands.settings.isSttAvailable()
        ]);

        if (cancelled) {
          return;
        }

        setSettings(settings);
        setSttAvailable(sttAvailable);
        setRooms(rooms);

        // 恢复活跃账号
        if (activeCredential) {
          setActiveAccount(activeCredential.accountId, activeCredential);
        }

        // 恢复所有账号列表
        try {
          const allAccounts = await tauriCommands.auth.listAccounts();
          if (!cancelled && allAccounts.length > 0) {
            setAccounts(allAccounts);
          }
        } catch {
          // listAccounts 失败不影响主流程
        }

        // 恢复上次选中的房间
        let selections: Record<string, unknown> = {};
        try {
          selections = await tauriCommands.selections.load(["currentRoomId"]);
        } catch {
          selections = {};
        }

        const savedRoomId = selections.currentRoomId as number | undefined;
        const savedRoomIdString = savedRoomId ? String(savedRoomId) : null;
        const roomExists = savedRoomIdString ? rooms.some((room) => room.id === savedRoomIdString) : false;

        if (savedRoomIdString && roomExists) {
          setCurrentRoomId(String(savedRoomId));
        }
      } catch {
        // 恢复失败时静默处理
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [setAccounts, setActiveAccount, setCurrentRoomId, setRooms, setSettings, setSttAvailable]);

  // 监听托盘事件：房间切换
  useEffect(() => {
    const unlisten = listen<number>("room-switched", (event) => {
      setCurrentRoomId(String(event.payload));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setCurrentRoomId]);

  // 监听托盘事件：账号切换
  useEffect(() => {
    const unlisten = listen<{ accountId: string; credential: Credential }>(
      "account-switched",
      (event) => {
        const { accountId, credential } = event.payload;
        setActiveAccount(accountId, credential);
      }
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setActiveAccount]);

  return <Outlet />;
}
