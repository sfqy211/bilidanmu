import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands } from "@/lib/tauri";
import type { Credential, Settings } from "@/types/bilibili";
import { useAuthStore } from "@/stores/auth-store";
import { useRoomStore } from "@/stores/room-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useVideoAudioStore } from "@/stores/video-audio-store";
import { useTheme } from "@/hooks/useTheme";
import { useUiScale } from "@/hooks/useUiScale";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useErrorCapture } from "@/hooks/useErrorCapture";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateDialog } from "@/components/ui/UpdateDialog";
import { ConfirmRequestDialog } from "@/components/ai/ConfirmRequestDialog";

/** 主窗口标记：主窗口与弹幕窗共用这份 App，跨窗口事件需按 label 过滤 */
const isMainWindow = getCurrentWindow().label === "main";

export default function App() {
  useTheme();
  useUiScale();
  useErrorCapture();
  const navigate = useNavigate();
  const location = useLocation();
  const { updateInfo, dismiss } = useUpdateCheck();
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

        // 同步消息缓存上限
        if (settings.cache) {
          useDanmakuStore.getState().setLimits(settings.cache.messageLimit);
        }
        // 同步屏蔽列表
        if (settings.filter) {
          useDanmakuStore.getState().setBlockFilter(settings.filter.blockedUsers, settings.filter.blockedKeywords);
        }
        // 同步简化醒目留言显示
        if (settings.appearance) {
          useDanmakuStore.getState().setScInDanmaku(settings.appearance.scInDanmaku);
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
          selections = await tauriCommands.selections.load(["currentRoomId", "favoriteRoomIds"]);
        } catch {
          selections = {};
        }

        const savedRoomId = selections.currentRoomId as number | undefined;
        const savedRoomIdString = savedRoomId ? String(savedRoomId) : null;
        const roomExists = savedRoomIdString ? rooms.some((room) => room.id === savedRoomIdString) : false;

        if (savedRoomIdString && roomExists) {
          setCurrentRoomId(String(savedRoomId));
        }

        // 收藏列表（本地数据，与账号无关）
        const favoriteRoomIds = selections.favoriteRoomIds as number[] | undefined;
        if (Array.isArray(favoriteRoomIds)) {
          useRoomStore.getState().setFavoriteIds(favoriteRoomIds);
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

  // AI 工具请求主窗口跳到某个路由（如 video_play 打开视频页）
  useEffect(() => {
    const unlisten = listen<{ path: string }>("ai-navigate", (event) => {
      const path = event.payload?.path;
      if (typeof path === "string" && path.startsWith("/")) {
        navigate(path);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [navigate]);

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
        useDanmakuStore.getState().setLimits(event.payload.cache.messageLimit);
      }
      // 同步屏蔽列表
      if (event.payload.filter) {
        useDanmakuStore.getState().setBlockFilter(event.payload.filter.blockedUsers, event.payload.filter.blockedKeywords);
      }
      // 同步简化醒目留言显示
      if (event.payload.appearance) {
        useDanmakuStore.getState().setScInDanmaku(event.payload.appearance.scInDanmaku);
      }
    };

    const unlistenChanged = listen<Settings>("settings-changed", handleSettingsChanged);

    return () => {
      void unlistenChanged.then((fn) => fn());
    };
  }, [setSettings]);

  // 视频播放与直播互斥：进入直播间时让出音轨。
  // 只暂停不停止——队列与进度都保留，用户退出直播间后可经底部播放条手动继续。
  useEffect(() => {
    if (!isMainWindow) return;
    const unlisten = listen("danmaku-entered", () => {
      useVideoAudioStore.getState().pause();
      // 只在视频播放页时才离开：MiniPlayer 在 /listen/video/* 前缀下不渲染，
      // 若停留在该路由，退出直播间后用户找不到播放条。
      // 其余页面不动，避免把用户从设置页等位置强行拽走。
      if (location.pathname.startsWith("/listen/video/")) {
        navigate("/listen", { replace: true });
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [navigate, location.pathname]);

  // 离开直播间：视频保持暂停（幂等兜底，用户手动恢复才继续播）
  useEffect(() => {
    if (!isMainWindow) return;
    const unlisten = listen("room-exited", () => {
      useVideoAudioStore.getState().pause();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <UpdateDialog updateInfo={updateInfo} onDismiss={dismiss} />
      {/* AI 确认弹窗挂在根部：AI 可能在任何页面上发起需要确认的操作 */}
      {isMainWindow && <ConfirmRequestDialog />}
    </>
  );
}
