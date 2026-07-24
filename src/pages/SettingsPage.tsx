import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen, GitBranch } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { UpdateDialog } from "@/components/ui/UpdateDialog";
import { PageTabs, TabContent } from "@/components/ui/PageTabs";
import { HIDE_APPEARANCE_OPTIONS } from "@/components/settings/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAppVersion } from "@/lib/constants";
import { tauriCommands } from "@/lib/tauri";
import aboutIcon from "@/assets/icon.png";
import { useSettingsStore } from "@/stores/settings-store";
import type { Settings } from "@/types/bilibili";

const SETTINGS_TABS = [
  { value: "send", label: "弹幕发送" },
  { value: "receive", label: "弹幕接收" },
  { value: "appearance", label: "外观" },
  { value: "audio", label: "音频与语音" },
  { value: "cache", label: "缓存管理" },
  { value: "about", label: "关于" },
];

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const patchSettings = useSettingsStore((state) => state.patchSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [activeTab, setActiveTab] = useState("send");

  const showError = (msg: string) => { setError(msg); setSuccess(null); setMsgKey((k) => k + 1); };
  const showSuccess = (msg: string) => { setSuccess(msg); setError(null); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); setSuccess(null); };
  const [modelDir, setModelDir] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const sttAvailable = useSettingsStore((state) => state.sttAvailable);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const loaded = await tauriCommands.settings.get();
        if (!cancelled) {
          setSettings(loaded);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          showError(loadError instanceof Error ? loadError.message : "加载设置失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [setSettings]);

  useEffect(() => {
    if (!sttAvailable) return;
    tauriCommands.stt.getModelDir().then(setModelDir).catch(() => {});
    tauriCommands.stt.listModels().then(setAvailableModels).catch(() => {});
  }, [sttAvailable]);

  const handleSave = async () => {
    setSaving(true);
    clearMessage();

    try {
      await tauriCommands.settings.update(settings);
      patchSettings(settings);
      showSuccess("设置已保存");
    } catch (saveError) {
      showError(saveError instanceof Error ? saveError.message : "保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full flex-col select-none">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">设置</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">发送、接收与外观的核心设置。</p>
        </div>
        <div className="flex items-center gap-3">
          {error && <InlineMessage key={msgKey} type="error">{error}</InlineMessage>}
          {success && <InlineMessage key={msgKey} type="success">{success}</InlineMessage>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving}
            className="rounded bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>

      <PageTabs
        tabs={SETTINGS_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <TabContent value="send" className="flex flex-col gap-4">
          <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-600 dark:text-slate-300">
                  最小间隔（秒）
                  <input
                    type="number"
                    step="0.1"
                    value={settings.sendInterval.min}
                    onChange={(event) =>
                      patchSettings({
                        sendInterval: { min: Number(event.target.value), max: settings.sendInterval.max }
                      })
                    }
                    className="mt-2 h-11 w-full px-4 text-sm"
                  />
                </label>

                <label className="text-sm text-slate-600 dark:text-slate-300">
                  最大间隔（秒）
                  <input
                    type="number"
                    step="0.1"
                    value={settings.sendInterval.max}
                    onChange={(event) =>
                      patchSettings({
                        sendInterval: { min: settings.sendInterval.min, max: Number(event.target.value) }
                      })
                    }
                    className="mt-2 h-11 w-full px-4 text-sm"
                  />
                </label>
              </div>

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>启用随机间隔</span>
                <Checkbox
                  checked={settings.riskControl.randomInterval}
                  onCheckedChange={(c) =>
                    patchSettings({ riskControl: { ...settings.riskControl, randomInterval: !!c } })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>启用间隔抖动</span>
                <Checkbox
                  checked={settings.riskControl.jitter}
                  onCheckedChange={(c) =>
                    patchSettings({ riskControl: { ...settings.riskControl, jitter: !!c } })
                  }
                />
              </label>
            </div>
          </div>
        </TabContent>

        <TabContent value="receive" className="flex flex-col gap-4">
          <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>自动连接弹幕流</span>
                <Checkbox
                  checked={settings.receive.autoConnect}
                  onCheckedChange={(c) =>
                    patchSettings({ receive: { ...settings.receive, autoConnect: !!c } })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>断线自动重连</span>
                <Checkbox
                  checked={settings.receive.autoReconnect}
                  onCheckedChange={(c) =>
                    patchSettings({ receive: { ...settings.receive, autoReconnect: !!c } })
                  }
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-600 dark:text-slate-300">
                  重连间隔（秒）
                  <input
                    type="number"
                    value={settings.receive.reconnectInterval}
                    onChange={(event) =>
                      patchSettings({
                        receive: {
                          ...settings.receive,
                          reconnectInterval: Number(event.target.value)
                        }
                      })
                    }
                    className="mt-2 h-11 w-full px-4 text-sm"
                  />
                </label>

                <label className="text-sm text-slate-600 dark:text-slate-300">
                  最大重连间隔（秒）
                  <input
                    type="number"
                    value={settings.receive.maxReconnectInterval}
                    onChange={(event) =>
                      patchSettings({
                        receive: {
                          ...settings.receive,
                          maxReconnectInterval: Number(event.target.value)
                        }
                      })
                    }
                    className="mt-2 h-11 w-full px-4 text-sm"
                  />
                </label>
              </div>

              <div className="my-2" />

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>禁言提醒</span>
                <Checkbox
                  checked={settings.notification.muteAlert}
                  onCheckedChange={(c) =>
                    patchSettings({ notification: { ...settings.notification, muteAlert: !!c } })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>Cookie 过期提醒</span>
                <Checkbox
                  checked={settings.notification.cookieExpiry}
                  onCheckedChange={(c) =>
                    patchSettings({ notification: { ...settings.notification, cookieExpiry: !!c } })
                  }
                />
              </label>
            </div>
          </div>
        </TabContent>

        <TabContent value="appearance" className="flex flex-col gap-4">
          <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <div className="space-y-4">
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                主题
                <Select
                  value={settings.appearance.theme}
                  onValueChange={(v) =>
                    patchSettings({
                      appearance: { ...settings.appearance, theme: v as "light" | "dark" | "system" }
                    })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                    <SelectItem value="system">跟随系统</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="block text-sm text-slate-600 dark:text-slate-300">
                弹幕字号
                <input
                  type="number"
                  value={settings.appearance.fontSize}
                  onChange={(event) =>
                    patchSettings({
                      appearance: {
                        ...settings.appearance,
                        fontSize: Number(event.target.value)
                      }
                    })
                  }
                  className="mt-2 h-11 w-full px-4 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  快捷键：Ctrl + 滚轮 调整弹幕/AI 文字大小
                </p>
              </label>

              <div className="rounded bg-[#f0f0f0] px-4 py-3 text-xs text-slate-500 dark:bg-[#0e1018] dark:text-slate-400">
                <p className="mb-1 font-medium">快捷键</p>
                <p>Ctrl + - / +：UI 整体缩放（全局）</p>
                <p>Ctrl + 滚轮：弹幕/AI 文字大小</p>
                <p>Ctrl + 0：UI 重置</p>
              </div>

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>显示勋章</span>
                <Checkbox
                  checked={settings.appearance.showMedal}
                  onCheckedChange={(c) =>
                    patchSettings({ appearance: { ...settings.appearance, showMedal: !!c } })
                  }
                />
              </label>

              {HIDE_APPEARANCE_OPTIONS.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                  <span>{label}</span>
                  <Checkbox
                    checked={settings.appearance[key]}
                    onCheckedChange={(c) =>
                      patchSettings({ appearance: { ...settings.appearance, [key]: !!c } })
                    }
                  />
                </label>
              ))}

              <div className="rounded bg-[#f0f0f0] px-4 py-3 dark:bg-[#0e1018]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-300">默认弹幕窗口透明度</span>
                  <span className="numeric text-xs text-slate-400 dark:text-slate-500">{settings.appearance.opacity}%</span>
                </div>
                <Slider
                  min={10}
                  max={100}
                  step={1}
                  value={[settings.appearance.opacity]}
                  onValueChange={([v]) =>
                    patchSettings({ appearance: { ...settings.appearance, opacity: v } } as Partial<Settings>)
                  }
                />
              </div>
            </div>
          </div>
        </TabContent>

        <TabContent value="audio" className="flex flex-col gap-4">
          <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
            <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">音频</h3>
            <div className="space-y-4">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                默认音量（%）
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.audio.defaultVolume}
                  onChange={(event) =>
                    patchSettings({
                      audio: {
                        ...settings.audio,
                        defaultVolume: Math.max(0, Math.min(100, Number(event.target.value)))
                      }
                    })
                  }
                  className="mt-2 h-11 w-full px-4 text-sm"
                />
              </label>

              <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                <span>进入直播间时自动播放音频</span>
                <Checkbox
                  checked={settings.audio.autoPlay}
                  onCheckedChange={(c) =>
                    patchSettings({ audio: { ...settings.audio, autoPlay: !!c } })
                  }
                />
              </label>
            </div>
          </div>

          {sttAvailable && (
            <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
              <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">语音识别</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-3 bg-[#f0f0f0] px-4 py-3 text-sm text-slate-600 dark:bg-[#0e1018] dark:text-slate-300">
                  <span>启用语音识别</span>
                  <Checkbox
                    checked={settings.stt.enabled}
                    onCheckedChange={(c) =>
                      patchSettings({ stt: { ...settings.stt, enabled: !!c } })
                    }
                  />
                </label>

                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  识别模型
                  <Select
                    value={settings.stt.modelId || ""}
                    onValueChange={(v) => patchSettings({ stt: { ...settings.stt, modelId: v } })}
                    disabled={availableModels.length === 0}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="未检测到模型文件" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((id) => (
                        <SelectItem key={id} value={id}>{id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  字幕同步偏移（毫秒，负值=提前，正值=延迟）
                  <div className="mt-2 flex items-center gap-3">
                    <Slider
                      min={-2000}
                      max={2000}
                      step={100}
                      value={[settings.stt.syncDelayMs]}
                      onValueChange={([v]) => patchSettings({ stt: { ...settings.stt, syncDelayMs: v } })}
                      className="flex-1"
                    />
                    <span className="numeric w-14 text-right text-xs text-slate-500 dark:text-slate-400">
                      {settings.stt.syncDelayMs > 0 ? "+" + settings.stt.syncDelayMs : settings.stt.syncDelayMs}
                    </span>
                  </div>
                </label>

                <div className="space-y-1">
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    模型文件需放置在以下目录中，每个模型一个子文件夹，包含 encoder、decoder、joiner ONNX 文件和 tokens.txt.
                  </p>
                  {modelDir && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-[#ebebeb] px-2 py-1 text-xs text-slate-600 dark:bg-[#0e1018] dark:text-slate-400">
                        {modelDir}
                      </code>
                      <button
                        type="button"
                        onClick={() => void tauriCommands.stt.openModelDir()}
                        className="flex h-7 w-7 items-center justify-center text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                        title="打开文件夹"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabContent>

        <TabContent value="cache" className="flex flex-col gap-4">
          <CacheCard />
          <CacheLimitCard settings={settings} patchSettings={patchSettings} />
        </TabContent>

        <TabContent value="about" className="flex flex-col gap-4">
          <AboutTab />
        </TabContent>
      </PageTabs>
    </section>
  );
}

function AboutTab() {
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [logDirError, setLogDirError] = useState<string | null>(null);
  const [manualUpdateInfo, setManualUpdateInfo] = useState<import("@/types/bilibili").UpdateInfo | null>(null);

  useEffect(() => {
    getAppVersion().then(setVersion).catch(() => {});
  }, []);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const info = await tauriCommands.update.check();
      if (info.hasUpdate) {
        setManualUpdateInfo(info);
      } else {
        setCheckResult("已是最新版本");
      }
    } catch (e) {
      setCheckResult("检查更新失败");
    } finally {
      setChecking(false);
    }
  };

  const handleOpenLogDir = async () => {
    setLogDirError(null);
    try {
      await tauriCommands.log.openDir();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLogDirError(msg);
      setTimeout(() => setLogDirError(null), 3000);
    }
  };

  return (
    <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
      <div className="flex items-center gap-4">
        <img
          src={aboutIcon}
          alt="BiliDanmu"
          className="h-16 w-16 rounded-xl"
        />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">BiliDanmu</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bilibili 直播弹幕客户端
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          {version && (
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">v{version}</span>
          )}
          <button
            type="button"
            onClick={() => void handleCheckUpdate()}
            disabled={checking}
            className="rounded bg-pink-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? "检查中..." : "检查更新"}
          </button>
          {checkResult && (
            <span className="text-xs text-slate-400 dark:text-slate-500">{checkResult}</span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">AGPLv3 License</span>
        </div>
      </div>
      <UpdateDialog updateInfo={manualUpdateInfo} onDismiss={() => setManualUpdateInfo(null)} />

      {/* 链接 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="https://github.com/sfqy211/bilidanmu/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.04]"
        >
          <ExternalLink className="h-3 w-3" />
          反馈问题
        </a>
        <a
          href="https://github.com/sfqy211/bilidanmu"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.04]"
        >
          <GitBranch className="h-3 w-3" />
          源代码
        </a>
        <button
          type="button"
          onClick={() => void handleOpenLogDir()}
          className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.04]"
        >
          <FolderOpen className="h-3 w-3" />
          日志目录
        </button>
        {logDirError && (
          <span className="text-xs text-red-500">{logDirError}</span>
        )}
      </div>

      {/* 免责声明 */}
      <div className="mt-4 rounded-lg bg-[#f0f0f0] p-4 text-xs leading-relaxed text-slate-500 dark:bg-[#0e1018] dark:text-slate-400">
        <p className="mb-2 font-medium text-slate-600 dark:text-slate-300">免责声明</p>
        <p>
          本软件为开源项目，仅供学习和研究使用。使用本软件所产生的任何后果由使用者自行承担。
          本软件不保证与 B 站服务的兼容性，不保证功能的持续可用性。
          使用本软件时应遵守相关法律法规，不得用于任何商业用途。
          本软件不收集任何用户数据。
        </p>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CacheCard() {
  const [stats, setStats] = useState<{ imageSize: number; imageCount: number; emoticonPkgCount: number; emoticonCount: number; emoticonImageSize: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmType, setConfirmType] = useState<"image" | "emoticon" | "all" | null>(null);

  useEffect(() => {
    tauriCommands.proxy.getCacheStats().then(setStats).catch(() => {});
  }, [refreshKey]);

  const handleClearImage = () => {
    tauriCommands.proxy.clearImageCache().then(() => {
      import("sonner").then(({ toast }) => toast.success("封面与头像缓存已清理"));
      setRefreshKey((k) => k + 1);
    }).catch(() => {
      import("sonner").then(({ toast }) => toast.error("清理失败"));
    });
  };

  const handleClearEmoticon = () => {
    tauriCommands.room.clearRoomSpecificEmoticons().then(() => {
      import("sonner").then(({ toast }) => toast.success("房间专属表情已清理"));
      setRefreshKey((k) => k + 1);
    }).catch(() => {
      import("sonner").then(({ toast }) => toast.error("清理失败"));
    });
  };

  const handleClearAll = () => {
    Promise.allSettled([
      tauriCommands.proxy.clearImageCache(),
      tauriCommands.room.clearEmoticonCache(),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        import("sonner").then(({ toast }) => toast.error("部分缓存清理失败"));
      } else {
        import("sonner").then(({ toast }) => toast.success("所有缓存已清理"));
        setRefreshKey((k) => k + 1);
      }
    });
  };

  return (
    <>
      <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">缓存占用</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={() => setConfirmType("all")}
              className="text-xs text-red-500 transition hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
            >
              清除所有
            </button>
          </div>
        </div>
        {stats ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded bg-[#f0f0f0] px-4 py-3 dark:bg-[#0e1018]">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">封面与头像</p>
                <button
                  type="button"
                  onClick={() => setConfirmType("image")}
                  className="text-xs text-slate-400 transition hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                >
                  清除
                </button>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{formatSize(stats.imageSize)}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{stats.imageCount} 张</p>
            </div>
            <div className="rounded bg-[#f0f0f0] px-4 py-3 dark:bg-[#0e1018]">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">表情包</p>
                <button
                  type="button"
                  onClick={() => setConfirmType("emoticon")}
                  className="text-xs text-slate-400 transition hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                >
                  清除
                </button>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{formatSize(stats.emoticonImageSize)}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{stats.emoticonPkgCount} 个包 · {stats.emoticonCount} 个表情</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">加载中...</p>
        )}
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          清除封面与头像不会影响表情包；删除直播间时会自动清理对应的表情。
        </p>
      </div>

      <ConfirmDialog
        open={confirmType === "image"}
        title="清除封面与头像缓存"
        message="封面和头像将在下次显示时重新下载。"
        onConfirm={() => { setConfirmType(null); handleClearImage(); }}
        onCancel={() => setConfirmType(null)}
      />
      <ConfirmDialog
        open={confirmType === "emoticon"}
        title="清除房间专属表情"
        message="下次进入房间时会重新拉取表情包。"
        onConfirm={() => { setConfirmType(null); handleClearEmoticon(); }}
        onCancel={() => setConfirmType(null)}
      />
      <ConfirmDialog
        open={confirmType === "all"}
        title="清除所有缓存"
        message="这将删除所有已缓存的封面、头像和表情数据。"
        variant="danger"
        onConfirm={() => { setConfirmType(null); handleClearAll(); }}
        onCancel={() => setConfirmType(null)}
      />
    </>
  );
}

function CacheLimitCard({ settings, patchSettings }: { settings: Settings; patchSettings: (patch: Partial<Settings>) => void }) {
  return (
    <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
      <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">
        消息缓存上限 <span className="font-normal text-slate-400 dark:text-slate-500">（0 = 无限制）</span>
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm text-slate-600 dark:text-slate-300">
          弹幕消息
          <input
            type="number"
            min={0}
            step={50}
            value={settings.cache.danmakuLimit}
            onChange={(e) =>
              patchSettings({
                cache: { ...settings.cache, danmakuLimit: Math.max(0, Number(e.target.value)) }
              })
            }
            className="mt-1 h-9 w-full px-3 text-sm"
          />
        </label>
        <label className="block text-sm text-slate-600 dark:text-slate-300">
          礼物消息
          <input
            type="number"
            min={0}
            step={50}
            value={settings.cache.giftLimit}
            onChange={(e) =>
              patchSettings({
                cache: { ...settings.cache, giftLimit: Math.max(0, Number(e.target.value)) }
              })
            }
            className="mt-1 h-9 w-full px-3 text-sm"
          />
        </label>
      </div>
    </div>
  );
}
