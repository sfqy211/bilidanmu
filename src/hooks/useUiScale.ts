import { useEffect, useMemo, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";

const STORAGE_KEY = "ui-scale";
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const STEP = 0.1;

interface KeyBinding {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

/** "Ctrl+=" 之类的组合键文本 → 结构化绑定；无主键返回 null */
function parseBinding(binding: string | null): KeyBinding | null {
  if (!binding) return null;
  const parsed: KeyBinding = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  for (const part of binding.split("+").map((p) => p.trim()).filter(Boolean)) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") parsed.ctrl = true;
    else if (lower === "alt") parsed.alt = true;
    else if (lower === "shift") parsed.shift = true;
    else if (lower === "cmd" || lower === "meta" || lower === "super" || lower === "win") parsed.meta = true;
    else parsed.key = part.toUpperCase();
  }
  return parsed.key ? parsed : null;
}

/** "=" 与 "+"、"-" 与 "_" 互为上档变体，绑定其一即两者都接受（保留旧硬编码的宽容度） */
const SHIFT_VARIANTS: Record<string, string> = { "=": "+", "+": "=", "-": "_", "_": "-" };

function matches(binding: KeyBinding, e: KeyboardEvent): boolean {
  if (e.ctrlKey !== binding.ctrl || e.altKey !== binding.alt || e.metaKey !== binding.meta) return false;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key === binding.key && e.shiftKey === binding.shift) return true;
  const variant = SHIFT_VARIANTS[binding.key];
  return variant !== undefined && key === variant;
}

function loadScale(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = Number(stored);
      if (val >= MIN_SCALE && val <= MAX_SCALE) return val;
    }
  } catch { /* ignore */ }
  return 1.0;
}

function saveScale(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch { /* ignore */ }
}

/**
 * 全局 UI 缩放 hook，绑定来自设置（settings.shortcuts.uiZoom*，默认 Ctrl+− / = / 0）。
 * 使用 CSS zoom 属性，对 WebView2 有效。
 */
export function useUiScale() {
  const [scale, setScale] = useState(loadScale);
  const shortcuts = useSettingsStore((s) => s.settings.shortcuts);
  const zoomIn = useMemo(() => parseBinding(shortcuts?.uiZoomIn ?? "Ctrl+="), [shortcuts?.uiZoomIn]);
  const zoomOut = useMemo(() => parseBinding(shortcuts?.uiZoomOut ?? "Ctrl+-"), [shortcuts?.uiZoomOut]);
  const zoomReset = useMemo(() => parseBinding(shortcuts?.uiZoomReset ?? "Ctrl+0"), [shortcuts?.uiZoomReset]);

  useEffect(() => {
    if (scale === 1) {
      document.documentElement.style.removeProperty("zoom");
    } else {
      document.documentElement.style.zoom = String(scale);
    }
  }, [scale]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (zoomIn && matches(zoomIn, e)) {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.min(MAX_SCALE, prev + STEP);
          saveScale(next);
          return next;
        });
      } else if (zoomOut && matches(zoomOut, e)) {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.max(MIN_SCALE, prev - STEP);
          saveScale(next);
          return next;
        });
      } else if (zoomReset && matches(zoomReset, e)) {
        e.preventDefault();
        setScale(1.0);
        saveScale(1.0);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomIn, zoomOut, zoomReset]);
}
