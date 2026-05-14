import { defaultSettings } from "@/stores/settings-store";

export function SettingsPage() {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">设置</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-2 text-lg font-medium">弹幕发送</h3>
          <p className="text-sm text-slate-400">
            默认间隔 {defaultSettings.sendInterval.min}s - {defaultSettings.sendInterval.max}s
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-2 text-lg font-medium">弹幕接收</h3>
          <p className="text-sm text-slate-400">
            自动连接：{defaultSettings.receive.autoConnect ? "开启" : "关闭"}
          </p>
        </div>
      </div>
    </section>
  );
}
