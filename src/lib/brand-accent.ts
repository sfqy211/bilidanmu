import { tauriCommands } from "./tauri";

/** 上一次同步给 Rust 的强调色，避免无关的设置保存反复重绘图标 */
let lastSynced = "";

/**
 * 把当前 `--brand-rgb`（主题强调色，随亮/暗模式解析后的值）同步给 Rust，
 * 用于给托盘与窗口/任务栏图标着色。重复值会被跳过。
 */
export function syncBrandAccent() {
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--brand-rgb")
    .trim();
  if (!accent || accent === lastSynced) return;
  lastSynced = accent;
  // 图标更新失败不影响主题；Rust 侧只记日志
  void tauriCommands.brand.setAccent(accent).catch(() => {});
}
