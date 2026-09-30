import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { tauriCommands } from "@/lib/tauri";
import { SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";

interface CacheStats {
  imageSize: number; imageCount: number; emoticonPkgCount: number; emoticonCount: number; emoticonImageSize: number;
}
type ClearTarget = "image" | "emoticon" | "all";
const CLEAR_DETAILS = {
  image: { title: "清除封面与头像缓存", message: "封面和头像将在下次显示时重新下载。" },
  emoticon: { title: "清除表情缓存", message: "这将清除所有已缓存的表情包和图片，下次使用时重新获取。" },
  all: { title: "清除所有图片缓存", message: "这将清除封面、头像和表情数据，不影响账号、设置和语音模型。" },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StorageSettings({ settings, patchSettings }: SettingsPanelProps) {
  return (
    <>
      <SettingsGroup title="消息保留" description="弹幕、礼物、活动三栏分别按此数量保留，超出后批量移除最早的消息。">
        <SettingsRow title="每栏保留条数" description="填 0 使用 3000 条安全上限；此项控制内存中的消息，不是磁盘缓存。">
          <input type="number" aria-label="每栏保留条数" min={0} step={50} value={settings.cache.messageLimit}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value)) patchSettings({ cache: { messageLimit: Math.max(0, Math.floor(value)) } });
            }} className="h-8 w-full px-3 text-[13px]" />
        </SettingsRow>
      </SettingsGroup>
      <ImageCacheSettings />
    </>
  );
}

function ImageCacheSettings() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [target, setTarget] = useState<ClearTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tauriCommands.proxy.getCacheStats()
      .then((value) => { if (!cancelled) setStats(value); })
      .catch((reason) => { if (!cancelled) setError(`读取缓存失败：${String(reason)}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = () => { setError(null); setRefreshKey((key) => key + 1); };
  const clear = async (next: ClearTarget) => {
    setTarget(null);
    setClearing(true);
    setMessage(null);
    setError(null);
    const operations = [];
    if (next !== "emoticon") operations.push(tauriCommands.proxy.clearImageCache());
    if (next !== "image") operations.push(tauriCommands.room.clearEmoticonCache());
    const results = await Promise.allSettled(operations);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) setError(failures.length === results.length ? "缓存清理失败，请重试。" : "部分缓存清理失败，请重试。");
    else setMessage("缓存已清理");
    setClearing(false);
    setRefreshKey((key) => key + 1);
  };
  return (
    <SettingsGroup title="图片缓存" description="清理只影响下载缓存，之后使用时会重新获取。">
      <div className="settings-row">
        <span className="text-xs text-ink-muted" role="status">{loading ? "正在读取缓存…" : clearing ? "正在清理…" : message || "磁盘占用"}</span>
        <button type="button" className="settings-action" disabled={loading || clearing} onClick={refresh}>刷新</button>
      </div>
      <SettingsRow title="封面与头像" description={stats ? `${stats.imageCount} 张 · ${formatSize(stats.imageSize)}` : "尚未读取"}>
        <button type="button" className="settings-action" disabled={clearing || !stats} onClick={() => setTarget("image")}>清除</button>
      </SettingsRow>
      <SettingsRow title="表情包与表情图片" description={stats ? `${stats.emoticonPkgCount} 个包 · ${stats.emoticonCount} 个表情 · ${formatSize(stats.emoticonImageSize)}` : "尚未读取"}>
        <button type="button" className="settings-action" disabled={clearing || !stats} onClick={() => setTarget("emoticon")}>清除</button>
      </SettingsRow>
      <SettingsRow title="清除所有图片缓存">
        <button type="button" className="settings-action text-rose-600 dark:text-rose-300" disabled={clearing || !stats} onClick={() => setTarget("all")}>清除所有</button>
      </SettingsRow>
      {error && <p className="settings-row-block text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      <ConfirmDialog open={target !== null} title={target ? CLEAR_DETAILS[target].title : "清除缓存"}
        message={target ? CLEAR_DETAILS[target].message : ""} variant="danger"
        onConfirm={() => { if (target) void clear(target); }} onCancel={() => setTarget(null)} />
    </SettingsGroup>
  );
}
