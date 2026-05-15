import { useEffect, useState } from "react";
import { PageTabs, TabContent } from "@/components/ui/PageTabs";
import { tauriCommands } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const patchSettings = useSettingsStore((state) => state.patchSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("send");

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
          setError(loadError instanceof Error ? loadError.message : "加载设置失败");
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await tauriCommands.settings.update(settings);
      setSuccess("设置已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">设置</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">发送、接收与外观的核心设置。</p>
        </div>
        <div className="flex items-center gap-3">
          {error ? <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p> : null}
          <button
            onClick={() => void handleSave()}
            disabled={loading || saving}
            className="bg-pink-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>

      <PageTabs
        tabs={[
          { value: "send", label: "弹幕发送" },
          { value: "receive", label: "弹幕接收" },
          { value: "appearance", label: "外观" },
          { value: "notification", label: "通知" }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <TabContent value="send" className="flex flex-col gap-4">
          <div className="border border-slate-300 bg-white p-6 dark:border-white/[0.06] dark:bg-[#12141e]">
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
                    className="mt-2 h-11 w-full border border-slate-300 bg-white px-4 text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
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
                    className="mt-2 h-11 w-full border border-slate-300 bg-white px-4 text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
                  />
                </label>
              </div>

              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>启用随机间隔</span>
                <input
                  type="checkbox"
                  checked={settings.riskControl.randomInterval}
                  onChange={(event) =>
                    patchSettings({
                      riskControl: {
                        ...settings.riskControl,
                        randomInterval: event.target.checked
                      }
                    })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>启用间隔抖动</span>
                <input
                  type="checkbox"
                  checked={settings.riskControl.jitter}
                  onChange={(event) =>
                    patchSettings({
                      riskControl: {
                        ...settings.riskControl,
                        jitter: event.target.checked
                      }
                    })
                  }
                />
              </label>
            </div>
          </div>
        </TabContent>

        <TabContent value="receive" className="flex flex-col gap-4">
          <div className="border border-slate-300 bg-white p-6 dark:border-white/[0.06] dark:bg-[#12141e]">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>自动连接弹幕流</span>
                <input
                  type="checkbox"
                  checked={settings.receive.autoConnect}
                  onChange={(event) =>
                    patchSettings({
                      receive: {
                        ...settings.receive,
                        autoConnect: event.target.checked
                      }
                    })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>断线自动重连</span>
                <input
                  type="checkbox"
                  checked={settings.receive.autoReconnect}
                  onChange={(event) =>
                    patchSettings({
                      receive: {
                        ...settings.receive,
                        autoReconnect: event.target.checked
                      }
                    })
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
                    className="mt-2 h-11 w-full border border-slate-300 bg-white px-4 text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
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
                    className="mt-2 h-11 w-full border border-slate-300 bg-white px-4 text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
                  />
                </label>
              </div>
            </div>
          </div>
        </TabContent>

        <TabContent value="appearance" className="flex flex-col gap-4">
          <div className="border border-slate-300 bg-white p-6 dark:border-white/[0.06] dark:bg-[#12141e]">
            <div className="space-y-4">
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                主题
                <select
                  value={settings.appearance.theme}
                  onChange={(event) =>
                    patchSettings({
                      appearance: {
                        ...settings.appearance,
                        theme: event.target.value as "light" | "dark" | "system"
                      }
                    })
                  }
                  className="mt-2 h-11 w-full border border-slate-300 bg-white px-4 text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
                >
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                  <option value="system">跟随系统</option>
                </select>
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
                  className="mt-2 h-11 w-full border border-slate-300 bg-white px-4 text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
                />
              </label>

              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>显示勋章</span>
                <input
                  type="checkbox"
                  checked={settings.appearance.showMedal}
                  onChange={(event) =>
                    patchSettings({
                      appearance: {
                        ...settings.appearance,
                        showMedal: event.target.checked
                      }
                    })
                  }
                />
              </label>
            </div>
          </div>
        </TabContent>

        <TabContent value="notification" className="flex flex-col gap-4">
          <div className="border border-slate-300 bg-white p-6 dark:border-white/[0.06] dark:bg-[#12141e]">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>禁言提醒</span>
                <input
                  type="checkbox"
                  checked={settings.notification.muteAlert}
                  onChange={(event) =>
                    patchSettings({
                      notification: {
                        ...settings.notification,
                        muteAlert: event.target.checked
                      }
                    })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-300">
                <span>Cookie 过期提醒</span>
                <input
                  type="checkbox"
                  checked={settings.notification.cookieExpiry}
                  onChange={(event) =>
                    patchSettings({
                      notification: {
                        ...settings.notification,
                        cookieExpiry: event.target.checked
                      }
                    })
                  }
                />
              </label>
            </div>
          </div>
        </TabContent>
      </PageTabs>
    </section>
  );
}
