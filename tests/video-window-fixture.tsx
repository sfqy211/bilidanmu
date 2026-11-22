// 浏览器专用 IPC 替身，所有发送与窗口操作留在本地。
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Locale } from "../src/i18n/languages";

const parameters = new URLSearchParams(location.search);
const surface = parameters.get("surface") ?? "window";
const windowLabel = surface === "main" || surface === "settings" ? "main" : surface === "live" ? "danmaku" : "video-danmaku";
mockWindows(windowLabel);
const calls: { command: string; args: any }[] = [];
const state = {
  revision: 1, bvid: "BVtest1", aid: 1, cid: 101, title: "时间轴与字幕联动 · 视频弹幕窗口",
  tracks: [{ key: "101", title: "时间轴与字幕联动 · 视频弹幕窗口", bvid: "BVtest1" }, { key: "102", title: "P2 字幕为空的分 P", bvid: "BVtest1" }],
  index: 0, playing: true, loading: false, currentTime: 14, duration: 900, volume: 50, error: null,
};
let subtitleError = false;
let danmakuError = false;
let sendError = false;
let cursor = { x: 30, y: 20 };
let stealthEnabled = false;
const stealthVisible = () => !stealthEnabled || (cursor.x >= 0 && cursor.x < innerWidth && cursor.y >= 0 && cursor.y < innerHeight);
let backgroundLuminance: number | null = null;
let savedLocale = parameters.get("locale");
let localeSaveError = false;
const initialRatio = parameters.get("subtitleRatio");
const saved = { videoDanmakuAppearance: { subtitleFontSize: 15, ...(initialRatio === null ? {} : { subtitleRatio: Number(initialRatio) }) } };
const { emit } = await import("@tauri-apps/api/event");
const broadcast = async (patch: object) => {
  Object.assign(state, patch, { revision: state.revision + 1 });
  await emit("video-playback", { ...state });
};
mockIPC(async (command, args: any) => {
  calls.push({ command, args });
  switch (command) {
    case "get_settings": {
      const { locale: _default, ...settings } = defaultSettings;
      return savedLocale === null ? settings : { ...settings, locale: savedLocale };
    }
    case "get_follow_lives": return [];
    case "get_rooms": return [];
    case "list_fav_folders":
    case "list_watch_later": return [];
    case "ai_mcp_status": return { running: false, endpoint: "" };
    case "ai_get_permission_mode": return "autonomous";
    case "ai_get_watch_max_minutes": return 240;
    case "set_locale":
      if (localeSaveError) throw "LOCALE_SAVE_FAILED";
      await changeSavedLocale(args.locale);
      return args.locale;
    case "get_dock_state": return { phase: "normal", side: "left" };
    case "get_danmaku_input_only": return false;
    case "get_danmaku_stealth": return { enabled: stealthEnabled, visible: stealthVisible() };
    case "get_live_time": return null;
    case "list_stt_models": return [];
    case "get_rooms_live_status": return { 1: { isLive: true }, 2: { isLive: true } };
    case "set_danmaku_input_only":
      await emit("danmaku-input-only", args.enabled); return args.enabled;
    case "set_danmaku_stealth":
      stealthEnabled = args.enabled;
      await emit("danmaku-stealth", { label: windowLabel, enabled: stealthEnabled, visible: stealthVisible() });
      return stealthEnabled;
    case "switch_room": await emit("room-switched", args.roomId); return;
    case "send_danmaku": return { code: 0, message: "ok" };
    case "get_video_playback": return { ...state };
    case "get_video_subtitle":
      if (subtitleError) throw "字幕读取失败";
      return args.cid === 102 ? [] : Array.from({ length: 180 }, (_, index) => ({ from: index * 5, to: index * 5 + 4, content: index % 4 === 0 ? "字幕和弹幕共享播放时间轴，点击任意一行即可跳转。" : `第 ${index + 1} 句字幕，保留原视频的完整内容。` }));
    case "get_video_danmaku":
      if (danmakuError) throw "弹幕读取失败";
      return args.cid === 102 ? [] : Array.from({ length: 1200 }, (_, index) => ({ id: `${args.cid}-${args.segment}-${index}`, progress: (args.segment - 1) * 360 + index * 0.3, content: index % 5 === 0 ? "长弹幕换行回归，验证窄窗口中的时间与内容对齐。".repeat(3) : `视频弹幕 ${index + 1}` }));
    case "control_video_playback": {
      const { action, value } = args.control;
      if (surface === "main") await emit("video-playback-control", args);
      else if (action === "seek") await broadcast({ currentTime: value });
      else if (action === "volume") await broadcast({ volume: value });
      else if (action === "togglePlay") await broadcast({ playing: !state.playing });
      else if (action === "selectTrack") {
        const index = state.tracks.findIndex((track) => track.key === value);
        await broadcast({ index, cid: index === 1 ? 102 : 101, currentTime: 0, title: state.tracks[index].title });
      }
      return;
    }
    case "send_video_danmaku":
      if (sendError) throw "发送失败，请重试";
      return { id: `sent-${calls.length}`, progress: args.progress, content: args.message };
    case "load_selections": return saved;
    case "save_selections": Object.assign(saved, args.entries); return;
    case "get_sending_account_id": return "test";
    case "set_video_input_only": return args.enabled;
    case "sample_background_luminance": return backgroundLuminance;
    case "plugin:window|cursor_position": return cursor;
    case "plugin:window|inner_position": return { x: 0, y: 0 };
    case "plugin:window|inner_size": return { width: innerWidth, height: innerHeight };
    case "plugin:window|scale_factor": return 1;
    default: return;
  }
}, { shouldMockEvents: true });

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { QueryClientProvider } = await import("@tanstack/react-query");
const { queryClient } = await import("../src/lib/query-client");
const { useAuthStore } = await import("../src/stores/auth-store");
const { defaultSettings, useSettingsStore } = await import("../src/stores/settings-store");
const { initializeLocale } = await import("../src/i18n/locale-sync");
async function changeSavedLocale(locale: Locale) {
  savedLocale = locale;
  await emit("locale-changed", null);
}
await initializeLocale();
const { useTheme } = await import("../src/hooks/useTheme");
function FixtureTheme({ children }: { children: import("react").ReactNode }) {
  useTheme();
  return children;
}
useAuthStore.setState({ activeAccountId: "test", accounts: [{ accountId: "test", username: "测试账号" } as any] });
await import("../src/index.css");
await import("@danmaku-core/ui/styles.css");
const root = createRoot(document.getElementById("root")!);
let player: any;
if (surface === "settings") {
  const { MemoryRouter, Routes, Route } = await import("react-router-dom");
  const { Toaster } = await import("sonner");
  const { SettingsPage } = await import("../src/pages/SettingsPage");
  const { RoomPage } = await import("../src/pages/RoomPage");
  const { RoomAddPage } = await import("../src/pages/RoomAddPage");
  const { ListenHomePage } = await import("../src/pages/ListenHomePage");
  const { VideoAddPage } = await import("../src/pages/VideoAddPage");
  const { AIPage } = await import("../src/pages/AIPage");
  const { AppSidebar } = await import("../src/components/layout/AppSidebar");
  const { TitleBar } = await import("../src/components/layout/TitleBar");
  root.render(
    <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/settings"]}>
      <TitleBar />
      <div className="flex h-[calc(100vh-40px)]">
        <AppSidebar />
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/rooms" element={<RoomPage />} />
          <Route path="/rooms/add" element={<RoomAddPage />} />
          <Route path="/listen" element={<ListenHomePage />} />
          <Route path="/listen/add" element={<VideoAddPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="*" element={<div />} />
        </Routes>
      </div>
      <Toaster />
    </MemoryRouter></QueryClientProvider>,
  );
} else if (surface === "main") {
  const { MemoryRouter, Routes, Route } = await import("react-router-dom");
  const { VideoPlayerPage } = await import("../src/pages/VideoPlayerPage");
  const { VideoWindowBridge } = await import("../src/components/listen/VideoWindowBridge");
  const { useVideoAudioStore } = await import("../src/stores/video-audio-store");
  player = useVideoAudioStore;
  const video = { bvid: "BVtest1", aid: 1, title: state.title, ownerName: "测试 UP 主", duration: 900, pages: [{ cid: 101, page: 1, part: "P1", duration: 900 }, { cid: 102, page: 2, part: "P2", duration: 30 }], season: null };
  useVideoAudioStore.setState({ video, queue: { key: "video-BVtest1", title: state.title, perPage: true, tracks: video.pages.map((page) => ({ bvid: video.bvid, cid: page.cid, title: page.part, ownerName: video.ownerName, duration: page.duration })) }, playing: true, currentTime: 14, duration: 900 });
  // 仅替换媒体硬件边界，走真实的主窗口事件桥和播放器页面。
  useVideoAudioStore.setState({ seek: (time) => useVideoAudioStore.setState({ currentTime: time }), togglePlay: async () => useVideoAudioStore.setState({ playing: !useVideoAudioStore.getState().playing }) });
  root.render(<React.StrictMode><FixtureTheme><QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/listen/video/BVtest1"]}><VideoWindowBridge /><Routes><Route path="/listen/video/:bvid" element={<VideoPlayerPage />} /></Routes></MemoryRouter></QueryClientProvider></FixtureTheme></React.StrictMode>);
} else if (surface === "live") {
  const { MemoryRouter, Routes, Route } = await import("react-router-dom");
  const { DanmakuPage } = await import("../src/pages/DanmakuPage");
  const { useRoomStore } = await import("../src/stores/room-store");
  useRoomStore.setState({ rooms: [
    { roomId: 1001, uid: 1, uname: "测试主播甲", title: "共享窗口直播回归" },
    { roomId: 1002, uid: 2, uname: "测试主播乙", title: "原地切换直播间" },
  ] as any });
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.getState().patchSettings({ audio: { ...settings.audio, autoPlay: false }, receive: { ...settings.receive, entryAction: false } });
  root.render(<React.StrictMode><FixtureTheme><QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/danmaku/1001"]}><Routes><Route path="/danmaku/:roomId" element={<DanmakuPage />} /></Routes></MemoryRouter></QueryClientProvider></FixtureTheme></React.StrictMode>);
} else {
  const { VideoDanmakuPage } = await import("../src/pages/VideoDanmakuPage");
  root.render(<React.StrictMode><FixtureTheme><QueryClientProvider client={queryClient}><VideoDanmakuPage /></QueryClientProvider></FixtureTheme></React.StrictMode>);
}

Object.assign(window, { videoTest: {
  calls, state, saved, broadcast, emit, player, changeSavedLocale, settingsStore: useSettingsStore,
  setLocaleSaveError: (value: boolean) => { localeSaveError = value; },
  setLuminance: (value: number | null) => { backgroundLuminance = value; },
  setCursor: (next: typeof cursor) => {
    cursor = next;
    if (stealthEnabled) void emit("danmaku-stealth", { label: windowLabel, enabled: true, visible: stealthVisible() });
  },
  setErrors: async (errors: { subtitle?: boolean; danmaku?: boolean; send?: boolean }) => {
    subtitleError = errors.subtitle ?? false; danmakuError = errors.danmaku ?? false; sendError = errors.send ?? false;
    queryClient.clear(); await broadcast({});
  },
  setAnonymous: (value: boolean) => useAuthStore.setState({ isAnonymous: value }),
} });
