import { useCallback, useEffect, useRef, useState } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands } from "@/lib/tauri";
import { useTauriEvent } from "@/hooks/useTauriEvent";

const appWindow = getCurrentWindow();

/**
 * 置顶/锁定：弹幕小窗的通用窗口级状态（直播与视频窗共用）。
 * 置顶切换系统 always-on-top；锁定只门控窗口拖动（标题栏拖拽由组件内部处理，
 * 内容区拖动由消费方通过 children 的 render prop 状态自行门控）。
 */
export function useWindowPinnedLocked() {
  const [pinned, setPinned] = useState(true);
  const pinChanging = useRef(false);
  const [locked, setLocked] = useState(false);

  const togglePin = useCallback(async () => {
    if (pinChanging.current) return;
    pinChanging.current = true;
    const next = !pinned;
    try {
      await appWindow.setAlwaysOnTop(next);
      setPinned(next);
    } catch {
      // 系统拒绝时保持原状态
    } finally {
      pinChanging.current = false;
    }
  }, [pinned]);

  const startDragging = useCallback(() => {
    if (locked) return;
    void appWindow.startDragging().catch(() => {});
  }, [locked]);

  return { pinned, locked, setLocked, togglePin, startDragging };
}

/**
 * 隐身模式：后端按光标位置自动显隐并切点击穿透，前端只负责渲染淡入淡出。
 * 直播弹幕窗与视频弹幕窗共用；后端按调用方窗口分别判定，事件带 label 区分，
 * 这里按本窗口 label 过滤，两个窗口互不串扰。
 */
export function useStealthMode() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    void tauriCommands.stealth.get().then((snapshot) => {
      setEnabled(snapshot.enabled);
      setVisible(snapshot.visible);
    }).catch(() => {});
  }, []);
  useTauriEvent<{ label: string; visible: boolean; enabled: boolean }>("danmaku-stealth", (payload) => {
    if (payload.label !== appWindow.label) return;
    setEnabled(payload.enabled);
    setVisible(payload.visible);
  });
  // 隐身后窗口不可点击，焦点若还留在输入框里会继续吞键盘输入，先主动释放
  useEffect(() => {
    if (visible) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }, [visible]);
  const toggle = useCallback(() => {
    // 用命令返回值矫正本地状态，事件丢失时也不会错位
    void tauriCommands.stealth
      .set(!enabled)
      .then(setEnabled)
      .catch(() => {});
  }, [enabled]);
  return { enabled, visible, toggle };
}

/**
 * 窗口透传：单窗口动态命中测试。与隐身模式共用同一个点击穿透标志：
 * 隐身隐态由 Rust 整窗穿透、本轮询暂停；显形后透传按 DOM 命中测试接管，
 * 因此两者可同时开启。
 */
export function usePassthroughHitTest(
  passthroughEnabled: boolean,
  stealthEnabled: boolean,
  stealthVisible: boolean,
) {
  const ignoredRef = useRef(false);
  useEffect(() => {
    let checking = false;

    const setIgnored = (ignored: boolean) => {
      if (ignoredRef.current === ignored) return;
      const previous = ignoredRef.current;
      ignoredRef.current = ignored;
      void appWindow.setIgnoreCursorEvents(ignored).catch(() => {
        if (ignoredRef.current === ignored) {
          ignoredRef.current = previous;
        }
      });
    };

    // 穿透标志的唯一裁决者。优先级：隐身隐态（整窗穿透）> 透传开关 > 正常交互。
    // 顺序不能颠倒：隐态必须先于「透传关闭」判断，否则只开隐身不开透传时
    // 会被下面的 setIgnored(false) 覆盖掉，隐身状态下手照样能点到窗口。
    if (stealthEnabled && !stealthVisible) {
      setIgnored(true);
      return;
    }
    if (!passthroughEnabled) {
      setIgnored(false);
      return;
    }

    const shouldPassThrough = (x: number, y: number) => {
      // elementFromPoint is a DOM hit-test and should remain valid while the OS
      // ignores cursor events for this window; the polling loop depends on that.
      const element = document.elementFromPoint(x, y);
      if (!element) return true;
      return !element.closest("[data-interactive]");
    };

    const checkCursorPosition = () => {
      if (checking) return;
      checking = true;
      void (async () => {
        // 弹幕窗口创建时 decorations=false，因此 inner 坐标就是 WebView client area。
        const [cursor, windowPosition, windowSize, scaleFactor] = await Promise.all([
          cursorPosition(),
          appWindow.innerPosition(),
          appWindow.innerSize(),
          appWindow.scaleFactor(),
        ]);

        const insideWindow =
          cursor.x >= windowPosition.x &&
          cursor.y >= windowPosition.y &&
          cursor.x < windowPosition.x + windowSize.width &&
          cursor.y < windowPosition.y + windowSize.height;

        if (!insideWindow) {
          setIgnored(false);
          return;
        }

        const clientX = (cursor.x - windowPosition.x) / scaleFactor;
        const clientY = (cursor.y - windowPosition.y) / scaleFactor;
        setIgnored(shouldPassThrough(clientX, clientY));
      })().finally(() => {
        checking = false;
      });
    };

    const poll = window.setInterval(checkCursorPosition, 50);
    checkCursorPosition();

    // 不在这里恢复交互：隐身隐态转交时 Rust 已接管穿透标志，
    // 其余停止路径（关透传/关隐身）由下一次 effect 运行的分支负责对齐
    return () => {
      window.clearInterval(poll);
    };
  }, [passthroughEnabled, stealthEnabled, stealthVisible]);
}
