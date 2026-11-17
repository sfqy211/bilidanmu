import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

/** 两种弹幕窗口共用输入法保护和长度限制，发送目标由调用方决定。 */
export function DanmakuInput({
  value,
  onChange,
  onSend,
  maxLength,
  multiline = false,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  maxLength: number;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label": string;
}) {
  const composing = useRef(false);
  const compositionEndedAt = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // 多行自适应高度：空内容完全交给 CSS（单行高度 + min-height），有内容才按
  // scrollHeight 撑高。不能无条件写死 px 高度——窗口是"隐藏创建 → show"的，
  // 隐藏态或字体未就绪的首帧 scrollHeight 在部分环境（不同 WebView2/DPI）会失真，
  // 把输入框撑高；原先只在 value 变化时测量，首屏失真后要输入一个字才会重算。
  const resizeTextarea = useCallback(() => {
    const el = textarea.current;
    if (!el) return;
    if (!el.value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  // 窗口从隐藏变为可见、字体加载完成、窗口宽度变化时重测一次，
  // 兜住首帧测量失真的场景（单行 input 没有自适应高度，不需要）
  useEffect(() => {
    if (!multiline) return;
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
  }, [multiline, resizeTextarea]);

  const onKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || (multiline && event.shiftKey)) return;
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    event.preventDefault();
    if (event.repeat) return;
    if (Date.now() - compositionEndedAt.current < 80) return;
    onSend();
  };
  const inputProps = {
    ...props,
    value,
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
    <textarea {...inputProps} ref={textarea} rows={1} />
  ) : (
    <input {...inputProps} type="text" />
  );
}
