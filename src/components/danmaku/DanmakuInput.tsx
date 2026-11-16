import {
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
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 120)}px`;
  }, [value]);

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
