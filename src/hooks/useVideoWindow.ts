import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import type { Settings } from "@/types/bilibili";
import {
  DEFAULT_VIDEO_WINDOW_LOCAL,
  type VideoPlaybackSnapshot,
  type VideoWindowLocalPreferences,
  type VideoWindowPreferences,
} from "@/types/video-window";

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

function normalizeLocal(value: unknown): VideoWindowLocalPreferences {
  const source = value && typeof value === "object" ? (value as Partial<VideoWindowLocalPreferences>) : {};
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    subtitleRatio: number(source.subtitleRatio, 0, 1, DEFAULT_VIDEO_WINDOW_LOCAL.subtitleRatio),
    autoFollow: typeof source.autoFollow === "boolean" ? source.autoFollow : DEFAULT_VIDEO_WINDOW_LOCAL.autoFollow,
    showTime: typeof source.showTime === "boolean" ? source.showTime : DEFAULT_VIDEO_WINDOW_LOCAL.showTime,
  };
}

/**
 * 视频弹幕窗外观偏好。不透明度与字号直接读写全局设置——背景不透明度、弹幕字号与直播
 * 弹幕窗是同一项，字幕字号与听视频页是同一项（不再各自存私有副本）；仅视频特有的
 * 字幕区域比例/自动跟随/行内时间留在 selections 单独持久化。
 */
export function useVideoWindowPreferences() {
  const opacity = useSettingsStore((s) => s.settings.appearance.opacity);
  const danmakuFontSize = useSettingsStore((s) => s.settings.appearance.fontSize);
  const subtitleFontSize = useSettingsStore((s) => s.settings.listen.subtitleFontSize);
  const [local, setLocal] = useState<VideoWindowLocalPreferences>(() => DEFAULT_VIDEO_WINDOW_LOCAL);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    void tauriCommands.selections.load([PREFERENCES_KEY]).then((data) => {
      if (!disposed) setLocal(normalizeLocal(data[PREFERENCES_KEY]));
    }).catch((reason) => toast.error(`读取视频窗口设置失败，使用默认值。${String(reason)}`))
      .finally(() => { if (!disposed) setReady(true); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void tauriCommands.selections.save({ [PREFERENCES_KEY]: local }).catch((reason) => toast.error(`保存窗口设置失败。${String(reason)}`));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [local, ready]);

  const preferences: VideoWindowPreferences = { opacity, subtitleFontSize, danmakuFontSize, ...local };
  const setPreferences = useCallback((next: VideoWindowPreferences) => {
    // 共用项写回全局设置（与直播弹幕窗 commitSettings 同一条保存路径），特有项留在本地状态
    const { patchSettings, saveSettings } = useSettingsStore.getState();
    const commit = (partial: Partial<Settings>) => {
      patchSettings(partial);
      void saveSettings().catch((reason) => toast.error(`保存设置失败。${String(reason)}`));
    };
    if (next.opacity !== opacity) commit({ appearance: { opacity: next.opacity } } as Partial<Settings>);
    if (next.danmakuFontSize !== danmakuFontSize) commit({ appearance: { fontSize: next.danmakuFontSize } } as Partial<Settings>);
    if (next.subtitleFontSize !== subtitleFontSize) commit({ listen: { subtitleFontSize: next.subtitleFontSize } } as Partial<Settings>);
    setLocal({ subtitleRatio: next.subtitleRatio, autoFollow: next.autoFollow, showTime: next.showTime });
  }, [opacity, danmakuFontSize, subtitleFontSize]);
  return { preferences, setPreferences, ready };
}
