import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Check, ListVideo } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/i18n";
import { VideoWindowComposer } from "@/components/listen/VideoWindowComposer";
import { VideoSeekBar } from "@/components/listen/VideoSeekBar";
import { VideoTimelinePane, type VideoTimelineItem } from "@/components/listen/VideoTimelinePane";
import { DanmakuWindow, DanmakuWindowButton as WindowButton } from "@/components/danmaku/DanmakuWindow";
import { WindowSplitter } from "@/components/danmaku/WindowSplitter";
import { PanelListRow, PanelShell } from "@/components/ui/DanmakuPanel";
import { useDanmakuWindowAppearance } from "@/hooks/useDanmakuWindowAppearance";
import { usePanelDismiss } from "@/hooks/usePanelDismiss";
import { VideoWindowSettings } from "@/components/listen/VideoWindowSettings";
import { useVideoPlayback, useVideoWindowPreferences } from "@/hooks/useVideoWindow";
import { useSttModelReady } from "@/hooks/useSttModelReady";
import { useVideoStt } from "@/hooks/useVideoStt";
import { tauriCommands } from "@/lib/tauri";
import { formatClock } from "@/lib/time";
import { queryClient } from "@/lib/query-client";
import type { VideoDanmaku, VideoPlaybackAction } from "@/types/video-window";
import "./video-danmaku.css";

