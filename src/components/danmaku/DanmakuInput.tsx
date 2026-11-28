import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands, type FullscreenInputRect } from "@/lib/tauri";

const editorStyleProperties = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
  "color", "caretColor", "backgroundColor", "border", "borderRadius", "boxShadow",
  "padding", "textAlign", "direction", "whiteSpace", "overflowWrap",
] as const;

function physicalClientRect(element: HTMLElement): FullscreenInputRect {
  const rect = element.getBoundingClientRect();
  const scale = window.devicePixelRatio;
  const x = Math.round(rect.left * scale);
  const y = Math.round(rect.top * scale);
  return {
    x, y,
    width: Math.round(rect.right * scale) - x,
    height: Math.round(rect.bottom * scale) - y,
  };
}

/** 两种弹幕窗口共用输入法保护和长度限制，发送目标由调用方决定。 */
export function DanmakuInput({
  value,
  onChange,
  onSend,
  maxLength,
  multiline = false,
  fullscreenSessionKey,
  fullscreenSubmit,
  onFullscreenInputActiveChange,
  onCancel,
  editorRef,
  autoResize = true,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
  fullscreenSessionKey?: string;
  fullscreenSubmit?: { button: RefObject<HTMLButtonElement | null>; label: string };
  onFullscreenInputActiveChange?: (active: boolean) => void;
  onCancel?: () => void;
  editorRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  autoResize?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label": string;
}) {
  const composing = useRef(false);
  const compositionEndedAt = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fullscreenAvailable = fullscreenSessionKey !== undefined && isTauri() && /Windows NT/.test(navigator.userAgent);
  const pendingFullscreenInput = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onChange, onSend, onFullscreenInputActiveChange });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSend, onFullscreenInputActiveChange };
  }, [onChange, onSend, onFullscreenInputActiveChange]);

  // 切换账号、直播间或视频时作废旧会话；外部更新草稿时同样以当前输入栏为准。
  useLayoutEffect(() => {
    return () => {
      const restore = pendingFullscreenInput.current;
      if (!restore) return;
      pendingFullscreenInput.current = null;
      restore();
      void tauriCommands.fullscreenInput.cancel().catch(() => {});
    };
  }, [fullscreenSessionKey, props.disabled, value]);

  const startFullscreenInput = async (event: MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // WebView2 的 DOM 在后台小窗收到鼠标事件时也可能报告有焦点；由原生层判断前台窗口。
    if (!fullscreenAvailable || props.disabled || event.button !== 0) return;
    if (pendingFullscreenInput.current) {
      event.preventDefault();
      return;
    }
    const element = event.currentTarget;
    const rect = physicalClientRect(element);
    const submitButton = fullscreenSubmit?.button.current;
    const submit = submitButton && fullscreenSubmit
      ? { rect: physicalClientRect(submitButton), label: fullscreenSubmit.label }
      : undefined;
    const computed = getComputedStyle(element);
    const style: Record<string, string> = {};
    for (const property of editorStyleProperties) style[property] = computed[property];
    style.zoom = getComputedStyle(document.documentElement).zoom;
    style.placeholderColor = getComputedStyle(element, "::placeholder").color;
    const initialOpacity = element.style.opacity;
    const restore = () => {
      element.style.opacity = initialOpacity;
      callbacks.current.onFullscreenInputActiveChange?.(false);
    };
    pendingFullscreenInput.current = restore;
    element.style.opacity = "0";
    callbacks.current.onFullscreenInputActiveChange?.(true);

    const result = await tauriCommands.fullscreenInput.begin({
      rect,
      submit,
      text: element.value,
      maxLength,
      multiline,
      label: props["aria-label"],
      placeholder: props.placeholder,
      style,
    }).catch(() => null);
    if (pendingFullscreenInput.current !== restore || !element.isConnected) return;
    pendingFullscreenInput.current = null;
    restore();
    if (result === null) {
      await getCurrentWindow().setFocus().catch(() => {});
      if (element.isConnected && !element.disabled && document.activeElement !== element) element.focus();
      return;
    }
    const text = result.text.slice(0, maxLength);
    callbacks.current.onChange(text);
    if (result.send) callbacks.current.onSend(text);
  };

  const bindEditor = useCallback((element: HTMLInputElement | HTMLTextAreaElement | null) => {
    textarea.current = element instanceof HTMLTextAreaElement ? element : null;
    if (typeof editorRef === "function") editorRef(element);
    else if (editorRef) editorRef.current = element;
  }, [editorRef]);

  // 多行自适应高度：空内容完全交给 CSS（单行高度 + min-height），有内容才按
  // scrollHeight 撑高。不能无条件写死 px 高度——窗口是"隐藏创建 → show"的，
  // 隐藏态或字体未就绪的首帧 scrollHeight 在部分环境（不同 WebView2/DPI）会失真，
  // 把输入框撑高；原先只在 value 变化时测量，首屏失真后要输入一个字才会重算。
  const resizeTextarea = useCallback(() => {
    const el = textarea.current;
    if (!el || !autoResize) return;
    if (!el.value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [autoResize]);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  // 窗口从隐藏变为可见、字体加载完成、窗口宽度变化时重测一次，
  // 兜住首帧测量失真的场景（单行 input 没有自适应高度，不需要）
  useEffect(() => {
    if (!multiline || !autoResize) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") resizeTextarea();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resizeTextarea);
    void document.fonts?.ready.then(resizeTextarea);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resizeTextarea);
    };
  }, [autoResize, multiline, resizeTextarea]);

  const onKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Enter" || (multiline && event.shiftKey)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (Date.now() - compositionEndedAt.current < 80) return;
    onSend(event.currentTarget.value);
  };
  const inputProps = {
    ...props,
    value,
    "data-fullscreen-input": fullscreenAvailable ? "" : undefined,
    onMouseDown: (event: MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => { void startFullscreenInput(event); },
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChange(
        composing.current
          ? event.target.value
          : event.target.value.slice(0, maxLength),
      );
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (
      event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      composing.current = false;
      compositionEndedAt.current = Date.now();
      onChange(event.currentTarget.value.slice(0, maxLength));
    },
    onKeyDown,
  };
  return multiline ? (
    <textarea {...inputProps} ref={bindEditor} rows={1} />
  ) : (
    <input {...inputProps} ref={bindEditor} type="text" />
  );
}
