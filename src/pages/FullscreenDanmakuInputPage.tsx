import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DanmakuInput } from "@/components/danmaku/DanmakuInput";
import { tauriCommands, type FullscreenInputRect, type FullscreenInputSession } from "@/lib/tauri";

declare global {
  interface Window {
    __BILIDANMU_FULLSCREEN_INPUT__?: FullscreenInputSession;
  }
}

function positionStyle(rect: FullscreenInputRect, scale: number): CSSProperties {
  return {
    position: "absolute",
    left: rect.x / scale,
    top: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

export function FullscreenDanmakuInputPage({ session }: { session: FullscreenInputSession }) {
  const { id, input, position, submitPosition } = session;
  const [text, setText] = useState(input.text);
  const [scale, setScale] = useState(() => window.devicePixelRatio);
  const draft = useRef(input.text);
  const editor = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const finished = useRef(false);

  const finish = useCallback((value: string, send: boolean) => {
    if (finished.current) return;
    finished.current = true;
    void tauriCommands.fullscreenInput.finish(id, { text: value.slice(0, input.maxLength), send })
      .catch(() => { finished.current = false; });
  }, [id, input.maxLength]);

  useLayoutEffect(() => {
    const element = editor.current;
    if (!element) return;
    let hadFocus = document.hasFocus();
    // 隐藏窗口创建和移到目标屏幕时可能跨越不同的 DPI。
    const syncScale = () => setScale(window.devicePixelRatio);
    const onFocus = () => {
      hadFocus = true;
      syncScale();
      element.focus({ preventScroll: true });
    };
    const onBlur = () => {
      if (hadFocus) finish(draft.current, false);
    };
    const onCompositionStart = () => { composing.current = true; };
    const onCompositionEnd = () => { composing.current = false; };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", syncScale);
    element.addEventListener("compositionstart", onCompositionStart);
    element.addEventListener("compositionend", onCompositionEnd);
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
    void tauriCommands.fullscreenInput.ready(id).catch(() => {});
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", syncScale);
      element.removeEventListener("compositionstart", onCompositionStart);
      element.removeEventListener("compositionend", onCompositionEnd);
    };
  }, [finish, id]);

  const { zoom, placeholderColor, ...computed } = input.style;
  const sourceZoom = Number(zoom) || 1;
  const send = (value: string) => {
    if (!composing.current && value.trim()) finish(value, true);
  };
  return (
    <>
      <style>{".fullscreen-danmaku-editor::placeholder { color: var(--fullscreen-input-placeholder); }"}</style>
      <div style={positionStyle(position, scale)}>
        <DanmakuInput
          editorRef={editor}
          autoResize={false}
          className="fullscreen-danmaku-editor"
          style={{ ...computed, zoom: sourceZoom, "--fullscreen-input-placeholder": placeholderColor,
            width: position.width / (scale * sourceZoom), height: position.height / (scale * sourceZoom),
            display: "block", boxSizing: "border-box", margin: 0,
            outline: "none", resize: "none" } as CSSProperties}
          aria-label={input.label}
          placeholder={input.placeholder}
          maxLength={input.maxLength}
          multiline={input.multiline}
          value={text}
          onChange={(value) => {
            draft.current = value;
            setText(value);
          }}
          onSend={send}
          onCancel={() => finish(draft.current, false)}
        />
      </div>
      {submitPosition && input.submit && (
        <button
          type="button"
          aria-label={input.submit.label}
          tabIndex={-1}
          style={{ ...positionStyle(submitPosition, scale), opacity: 0, cursor: "pointer" }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => send(editor.current?.value ?? draft.current)}
        />
      )}
    </>
  );
}