export function VideoDanmakuPage() {
  const { t: translate } = useDesktopTranslation("desktop");
  const { t } = useTranslation("danmaku");
  const { playback, error: connectionError } = useVideoPlayback();
  const { preferences, setPreferences, ready } = useVideoWindowPreferences();
  const appearanceStyle = useDanmakuWindowAppearance();
  const [panel, setPanel] = useState<"settings" | "videos" | null>(null);
  const [sent, setSent] = useState<{ key: string; items: VideoDanmaku[] }>({ key: "", items: [] });
  const [followKey, setFollowKey] = useState(0);
  const mutedVolume = useRef(50);
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
  // 有官方 CC 时用 CC；CC 检查完成且没有字幕时才允许语音识别生成
  const ccLines = subtitles.data ?? [];
  const sttAllowed = !subtitles.isPending && ccLines.length === 0;
  const stt = useVideoStt(bvid, cid, sttAllowed);
  const sttModelReady = useSttModelReady(sttAllowed);
  const sttPercent = Math.round(stt.progress * 100);
  const sttStatus = !sttAllowed ? null
    : stt.status === "downloading" ? translate("videoWindow.downloading", { value: sttPercent })
      : stt.status === "decoding" ? translate("videoWindow.loadingModel")
        : stt.status === "recognizing" ? translate("videoWindow.recognizing", { value: sttPercent })
          : null;
  const sttAction = !sttAllowed || stt.busy || stt.lines.length > 0 ? undefined
    : sttModelReady === null ? { label: translate("videoWindow.checkingModel"), onClick: () => {}, disabled: true }
      : sttModelReady === false ? { label: translate("videoWindow.installModel"), onClick: () => {}, disabled: true }
        : { label: stt.error ? translate("videoWindow.retrySpeech") : translate("videoWindow.generateSubtitles"), onClick: () => { void stt.start(); } };
  const subtitleItems = useMemo<VideoTimelineItem[]>(() => {
    const lines = ccLines.length > 0 ? ccLines : stt.lines;
    return lines.map((line, index) => ({
      id: `${line.from}-${index}`, time: line.from, end: line.to, content: line.content,
    }));
  }, [ccLines, stt.lines]);
  const danmakuItems = useMemo<VideoTimelineItem[]>(() => {
    const items = new Map(danmaku.items.map((item) => [item.id, item]));
    if (sent.key === identity) sent.items.forEach((item) => items.set(item.id, item));
    return [...items.values()].sort((a, b) => a.progress - b.progress)
      .map((item) => ({ id: item.id, time: item.progress, content: item.content }));
  }, [danmaku.items, sent, identity]);

  usePanelDismiss({
    open: panel !== null,
    onClose: () => setPanel(null),
    ignoreRef: popoverRef,
    triggerSelector: "[data-video-panel-trigger]",
  });

  const control = (action: VideoPlaybackAction) => {
    if (!playback) return;
    void tauriCommands.videoWindow.control(playback.bvid, playback.cid, action).catch((reason) => toast.error(String(reason)));
  };
  const seek = (time: number) => {
    control({ action: "seek", value: time });
    setFollowKey((value) => value + 1);
  };
  const togglePanel = (next: "settings" | "videos") => setPanel((previous) => previous === next ? null : next);

  return <DanmakuWindow className="video-danmaku-window"
    style={{ ...appearanceStyle, "--bg-a": preferences.opacity / 100 } as CSSProperties}
    title={playback?.title.trim() ? playback.title : t("videoWindow")}
    exitLabel={t("exitVideo")}
    onExit={() => { void tauriCommands.videoWindow.close().catch((reason) => toast.error(String(reason))); }}
    switcher={<WindowButton title={t("switchVideo")} data-video-panel-trigger="" active={panel === "videos"} onClick={() => togglePanel("videos")}><ListVideo /></WindowButton>}
    audio={{
      playing: playback?.playing ?? false, loading: playback?.loading ?? false, disabled: !cid,
      volume: playback?.volume ?? 0, muted: playback?.volume === 0,
      playLabel: t("playAudio"), pauseLabel: t("pauseAudio"),
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
      <VideoSeekBar key={identity} currentTime={currentTime} duration={duration}
        disabled={!duration || !!playback?.loading} onSeek={seek} onScrubStart={() => setPanel(null)} />
      <VideoWindowComposer playback={playback} settingsOpen={panel === "settings"} settingsReady={ready}
        onToggleSettings={() => togglePanel("settings")} onSent={(item) => {
          setSent((previous) => ({ key: identity, items: [...(previous.key === identity ? previous.items : []), item] }));
          setFollowKey((value) => value + 1);
        }} />
      {panel && (
        <div className="video-window-panel-host">
          {panel === "settings" && (
            <VideoWindowSettings preferences={preferences} onChange={setPreferences} onClose={() => setPanel(null)} />
          )}
          {panel === "videos" && (
            <PanelShell title={translate("videoWindow.playlist")} variant="sheet" onClose={() => setPanel(null)} ariaLabel={t("switchVideo")}>
              <div className="panel-list">
                {playback?.tracks.map((track, index) => (
                  <PanelListRow
                    key={track.key}
                    label={track.title}
                    selected={index === playback.index}
                    right={index === playback.index ? <Check className="h-3.5 w-3.5" /> : undefined}
                    onClick={() => {
                      control({ action: "selectTrack", value: track.key });
                      setPanel(null);
                    }}
                  />
                ))}
              </div>
            </PanelShell>
          )}
        </div>
      )}
    </footer>}>
    <>
      {(connectionError || playback?.error) && <div className="video-window-error" role="alert" data-interactive>
        <span>{connectionError ?? playback?.error}</span>
        {playback?.error && <button type="button" onClick={() => control({ action: "selectTrack", value: playback.tracks[playback.index].key })}>{translate("videoWindow.retryPlay")}</button>}
      </div>}
      <div className="video-window-timelines" style={{ gridTemplateRows: `minmax(0, ${preferences.subtitleRatio}fr) 5px minmax(0, ${1 - preferences.subtitleRatio}fr)` }}>
        <VideoTimelinePane key={`subtitles-${identity}`} title={t("subtitles")} items={subtitleItems} currentTime={currentTime}
          collapsed={preferences.subtitleRatio === 0}
          loading={subtitles.isPending} error={subtitles.error ? String(subtitles.error) : null}
          empty={ccLines.length > 0 ? t("noSubtitles") : stt.error ?? t("noSubtitlesWithStt")}
          action={ccLines.length > 0 ? undefined : sttAction}
          status={ccLines.length > 0 ? null : sttStatus}
          fontSize={preferences.danmakuFontSize} showTime={preferences.showTime} autoFollow={preferences.autoFollow} followKey={followKey}
          onSeek={seek} onRetry={() => void subtitles.refetch()} />
        <WindowSplitter ratio={preferences.subtitleRatio} resetRatio={0.5} disabled={!ready}
          onChange={(subtitleRatio) => setPreferences({ ...preferences, subtitleRatio })} />
        <VideoTimelinePane key={`danmaku-${identity}`} title={t("messages")} items={danmakuItems} currentTime={currentTime}
          collapsed={preferences.subtitleRatio === 1}
          loading={danmaku.loading} error={danmaku.error} empty={t("noVideoMessages")}
          fontSize={preferences.danmakuFontSize} showTime={preferences.showTime} autoFollow={preferences.autoFollow} followKey={followKey}
          onSeek={seek} onRetry={() => void queryClient.invalidateQueries({ queryKey: ["video-danmaku", cid] })} />
      </div>
    </>
  </DanmakuWindow>;
}
