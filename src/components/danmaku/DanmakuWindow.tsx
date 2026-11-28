import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
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
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands } from "@/lib/tauri";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useZoom } from "@/hooks/useZoom";
import { useWindowDock, type DockSide } from "@/hooks/useWindowDock";
import {
  usePassthroughHitTest,
  useStealthMode,
  useWindowPinnedLocked,
} from "@/hooks/useDanmakuWindowModes";
import { useSettingsStore } from "@/stores/settings-store";
import { DockCollapsedBar } from "@/components/DockCollapsedBar";
import { useTranslation } from "@/i18n";
import type { TitleBarButtons } from "@/types/bilibili";
import "./DanmakuWindow.css";

const appWindow = getCurrentWindow();

/** 标题栏渲染所需的窗口状态与动作（由 DanmakuWindow 内部组装后传入）。 */
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
}: ComponentPropsWithRef<"button"> & { active?: boolean }) {
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
  showInputOnly,
}: {
  title: string;
  controls: DanmakuWindowControls;
  switcher?: ReactNode;
  /** 组件未接入仅输入框能力时隐藏该按钮（能力本身保留在组件里可随时启用） */
  showInputOnly: boolean;
}) {
  const { t } = useTranslation(["danmaku", "common"]);
  const visible = useSettingsStore(
    (state) => state.settings.appearance.titleBarButtons,
  );
  const actions: {
    key: keyof TitleBarButtons;
    title: string;
    active?: boolean;
    disabled?: boolean;
    enabled?: boolean;
    onClick: () => void;
    icon: ReactNode;
  }[] = [
    {
      key: "pin",
      title: t(controls.pinned ? "unpin" : "pin"),
      active: controls.pinned,
      onClick: controls.onTogglePin,
      icon: controls.pinned ? <Pin /> : <PinOff />,
    },
    {
      key: "lock",
      title: t(controls.locked ? "unlock" : "lock"),
      active: controls.locked,
      onClick: controls.onToggleLock,
      icon: controls.locked ? <Lock /> : <Unlock />,
    },
    {
      key: "inputOnly",
      title: t("inputOnly"),
      enabled: showInputOnly,
      disabled: controls.inputOnlyBusy,
      onClick: controls.onToggleInputOnly,
      icon: <TextCursorInput />,
    },
    {
      key: "passthrough",
      title: t(controls.passthrough ? "passthroughOff" : "passthroughOn"),
      active: controls.passthrough,
      onClick: controls.onTogglePassthrough,
      icon: <MousePointerClick />,
    },
    {
      key: "stealth",
      title: t(controls.stealth ? "stealthOff" : "stealthOn"),
      active: controls.stealth,
      onClick: controls.onToggleStealth,
      icon: <Ghost />,
    },
    {
      key: "close",
      title: t("common:window.hide"),
      onClick: controls.onHide,
      icon: <X />,
    },
  ];
  return (
    <header
      className="danmaku-window-titlebar danmaku-bg-bar"
      role="toolbar"
      aria-label={t("toolbar")}
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
        .filter((action) => (action.enabled ?? true) && (visible[action.key] ?? true))
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
  const { t } = useTranslation("danmaku");
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
          title={t(audio.muted || audio.volume === 0 ? "unmute" : "mute")}
          onClick={audio.onToggleMute}
        >
          {audio.muted || audio.volume === 0 ? <VolumeX /> : <Volume2 />}
        </DanmakuWindowButton>
        <div
          className={`danmaku-window-volume-popup${volumeOpen ? " is-open" : ""}`}
        >
          <input
            type="range"
            aria-label={t("volume")}
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

/** 组件回传给内容区的窗口状态（内容需要按锁定/透传/隐身自行调整交互时使用）。 */
export interface DanmakuWindowState {
  locked: boolean;
  passthrough: boolean;
  stealthEnabled: boolean;
  stealthVisible: boolean;
  inputOnlyActive: boolean;
}

/** 仅输入框能力：启用后整窗缩为一行输入栏，内容由消费方的 renderBar 提供。 */
export interface DanmakuWindowInputOnly {
  active: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** 紧凑栏内容；locked 供拖拽把手判定（锁定位置时只响应点击恢复） */
  renderBar: (state: { locked: boolean }) => ReactNode;
  /** 紧凑栏容器额外样式（如强调色变量） */
  barStyle?: CSSProperties;
}

/**
 * 弹幕小窗组件：窗口级行为全部内聚——标题栏按钮、置顶/锁定、隐身/透传（含淡出）、
 * 侧边吸附收缩与滑入滑出、仅输入框形态、隐藏到托盘、透明背景与右键菜单抑制。
 * 消费方只负责内容区（children / footer）与音频源（audio）。
 * 直播弹幕窗与视频弹幕窗都是本组件的消费方；第三方也可以直接用本组件二次开发。
 */
export function DanmakuWindow({
  title,
  audio,
  switcher,
  footer,
  children,
  exitLabel,
  onExit,
  inputOnly,
  className = "",
  style,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title" | "children"> & {
  title: string;
  audio: DanmakuWindowAudio;
  switcher?: ReactNode;
  footer?: ReactNode;
  /** 内容区；需要窗口状态时用 render prop 形式 */
  children?: ReactNode | ((state: DanmakuWindowState) => ReactNode);
  /** 退出按钮的提示文案与行为（退出直播间 / 退出弹幕模式） */
  exitLabel: string;
  onExit: () => void;
  /** 仅输入框能力（可选）：不传时标题栏不出现该按钮 */
  inputOnly?: DanmakuWindowInputOnly;
}) {
  // ── 窗口级状态：置顶/锁定、隐身、透传、字号缩放 ──
  // Ctrl+滚轮调弹幕字号：直播与视频两种内容形态共用同一套外观设置（appearance.fontSize）
  useZoom();
  const { pinned, locked, setLocked, togglePin, startDragging } = useWindowPinnedLocked();
  const stealth = useStealthMode();
  const [passthrough, setPassthrough] = useState(false);
  usePassthroughHitTest(passthrough, stealth.enabled, stealth.visible);

  // 隐身淡出层：窗口本身是真透明，内容整体淡出即为"隐身"。
  // 显示比隐藏快一点：悬停要跟手，离开后渐隐不突兀
  const stealthFadeMs = useReducedMotion() ? 0 : stealth.visible ? 120 : 200;

  // 无边框透明窗口：挂上文档级标记让全局 CSS 切到透明背景，卸载时移除
  useEffect(() => {
    document.documentElement.dataset.transparent = "true";
    return () => {
      delete document.documentElement.dataset.transparent;
    };
  }, []);

  // Windows 下弹幕小窗是不可激活窗口（点击不抢前台，见 window_shell.rs），
  // 避免全屏应用上点击小窗时系统任务栏被重新拉起。鼠标点击、滚动、拖动和
  // 按钮都不需要激活即可工作，但文本输入需要键盘焦点：按下输入类控件时
  // 显式激活窗口。
  useEffect(() => {
    const textEntryFrom = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      const element = target.closest<HTMLElement>(
        "textarea, input, [contenteditable]:not([contenteditable='false'])",
      );
      if (!element) return null;
      if (element instanceof HTMLInputElement) {
        const type = (element.getAttribute("type") ?? "text").toLowerCase();
        // 只认文本输入类控件：range/checkbox/button 之类不需要键盘焦点，
        // 点击它们不应该把窗口拉到前台。
        if (!["text", "number", "search", "password", "url", "email", "tel"].includes(type)) {
          return null;
        }
      }
      return element;
    };
    const activateForTextEntry = (event: MouseEvent) => {
      const element = textEntryFrom(event.target);
      if (!element || element.matches(":disabled, [readonly]")) return;
      // 弹幕发送栏会先尝试在全屏宿主中接收键盘输入，自行处理常规聚焦回退。
      if (event.button === 0 && element.hasAttribute("data-fullscreen-input")) return;
      void appWindow
        .setFocus()
        // 激活后再补一次 DOM 焦点：窗口此前不在前台时，按下鼠标的默认
        // 聚焦行为可能被吞掉，导致激活后第一次输入落空
        .then(() => element.focus())
        .catch(() => {});
    };
    document.addEventListener("mousedown", activateForTextEntry, true);
    return () => document.removeEventListener("mousedown", activateForTextEntry, true);
  }, []);

  const inputOnlyActive = inputOnly?.active ?? false;

  // 侧边吸附（贴边收缩/悬停展开）属于「弹幕小窗」的窗口级行为，直播与视频两种
  // 内容形态共用：进入收起态整窗换成收缩条，展开/收回时内容滑入滑出。
  const { phase: dockPhase, side: dockSide, expand: dockExpand } = useWindowDock();
  const preferredDockAnimMs = useSettingsStore((s) => s.settings.appearance.dockAnimMs);
  const dockAnimMs = useReducedMotion() ? 0 : preferredDockAnimMs;

  // 侧边吸附滑动动画：展开时内容从屏幕边缘滑入，收回时向边缘滑出。
  // 展开流程：后端 dock_expand 只更新状态+发事件（不缩放），前端收到事件后先以
  // hidden transform 挂载主内容，双 rAF 等该帧上屏，再回调 dock_apply_expand 让
  // 后端 set_size/set_position，并等其返回（窗口确已放大）后才解除 hidden 触发
  // CSS transition 滑入——四步串行保证任何时刻屏幕上都不会出现旧内容：
  // 未上屏就扩窗，旧帧的收缩条会在放大区左上角闪现；未放大就解除 hidden，
  // 滑入动画会在小窗里提前跑掉。收回流程不变：光标离开 250ms 后后端发
  // collapsing，前端播滑出动画，动画结束回调 dock_collapse 才真正缩窗。
  const [slideIn, setSlideIn] = useState(false);
  const [slideOut, setSlideOut] = useState(false);
  const [animSide, setAnimSide] = useState<DockSide>(dockSide);
  // 吸附动画时长（设置项）。effect 内只读 ref，避免改设置时重跑动画 effect
  const dockAnimMsRef = useRef(dockAnimMs);
  dockAnimMsRef.current = dockAnimMs;
  // 展开动画解除 hidden 用的 rAF 句柄（applyExpand 完成后才排入，供 effect 清理取消）
  const unhideRafRef = useRef<number | null>(null);
  const dockPhaseRef = useRef(dockPhase);
  dockPhaseRef.current = dockPhase;

  // 在 render 阶段同步检测 collapsed→expanded 转换，确保首次绘制就处于屏幕外（消除闪现）
  const prevPhaseForSlide = useRef(dockPhase);
  const justExpanded = prevPhaseForSlide.current === "collapsed" && dockPhase === "expanded";
  prevPhaseForSlide.current = dockPhase;

  useLayoutEffect(() => {
    if (inputOnlyActive) return;
    if (dockPhase === "collapsing") {
      // 发起收回：播滑出动画；时长为 0（关闭动画）时 0ms 过渡不会触发
      // transitionend，直接跳过动画立即收回
      setAnimSide(dockSide);
      if (dockAnimMsRef.current === 0) {
        setSlideOut(false);
        setSlideIn(false);
        void tauriCommands.dock.collapse(appWindow.label).catch(() => {});
      } else {
        setSlideOut(true);
        setSlideIn(false);
      }
    } else if (dockPhase === "expanded" || dockPhase === "normal") {
      // 取消收回（反向滑回）或正常展开
      setSlideOut(false);
      if (dockPhase === "expanded") {
        setAnimSide(dockSide);
        setSlideIn(true);
        // 双 rAF 等「主内容 hidden 态」真正绘制上屏后再扩窗：layout effect 只保证
        // DOM 已变更、不保证已绘制，若扩窗 IPC 抢在首帧绘制前执行，窗口放大后
        // 左上角会短暂挂着上一帧的收缩条（闪现）。单 rAF 仍可能在本帧绘制前触发，
        // 双 rAF 保证至少错过一次 paint。之后还须等扩窗 IPC 返回再解除 hidden，
        // 保证滑入动画在已放大的窗口里完整播放（见下）。
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            void tauriCommands.dock
              .applyExpand(appWindow.label)
              .catch(() => {})
              .finally(() => {
                unhideRafRef.current = requestAnimationFrame(() => setSlideIn(false));
              });
          });
        });
        return () => {
          cancelAnimationFrame(raf1);
          if (raf2) cancelAnimationFrame(raf2);
          if (unhideRafRef.current !== null) {
            cancelAnimationFrame(unhideRafRef.current);
            unhideRafRef.current = null;
          }
        };
      }
    }
    // collapsed：渲染收缩条，无动画状态需要维护
  }, [dockPhase, dockSide, inputOnlyActive]);

  // 收回动画结束（slide-out 过渡播完）后，通知后端真正缩成细条。
  // 只响应根节点自身的 transform 过渡，避免后代按钮 hover transition 冒泡误触发提前收回。
  const handleSlideOutEnd = useCallback((e: React.TransitionEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (dockPhaseRef.current === "collapsing") {
      void tauriCommands.dock.collapse(appWindow.label).catch(() => {});
    }
  }, []);

  const windowState: DanmakuWindowState = {
    locked,
    passthrough,
    stealthEnabled: stealth.enabled,
    stealthVisible: stealth.visible,
    inputOnlyActive,
  };

  // 收起态：整窗换成收缩条（直播与视频两种内容形态同一呈现）
  if (!inputOnlyActive && dockPhase === "collapsed") {
    return <DockCollapsedBar side={dockSide} onExpand={dockExpand} />;
  }

  // 滑出/滑入的屏幕外位移：左 = 左移出，右 = 右移出，顶 = 上移出（收缩条贴上缘，向下展开）
  const hiddenTranslate =
    animSide === "left"
      ? "-translate-x-full"
      : animSide === "right"
        ? "translate-x-full"
        : "-translate-y-full";
  // justExpanded 时使用 dockSide（当前值），而非 animSide（可能还是旧值）
  const initialHiddenTranslate =
    dockSide === "left"
      ? "-translate-x-full"
      : dockSide === "right"
        ? "translate-x-full"
        : "-translate-y-full";
  const slideClass = inputOnlyActive
    ? ""
    : slideOut
      ? `${hiddenTranslate} ease-in`
      : (slideIn || justExpanded)
        ? `${initialHiddenTranslate} transition-none`
        : "translate-x-0 translate-y-0 ease-out";

  const controls: DanmakuWindowControls = {
    pinned,
    locked,
    passthrough,
    stealth: stealth.enabled,
    inputOnlyBusy: inputOnly?.busy,
    onTogglePin: () => { void togglePin(); },
    onToggleLock: () => setLocked((value) => !value),
    onToggleInputOnly: () => inputOnly?.onToggle(),
    onTogglePassthrough: () => setPassthrough((value) => !value),
    onToggleStealth: () => stealth.toggle(),
    onHide: () => { void appWindow.close(); },
    onExit,
    onDrag: startDragging,
    exitLabel,
  };

  const body = inputOnlyActive ? (
    // 紧凑栏外壳：只保留一行输入区（标题栏/音频区隐藏），内容由消费方提供
    <div
      data-interactive=""
      className="danmaku-bg-bar window-rounded flex h-full w-full items-center gap-1 px-2 select-none"
      style={inputOnly?.barStyle}
    >
      {inputOnly?.renderBar({ locked })}
    </div>
  ) : (
    <main
      {...props}
      onContextMenu={(event) => {
        // 无边框透明小窗：屏蔽浏览器右键菜单（开发模式保留便于调试）
        if (!import.meta.env.DEV) event.preventDefault();
        props.onContextMenu?.(event);
      }}
      className={`danmaku-window window-rounded transition-transform ${className} ${slideClass}`}
      style={{ ...style, transitionDuration: `${dockAnimMs}ms` }}
      onTransitionEnd={slideOut ? handleSlideOutEnd : undefined}
    >
      <DanmakuTitleBar
        title={title}
        controls={controls}
        switcher={switcher}
        showInputOnly={!!inputOnly}
      />
      <DanmakuAudioControls audio={audio} />
      {typeof children === "function" ? children(windowState) : children}
      {footer}
    </main>
  );

  return (
    <div
      className="h-full w-full transition-opacity"
      style={{
        opacity: stealth.visible ? 1 : 0,
        transitionDuration: `${stealthFadeMs}ms`,
        pointerEvents: stealth.visible ? undefined : "none",
      }}
    >
      {body}
    </div>
  );
}
