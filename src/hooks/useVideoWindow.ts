import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_VIDEO_WINDOW_PREFERENCES, type VideoPlaybackSnapshot, type VideoWindowPreferences } from "@/types/video-window";

const appWindow = getCurrentWindow();

export function useVideoPlayback() {
  const [playback, setPlayback] = useState<VideoPlaybackSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const apply = (next: VideoPlaybackSnapshot | null) => {
      if (disposed || !next) return;
      setPlayback((previous) => previous && previous.revision > next.revision ? previous : next);
    };
    void (async () => {
      unlisten = await listen<VideoPlaybackSnapshot>("video-playback", ({ payload }) => apply(payload));
      if (disposed) { unlisten(); return; }
      apply(await tauriCommands.videoWindow.getPlayback());
    })().catch((reason) => { if (!disposed) setError(String(reason)); });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  return { playback, error };
}

const PREFERENCES_KEY = "videoDanmakuAppearance";

function normalizePreferences(value: unknown): VideoWindowPreferences {
  const settings = useSettingsStore.getState().settings;
  const defaults = {
    ...DEFAULT_VIDEO_WINDOW_PREFERENCES,
    opacity: settings.appearance.opacity,
    subtitleFontSize: settings.listen.subtitleFontSize,
    danmakuFontSize: settings.appearance.fontSize,
  };
  const source = value && typeof value === "object" ? value as Partial<VideoWindowPreferences> : {};
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    opacity: number(source.opacity, 10, 100, defaults.opacity),
    subtitleFontSize: number(source.subtitleFontSize, 10, 32, defaults.subtitleFontSize),
    danmakuFontSize: number(source.danmakuFontSize, 10, 32, defaults.danmakuFontSize),
    subtitleRatio: number(source.subtitleRatio, 0.2, 0.8, defaults.subtitleRatio),
    autoFollow: typeof source.autoFollow === "boolean" ? source.autoFollow : defaults.autoFollow,
    showTime: typeof source.showTime === "boolean" ? source.showTime : defaults.showTime,
  };
}

export function useVideoWindowPreferences() {
  const [preferences, setPreferences] = useState(() => normalizePreferences(undefined));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    void tauriCommands.selections.load([PREFERENCES_KEY]).then((data) => {
      if (!disposed) setPreferences(normalizePreferences(data[PREFERENCES_KEY]));
    }).catch((reason) => toast.error(`读取视频窗口设置失败，使用默认值。${String(reason)}`))
      .finally(() => { if (!disposed) setReady(true); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void tauriCommands.selections.save({ [PREFERENCES_KEY]: preferences }).catch((reason) => toast.error(`保存窗口设置失败。${String(reason)}`));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [preferences, ready]);
  return { preferences, setPreferences, ready };
}

/** 与直播页分别维护状态，避免几何、透传或隐身状态跨窗口串用。 */
export function useVideoWindowModes() {
  const [pinned, setPinned] = useState(true);
  const pinChanging = useRef(false);
  const [locked, setLocked] = useState(false);
  const [inputOnly, setInputOnly] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const [passthrough, setPassthrough] = useState(false);
  const [stealth, setStealth] = useState(false);
  const [visible, setVisible] = useState(true);
  const revealUntilEntry = useRef(false);
  const ignored = useRef(false);

  useEffect(() => {
    const unlisten = listen("video-window-reveal", () => {
      revealUntilEntry.current = true;
      setVisible(true);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    let insideSince = 0;
    let outsideSince = 0;
    let revealed = true;
    setVisible(true);
    const setIgnored = async (next: boolean) => {
      if (ignored.current === next) return;
      await appWindow.setIgnoreCursorEvents(next);
      ignored.current = next;
    };
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        if (!stealth && !passthrough) { await setIgnored(false); return; }
        const [cursor, position, size, scale] = await Promise.all([
          cursorPosition(), appWindow.innerPosition(), appWindow.innerSize(), appWindow.scaleFactor(),
        ]);
        if (disposed) return;
        const x = cursor.x - position.x;
        const y = cursor.y - position.y;
        const inside = x >= 0 && y >= 0 && x < size.width && y < size.height;
        const tolerance = 8 * scale;
        const near = x >= -tolerance && y >= -tolerance && x < size.width + tolerance && y < size.height + tolerance;
        const now = performance.now();
        if (inside) { insideSince ||= now; outsideSince = 0; revealUntilEntry.current = false; }
        else { insideSince = 0; if (!near) outsideSince ||= now; else outsideSince = 0; }
        if (stealth) {
          if (insideSince && now - insideSince >= 140) revealed = true;
          if (!revealUntilEntry.current && outsideSince && now - outsideSince >= 260) revealed = false;
          if (revealUntilEntry.current) revealed = true;
        }
        setVisible(revealed);
        const target = inside ? document.elementFromPoint(x / scale, y / scale) : null;
        await setIgnored(!revealed || (passthrough && inside && !target?.closest("[data-interactive]")));
      } catch (reason) {
        // 失败后保持可交互，允许用户关闭窗口模式并重试。
        if (!disposed) { setStealth(false); setPassthrough(false); setVisible(true); toast.error(String(reason)); }
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 50);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [passthrough, stealth]);

  const toggleInputOnly = async () => {
    if (changingMode) return;
    setChangingMode(true);
    try { setInputOnly(await tauriCommands.videoWindow.setInputOnly(!inputOnly)); }
    catch (reason) { toast.error(String(reason)); }
    finally { setChangingMode(false); }
  };
  const togglePin = async () => {
    if (pinChanging.current) return;
    pinChanging.current = true;
    const next = !pinned;
    try { await appWindow.setAlwaysOnTop(next); setPinned(next); }
    catch (reason) { toast.error(String(reason)); }
    finally { pinChanging.current = false; }
  };
  const startDragging = () => { if (!locked) void appWindow.startDragging().catch((reason) => toast.error(String(reason))); };
  return { pinned, locked, inputOnly, changingMode, passthrough, stealth, visible, setLocked, setPassthrough, setStealth, togglePin, toggleInputOnly, startDragging };
}
