import {
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  Ghost,
  Loader2,
  Lock,
  LogOut,
  MousePointerClick,
  Pause,
  Pin,
  PinOff,
  Play,
  TextCursorInput,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import type { TitleBarButtons } from "@/types/bilibili";
import "./DanmakuWindow.css";

/** 原生窗口与播放行为由调用方接入，组件统一负责窗口交互和结构。 */
export interface DanmakuWindowControls {
  pinned: boolean;
  locked: boolean;
  passthrough: boolean;
  stealth: boolean;
  inputOnlyBusy?: boolean;
  onTogglePin: () => void;
  onToggleLock: () => void;
  onToggleInputOnly: () => void;
  onTogglePassthrough: () => void;
  onToggleStealth: () => void;
  onHide: () => void;
  onExit: () => void;
  onDrag: () => void;
  exitLabel: string;
}

export interface DanmakuWindowAudio {
  playing: boolean;
  loading: boolean;
  disabled: boolean;
  volume: number;
  muted: boolean;
  error?: string | null;
  playLabel: string;
  pauseLabel: string;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  status?: ReactNode;
}

export function DanmakuWindowButton({
  title,
  active,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`danmaku-window-icon${active ? " is-active" : ""} ${className}`}
      {...props}
    />
  );
}

function DanmakuTitleBar({
  title,
  controls,
  switcher,
}: {
  title: string;
  controls: DanmakuWindowControls;
  switcher?: ReactNode;
}) {
  const visible = useSettingsStore(
    (state) => state.settings.appearance.titleBarButtons,
  );
  const actions: {
    key: keyof TitleBarButtons;
    title: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    icon: ReactNode;
  }[] = [
    {
      key: "pin",
      title: controls.pinned ? "取消置顶" : "置顶",
      active: controls.pinned,
      onClick: controls.onTogglePin,
      icon: controls.pinned ? <Pin /> : <PinOff />,
    },
    {
      key: "lock",
      title: controls.locked ? "解锁位置" : "锁定位置",
      active: controls.locked,
      onClick: controls.onToggleLock,
      icon: controls.locked ? <Lock /> : <Unlock />,
    },
    {
      key: "inputOnly",
      title: "仅输入框模式",
      disabled: controls.inputOnlyBusy,
      onClick: controls.onToggleInputOnly,
      icon: <TextCursorInput />,
    },
    {
      key: "passthrough",
      title: controls.passthrough ? "关闭窗口透传" : "开启窗口透传",
      active: controls.passthrough,
      onClick: controls.onTogglePassthrough,
      icon: <MousePointerClick />,
    },
    {
      key: "stealth",
      title: controls.stealth ? "关闭隐身" : "开启隐身（鼠标离开自动隐藏）",
      active: controls.stealth,
      onClick: controls.onToggleStealth,
      icon: <Ghost />,
    },
    {
      key: "close",
      title: "隐藏到托盘",
      onClick: controls.onHide,
      icon: <X />,
    },
  ];
  return (
    <header
      className="danmaku-window-titlebar danmaku-bg-bar"
      role="toolbar"
      aria-label="窗口控制"
      data-interactive
      onMouseDown={(event) => {
        if (
          event.button !== 0 ||
          controls.locked ||
          (event.target as HTMLElement).closest(
            "button,input,textarea,[role='option']",
          )
        )
          return;
        controls.onDrag();
      }}
    >
      <span title={title}>{title}</span>
      {actions
        .filter((action) => visible[action.key] ?? true)
        .map((action) => (
          <DanmakuWindowButton
            key={action.key}
            title={action.title}
            active={action.active}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.icon}
          </DanmakuWindowButton>
        ))}
      {(visible.roomSwitcher ?? true) && switcher}
      <DanmakuWindowButton
        title={controls.exitLabel}
        className="danmaku-window-exit"
        onClick={controls.onExit}
      >
        <LogOut />
      </DanmakuWindowButton>
    </header>
  );
}

function DanmakuAudioControls({ audio }: { audio: DanmakuWindowAudio }) {
  const [volumeOpen, setVolumeOpen] = useState(false);
  return (
    <div className="danmaku-window-audio danmaku-bg-panel" data-interactive>
      <DanmakuWindowButton
        title={
          audio.error ?? (audio.playing ? audio.pauseLabel : audio.playLabel)
        }
        active={audio.playing}
        disabled={audio.disabled || audio.loading}
        onClick={audio.onTogglePlay}
      >
        {audio.loading ? (
          <Loader2 className="animate-spin" />
        ) : audio.playing ? (
          <Pause />
        ) : (
          <Play />
        )}
      </DanmakuWindowButton>
      <div
        className="danmaku-window-volume"
        onMouseEnter={() => setVolumeOpen(true)}
        onMouseLeave={() => setVolumeOpen(false)}
      >
        <DanmakuWindowButton
          title={audio.muted || audio.volume === 0 ? "取消静音" : "静音"}
          onClick={audio.onToggleMute}
        >
          {audio.muted || audio.volume === 0 ? <VolumeX /> : <Volume2 />}
        </DanmakuWindowButton>
        <div
          className={`danmaku-window-volume-popup${volumeOpen ? " is-open" : ""}`}
        >
          <input
            type="range"
            aria-label="音量"
            min={0}
            max={100}
            value={audio.muted ? 0 : Math.round(audio.volume)}
            onChange={(event) =>
              audio.onVolumeChange(event.target.valueAsNumber)
            }
          />
        </div>
      </div>
      {audio.status}
    </div>
  );
}

export function DanmakuWindow({
  title,
  controls,
  audio,
  switcher,
  compact = false,
  footer,
  children,
  className = "",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: string;
  controls: DanmakuWindowControls;
  audio: DanmakuWindowAudio;
  switcher?: ReactNode;
  compact?: boolean;
  footer?: ReactNode;
}) {
  return (
    <main className={`danmaku-window window-rounded ${className}`} {...props}>
      {!compact && (
        <>
          <DanmakuTitleBar
            title={title}
            controls={controls}
            switcher={switcher}
          />
          <DanmakuAudioControls audio={audio} />
        </>
      )}
      {children}
      {footer}
    </main>
  );
}
