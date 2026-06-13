import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { tauriCommands } from "@/lib/tauri";
import type { Credential, Settings } from "@/types/bilibili";
import { useAuthStore } from "@/stores/auth-store";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useTheme } from "@/hooks/useTheme";
import { useUiScale } from "@/hooks/useUiScale";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useErrorCapture } from "@/hooks/useErrorCapture";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateDialog } from "@/components/ui/UpdateDialog";

export default function App() {
  useTheme();
  useUiScale();
  useErrorCapture();
  const { updateInfo, dismiss } = useUpdateCheck();
  const { setAccounts, setActiveAccount } = useAuthStore();
  const setCurrentRoomId = useRoomStore((state) => state.setCurrentRoomId);
  const setRooms = useRoomStore((state) => state.setRooms);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const setSttAvailable = useSettingsStore((state) => state.setSttAvailable);
  const setAiAvailable = useSettingsStore((state) => state.setAiAvailable);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const [activeCredential, settings, rooms, sttAvailable, aiAvailable] = await Promise.all([
          tauriCommands.auth.restoreLogin(),
          tauriCommands.settings.get(),
          tauriCommands.state.getRooms(),
          tauriCommands.settings.isSttAvailable(),
          tauriCommands.settings.isAiAvailable()
        ]);

        if (cancelled) {
          return;
        }

        setSettings(settings);
        setSttAvailable(sttAvailable);
        setAiAvailable(aiAvailable);
        setRooms(rooms);

        // 同步消息缓存上限
        if (settings.cache) {
          useDanmakuStore.getState().setLimits(settings.cache.danmakuLimit, settings.cache.giftLimit);
        }
        // 同步屏蔽列表
        if (settings.filter) {
          useDanmakuStore.getState().setBlockFilter(settings.filter.blockedUsers, settings.filter.blockedKeywords);
        }
        // 同步入场信息屏蔽
        if (settings.appearance) {
          useDanmakuStore.getState().setHideEntryMessage(settings.appearance.hideEntryMessage);
        }

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
  }, [setAccounts, setActiveAccount, setCurrentRoomId, setRooms, setSettings, setSttAvailable, setAiAvailable]);

  // 监听托盘事件：房间切换
  useEffect(() => {
    const unlisten = listen<number>("room-switched", (event) => {
      setCurrentRoomId(String(event.payload));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setCurrentRoomId]);

  // 监听房间信息更新（启动时后台刷新标题等）
  useEffect(() => {
    const unlisten = listen("rooms-updated", async () => {
      try {
        const rooms = await tauriCommands.state.getRooms();
        setRooms(rooms);
      } catch {
        // ignore
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [setRooms]);

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

  // 监听跨窗口设置同步
  useEffect(() => {
    const handleSettingsChanged = (event: { payload: Settings }) => {
      setSettings(event.payload);
      // 同步消息缓存上限
      if (event.payload.cache) {
        useDanmakuStore.getState().setLimits(event.payload.cache.danmakuLimit, event.payload.cache.giftLimit);
      }
      // 同步屏蔽列表
      if (event.payload.filter) {
        useDanmakuStore.getState().setBlockFilter(event.payload.filter.blockedUsers, event.payload.filter.blockedKeywords);
      }
      // 同步入场信息屏蔽
      if (event.payload.appearance) {
        useDanmakuStore.getState().setHideEntryMessage(event.payload.appearance.hideEntryMessage);
      }
    };

    const unlistenChanged = listen<Settings>("settings-changed", handleSettingsChanged);

    return () => {
      void unlistenChanged.then((fn) => fn());
    };
  }, [setSettings]);

  return (
    <>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <UpdateDialog updateInfo={updateInfo} onDismiss={dismiss} />
    </>
  );
}
