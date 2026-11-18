import { useEffect, useRef, type RefObject } from "react";

interface UsePanelDismissOptions {
  open: boolean;
  onClose: () => void;
  /** 点击这些区域不关闭（例如直播输入栏、视频 footer）。 */
  ignoreRef?: RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>;
  /** 命中该选择器的元素不关闭（用于标题栏等面板外触发器）。 */
  triggerSelector?: string;
}

/**
 * 弹幕窗面板统一关闭逻辑：点击外部或按 Escape 关闭。
 * 面板自身通过 onPointerDown 阻止冒泡，所以点面板内部不会触发。
 */
export function usePanelDismiss({
  open,
  onClose,
  ignoreRef,
  triggerSelector,
}: UsePanelDismissOptions) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const ignoreRefs = ignoreRef
      ? Array.isArray(ignoreRef)
        ? ignoreRef
        : [ignoreRef]
      : [];

    const isIgnored = (target: Node) => {
      if (ignoreRefs.some((ref) => ref.current?.contains(target))) return true;
      if (triggerSelector && target instanceof Element && target.closest(triggerSelector)) return true;
      return false;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || isIgnored(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ignoreRef, triggerSelector]);
}
