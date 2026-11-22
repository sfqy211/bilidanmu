import { useTranslation as useDesktopTranslation } from "@/i18n";
import { type CSSProperties } from "react";
import { Layers, ListOrdered, Loader2, MessageSquare, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useVideoAudioStore, type PlayMode } from "@/stores/video-audio-store";
import { formatClock } from "@/lib/time";

const MODE_ICON: Record<PlayMode, typeof Repeat> = {
  order: ListOrdered,
  shuffle: Shuffle,
  "repeat-one": Repeat1,
  "repeat-all": Repeat,
};

const MODE_LABEL = {
  order: "player.order",
  shuffle: "player.shuffle",
  "repeat-one": "player.repeatOne",
  "repeat-all": "player.repeatAll",
} as const satisfies Record<PlayMode, string>;

export function PlayerControls({ onComments, treeOpen, onToggleTree }: {
  onComments: () => void;
  treeOpen: boolean;
  onToggleTree: () => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const { video, queue, index, playing, loading, currentTime, duration, volume, togglePlay, next, prev, seek, setVolume, playMode, cyclePlayMode, canNext, canPrev } = useVideoAudioStore();

  const track = queue?.tracks[index];
  if (!video || !queue || !track) return null;
  const displayDuration = duration || track.duration || 0;
  return (
    <footer className="listen-player-footer">
      <input type="range" aria-label={translate("player.progress")} min={0} max={Math.max(1, displayDuration)} step={0.1}
        value={Math.min(currentTime, displayDuration)} disabled={!displayDuration} onChange={(event) => seek(event.target.valueAsNumber)}
        className="listen-player-progress" style={{ "--listen-progress": `${displayDuration ? Math.min(100, Math.max(0, currentTime / displayDuration * 100)) : 0}%` } as CSSProperties} />
      <div className="numeric mt-1 flex justify-between text-xs text-ink-muted">
        <span>{formatClock(currentTime)}</span><span>{formatClock(displayDuration)}</span>
      </div>
      <div className="listen-player-controls">
        <button type="button" onClick={onComments} className="workspace-button listen-player-comments" title={translate("player.showComments")}><MessageSquare className="h-4 w-4" />{translate("player.comments")}</button>
        <div className="listen-player-transport">
          <button type="button" onClick={() => void prev()} disabled={!canPrev()} aria-label={translate("player.previous")} className="workspace-button workspace-icon-button"><SkipBack className="h-5 w-5" /></button>
          <button type="button" onClick={() => void togglePlay()} aria-label={playing ? translate("player.pause") : translate("player.play")} className="listen-player-play">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => void next()} disabled={!canNext()} aria-label={translate("player.next")} className="workspace-button workspace-icon-button"><SkipForward className="h-5 w-5" /></button>
        </div>
        <div className="listen-player-extras">
          <button
            type="button"
            onClick={cyclePlayMode}
            className="workspace-button workspace-icon-button"
            title={translate(MODE_LABEL[playMode])}
            aria-label={translate(MODE_LABEL[playMode])}
          >
            {(() => {
              const ModeIcon = MODE_ICON[playMode];
              return <ModeIcon className="h-4 w-4" />;
            })()}
          </button>
          <button
            type="button"
            onClick={onToggleTree}
            aria-pressed={treeOpen}
            className={`workspace-button workspace-icon-button${treeOpen ? " listen-player-tree-open" : ""}`}
            title={treeOpen ? translate("player.hideQueue") : translate("player.showQueue")}
            aria-label={treeOpen ? translate("player.hideQueue") : translate("player.showQueue")}
          >
            <Layers className="h-4 w-4" />
          </button>
          <div className="listen-player-volume">
            <Volume2 className="h-4 w-4 shrink-0 text-ink-muted" />
            <input type="range" aria-label={translate("player.volume")} min={0} max={100} value={volume} onChange={(event) => setVolume(event.target.valueAsNumber)} className="min-w-0 flex-1 accent-brand" />
            <span className="numeric text-xs text-ink-muted">{volume}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
