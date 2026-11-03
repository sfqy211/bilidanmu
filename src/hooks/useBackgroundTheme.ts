import { useEffect } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * 采样间隔。
 * 单次采样实测约 7ms（GDI 上下文创建占大头，与区域大小几乎无关），
 * 因此可以高频率跑：120ms 一次约占用 6% 单核，换来接近即时的响应。
 */
const SAMPLE_INTERVAL_MS = 120;
/**
 * 滞回阈值：背景平均亮度 < LOW 判为偏暗（用深色主题），
 * > HIGH 判为偏亮（用浅色主题），中间区间保持当前不变。
 * 没有滞回时，亮度在 0.5 附近抖动会让主题反复横跳。
 */
const LUMINANCE_LOW = 0.42;
const LUMINANCE_HIGH = 0.58;

/**
 * 弹幕窗跟随屏幕背景亮暗自动切换深浅主题。
 *
 * 只应在弹幕窗口调用（主窗口不需要，也避免两个 webview 各自截屏）。
 * 采样在 Rust 侧完成（GDI 截屏 + 稀疏采样，实测 420×600 区域约 11ms），
 * 这里负责节奏控制、滞回平滑，并把结果写进 backgroundThemeOverride 供 useTheme 应用。
 *
 * 关闭该设置时清空覆盖，恢复用户自己选择的主题。
 */
export function useBackgroundTheme() {
  const enabled = useSettingsStore(
    (s) => s.settings.appearance.autoThemeFromBackground ?? false
  );
  const setOverride = useSettingsStore((s) => s.setBackgroundThemeOverride);

  useEffect(() => {
    if (!enabled) {
      setOverride(null);
      return;
    }

    let disposed = false;
    let running = false;

    const tick = async () => {
      // 上一轮未返回就跳过，避免慢截屏堆积
      if (disposed || running) return;
      running = true;
      try {
        const luminance = await tauriCommands.room.sampleBackgroundLuminance();
        if (disposed || luminance == null) return;
        const current = useSettingsStore.getState().backgroundThemeOverride;
        if (luminance < LUMINANCE_LOW) {
          if (current !== "dark") setOverride("dark");
        } else if (luminance > LUMINANCE_HIGH) {
          if (current !== "light") setOverride("light");
        }
        // 中间区间：保持现状，不切换
      } catch {
        // 采样失败（窗口隐藏、截屏受限等）保持现状，不打断播放
      } finally {
        running = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), SAMPLE_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      // 退出弹幕窗/关闭开关时清掉覆盖，恢复用户设置的主题
      setOverride(null);
    };
  }, [enabled, setOverride]);
}
