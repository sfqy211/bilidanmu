import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Check, ListVideo, X } from "lucide-react";
import { toast } from "sonner";
import { VideoWindowComposer } from "@/components/listen/VideoWindowComposer";
import { VideoSeekBar } from "@/components/listen/VideoSeekBar";
import { VideoTimelinePane, type VideoTimelineItem } from "@/components/listen/VideoTimelinePane";
import { DanmakuWindow, DanmakuWindowButton as WindowButton } from "@/components/danmaku/DanmakuWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDanmakuWindowAppearance } from "@/hooks/useDanmakuWindowAppearance";
import { VideoWindowSettings } from "@/components/listen/VideoWindowSettings";
import { useVideoPlayback, useVideoWindowModes, useVideoWindowPreferences } from "@/hooks/useVideoWindow";
import { tauriCommands } from "@/lib/tauri";
import { formatClock } from "@/lib/time";
import { queryClient } from "@/lib/query-client";
import type { VideoDanmaku, VideoPlaybackAction } from "@/types/video-window";
import "./video-danmaku.css";

export function VideoDanmakuPage() {
  const { playback, error: connectionError } = useVideoPlayback();
  const modes = useVideoWindowModes();
  const { preferences, setPreferences, ready } = useVideoWindowPreferences();
  const appearanceStyle = useDanmakuWindowAppearance();
  const [panel, setPanel] = useState<"settings" | "videos" | null>(null);
  const [sent, setSent] = useState<{ key: string; items: VideoDanmaku[] }>({ key: "", items: [] });
  const [followKey, setFollowKey] = useState(0);
  const mutedVolume = useRef(50);
  const contentRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const bvid = playback?.bvid;
  const cid = playback?.cid;
  const currentTime = playback?.currentTime ?? 0;
  const identity = `${bvid ?? ""}:${cid ?? ""}`;
  const segment = Math.floor(currentTime / 360) + 1;
  const duration = playback?.duration ?? 0;
  const totalSegments = Math.max(1, Math.ceil(duration / 360));
  const segments = [segment - 1, segment, segment + 1].filter((value) => value > 0 && value <= totalSegments);
  const subtitles = useQuery({
    queryKey: ["video-subtitles", bvid, cid], enabled: !!bvid && !!cid,
    queryFn: () => tauriCommands.video.getSubtitle(bvid!, cid!), staleTime: 300_000,
  });
  const combineDanmaku = useCallback((results: UseQueryResult<VideoDanmaku[]>[]) => {
    const current = results[segment > 1 ? 1 : 0];
    return {
      items: results.flatMap((result) => result.data ?? []).sort((a, b) => a.progress - b.progress),
      loading: current?.isPending ?? true,
      error: current?.error ? String(current.error) : null,
    };
  }, [segment]);
  const danmaku = useQueries({
    queries: segments.map((part) => ({
      queryKey: ["video-danmaku", cid, part], enabled: !!cid,
      queryFn: () => tauriCommands.video.getDanmaku(cid!, part), staleTime: 300_000,
    })),
    combine: combineDanmaku,
  });
  const subtitleItems = useMemo<VideoTimelineItem[]>(() => (subtitles.data ?? []).map((line, index) => ({
    id: `${line.from}-${index}`, time: line.from, end: line.to, content: line.content,
  })), [subtitles.data]);
  const danmakuItems = useMemo<VideoTimelineItem[]>(() => {
    const items = new Map(danmaku.items.map((item) => [item.id, item]));
    if (sent.key === identity) sent.items.forEach((item) => items.set(item.id, item));
    return [...items.values()].sort((a, b) => a.progress - b.progress)
      .map((item) => ({ id: item.id, time: item.progress, content: item.content }));
  }, [danmaku.items, sent, identity]);

  useEffect(() => { document.title = playback?.title ?? "视频弹幕"; }, [playback?.title]);
  useEffect(() => {
    document.documentElement.setAttribute("data-transparent", "");
    return () => { document.documentElement.removeAttribute("data-transparent"); };
  }, []);
  useEffect(() => {
    if (!panel) return;
    const dismiss = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest("[data-video-panel-trigger]")) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [panel]);

  const control = (action: VideoPlaybackAction) => {
    if (!playback) return;
    void tauriCommands.videoWindow.control(playback.bvid, playback.cid, action).catch((reason) => toast.error(String(reason)));
  };
  const seek = (time: number) => {
    control({ action: "seek", value: time });
    setFollowKey((value) => value + 1);
  };
  const togglePanel = (next: "settings" | "videos") => setPanel((previous) => previous === next ? null : next);

  return <DanmakuWindow className={`video-danmaku-window${modes.inputOnly ? " is-input-only" : ""}`}
    style={{ ...appearanceStyle, "--bg-a": preferences.opacity / 100, opacity: modes.visible ? 1 : 0 } as CSSProperties}
    onContextMenu={(event) => { if (!import.meta.env.DEV) event.preventDefault(); }}
    title={playback?.title ?? "视频弹幕"} compact={modes.inputOnly}
    controls={{
      pinned: modes.pinned, locked: modes.locked, passthrough: modes.passthrough, stealth: modes.stealth,
      inputOnlyBusy: modes.changingMode,
      onTogglePin: () => { void modes.togglePin(); },
      onToggleLock: () => modes.setLocked((value) => !value),
      onToggleInputOnly: () => { setPanel(null); void modes.toggleInputOnly(); },
      onTogglePassthrough: () => modes.setPassthrough((value) => !value),
      onToggleStealth: () => modes.setStealth((value) => !value),
      onHide: () => { void getCurrentWindow().close().catch((reason) => toast.error(String(reason))); },
      onExit: () => { void tauriCommands.videoWindow.close().catch((reason) => toast.error(String(reason))); },
      onDrag: modes.startDragging, exitLabel: "退出弹幕模式，返回视频页",
    }}
    switcher={<WindowButton title="切换视频" data-video-panel-trigger="" active={panel === "videos"} onClick={() => togglePanel("videos")}><ListVideo /></WindowButton>}
    audio={{
      playing: playback?.playing ?? false, loading: playback?.loading ?? false, disabled: !cid,
      volume: playback?.volume ?? 0, muted: playback?.volume === 0,
      playLabel: "播放音频", pauseLabel: "暂停音频",
      onTogglePlay: () => control({ action: "togglePlay" }),
      onToggleMute: () => {
        const volume = playback?.volume ?? 0;
        if (volume > 0) mutedVolume.current = volume;
        control({ action: "volume", value: volume > 0 ? 0 : mutedVolume.current });
      },
      onVolumeChange: (value) => control({ action: "volume", value }),
      status: <span className="numeric">{formatClock(currentTime)} / {formatClock(duration)}</span>,
    }}
    footer={<footer className="video-window-footer danmaku-bg-bar" data-interactive ref={popoverRef}>
      {!modes.inputOnly && <VideoSeekBar key={identity} currentTime={currentTime} duration={duration}
        disabled={!duration || !!playback?.loading} onSeek={seek} onScrubStart={() => setPanel(null)} />}
      {panel === "settings" && <VideoWindowSettings preferences={preferences} onChange={setPreferences} onClose={() => setPanel(null)} />}
      {panel === "videos" && <section className="video-window-popover video-window-videos" aria-label="切换视频" data-interactive>
        <header><h2>播放列表</h2><WindowButton title="关闭播放列表" onClick={() => setPanel(null)}><X /></WindowButton></header>
        <div>{playback?.tracks.map((track, index) => <button type="button" key={track.key} aria-current={index === playback.index ? "true" : undefined}
          onClick={() => { control({ action: "selectTrack", value: track.key }); setPanel(null); }}><span>{track.title}</span>{index === playback.index && <Check />}</button>)}</div>
      </section>}
      <VideoWindowComposer playback={playback} modes={modes} settingsOpen={panel === "settings"} settingsReady={ready}
        onToggleSettings={() => togglePanel("settings")} onSent={(item) => {
          setSent((previous) => ({ key: identity, items: [...(previous.key === identity ? previous.items : []), item] }));
          setFollowKey((value) => value + 1);
        }} />
    </footer>}>
    {!modes.inputOnly && <>
      {(connectionError || playback?.error) && <div className="video-window-error" role="alert" data-interactive>
        <span>{connectionError ?? playback?.error}</span>
        {playback?.error && <button type="button" onClick={() => control({ action: "selectTrack", value: playback.tracks[playback.index].key })}>重试播放</button>}
      </div>}
      <div className="video-window-timelines" ref={contentRef} style={{ gridTemplateRows: `minmax(0, ${preferences.subtitleRatio}fr) 5px minmax(0, ${1 - preferences.subtitleRatio}fr)` }}>
        <VideoTimelinePane key={`subtitles-${identity}`} title="字幕" items={subtitleItems} currentTime={currentTime}
          loading={subtitles.isPending} error={subtitles.error ? String(subtitles.error) : null} empty="这个视频还没有字幕，可继续听音频和查看弹幕"
          fontSize={preferences.subtitleFontSize} showTime={preferences.showTime} autoFollow={preferences.autoFollow} followKey={followKey}
          onSeek={seek} onRetry={() => void subtitles.refetch()} />
        <div className="video-window-divider" data-interactive role="separator" aria-label="调整字幕与弹幕区域比例" aria-orientation="horizontal"
          tabIndex={0} aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(preferences.subtitleRatio * 100)}
          onDoubleClick={() => setPreferences({ ...preferences, subtitleRatio: 0.5 })}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            setPreferences({ ...preferences, subtitleRatio: Math.max(0.2, Math.min(0.8, preferences.subtitleRatio + (event.key === "ArrowDown" ? 0.05 : -0.05))) });
          }} onPointerDown={(event) => { if (ready) event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || !contentRef.current) return;
            const rect = contentRef.current.getBoundingClientRect();
            setPreferences({ ...preferences, subtitleRatio: Math.max(0.2, Math.min(0.8, (event.clientY - rect.top) / rect.height)) });
          }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
        <VideoTimelinePane key={`danmaku-${identity}`} title="弹幕" items={danmakuItems} currentTime={currentTime}
          loading={danmaku.loading} error={danmaku.error} empty="当前时段还没有弹幕"
          fontSize={preferences.danmakuFontSize} showTime={preferences.showTime} autoFollow={preferences.autoFollow} followKey={followKey}
          onSeek={seek} onRetry={() => void queryClient.invalidateQueries({ queryKey: ["video-danmaku", cid] })} />
      </div>
    </>}
  </DanmakuWindow>;
}
