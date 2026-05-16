import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { tauriCommands } from "@/lib/tauri";
import { useAuthStore } from "@/stores/auth-store";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/hooks/useTheme";

export default function App() {
  useTheme();
  const { setAccounts, setSendAccountId, setRecvAccountId } = useAuthStore();
  const setCurrentRoomId = useRoomStore((state) => state.setCurrentRoomId);
  const setRooms = useRoomStore((state) => state.setRooms);
  const setSettings = useSettingsStore((state) => state.setSettings);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const [credential, settings, rooms] = await Promise.all([
          tauriCommands.auth.restoreLogin(),
          tauriCommands.settings.get(),
          tauriCommands.state.getRooms()
        ]);

        let selections: Record<string, unknown> = {};
        try {
          selections = await tauriCommands.selections.load(["currentRoomId", "sendAccountId", "recvAccountId"]);
        } catch {
          selections = {};
        }

        if (cancelled) {
          return;
        }

        setSettings(settings);
        setRooms(rooms);

        const savedSendAccountId = selections.sendAccountId as string | undefined;
        const savedRecvAccountId = selections.recvAccountId as string | undefined;
        const savedRoomId = selections.currentRoomId as number | undefined;

        if (credential) {
          const account = {
            id: credential.accountId,
            uid: credential.uid,
            username: credential.username,
            avatar: credential.avatar,
            cookie: credential.cookie
          };
          setAccounts([account]);
          setSendAccountId(savedSendAccountId === account.id ? savedSendAccountId : account.id);
          setRecvAccountId(savedRecvAccountId === account.id ? savedRecvAccountId : account.id);
        }

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
  }, [setAccounts, setCurrentRoomId, setRecvAccountId, setRooms, setSendAccountId, setSettings]);

  return <Outlet />;
}
