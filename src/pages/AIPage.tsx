import { useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { tauriCommands } from "@/lib/tauri";
import type { AstrbotConfig } from "@/types/bilibili";

export function AIPage() {
  const [config, setConfig] = useState<AstrbotConfig | null>(null);
  const [host, setHost] = useState("127.0.0.1");
  const [httpPort, setHttpPort] = useState("18080");
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);

  const showError = (msg: string) => { setError(msg); setSuccess(null); setMsgKey((k) => k + 1); };
  const showSuccess = (msg: string) => { setSuccess(msg); setError(null); setMsgKey((k) => k + 1); };
  const clearMessage = () => { setError(null); setSuccess(null); };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const cfg = await tauriCommands.ai.getConfig();
        if (!cancelled && cfg) {
          setConfig(cfg);
          setHost(cfg.host);
          setHttpPort(String(cfg.httpPort));
        }
      } catch {
        // 首次使用，无配置
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    clearMessage();
    try {
      const cfg: AstrbotConfig = {
        host,
        httpPort: Number(httpPort),
        callbackPort: 0,
      };
      await tauriCommands.ai.configure(cfg.host, cfg.httpPort, cfg.callbackPort);
      setConfig(cfg);
      showSuccess("AstrBot 配置已保存");
    } catch (e) {
      showError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTestStatus = async () => {
    clearMessage();
    try {
      const s = await tauriCommands.ai.getStatus();
      setStatus(s);
    } catch (e) {
      showError(e instanceof Error ? e.message : "连接 AstrBot 失败");
      setStatus(null);
    }
  };

  if (loading) {
    return (
      <section className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400">加载中...</p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">AI 代理</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            连接 AstrBot 实现 AI 弹幕回复与总结。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && <InlineMessage key={msgKey} type="error">{error}</InlineMessage>}
          {success && <InlineMessage key={msgKey} type="success">{success}</InlineMessage>}
        </div>
      </div>

      {/* AstrBot 连接配置 */}
      <div className="rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
        <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-white">
          AstrBot 连接
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-600 dark:text-slate-300">
            AstrBot 地址
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="127.0.0.1"
              className="mt-2 h-11 w-full rounded border border-neutral-200 bg-[#f8f8f8] px-4 text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-white"
            />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-300">
            HTTP API 端口
            <input
              value={httpPort}
              onChange={(e) => setHttpPort(e.target.value)}
              placeholder="18080"
              className="mt-2 h-11 w-full rounded border border-neutral-200 bg-[#f8f8f8] px-4 text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-white"
            />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !host || !httpPort}
            className="rounded bg-pink-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
          <button
            onClick={() => void handleTestStatus()}
            disabled={!config}
            className="inline-flex items-center gap-1.5 rounded px-4 py-3 text-sm text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            测试连接
          </button>
        </div>
      </div>

      {/* 状态显示 */}
      {status && (
        <div className="mt-4 rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
          <h3 className="mb-3 text-lg font-medium text-slate-900 dark:text-white">
            <Bot className="mr-1.5 inline h-4 w-4" />
            AstrBot 状态
          </h3>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">当前房间：</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {String(status.room_id ?? "-")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">运行状态：</span>
              <span
                className={`${
                  status.is_running
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {status.is_running ? "运行中" : "未连接"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">HTTP 端口：</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {String(status.http_port ?? "-")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="mt-4 rounded-lg bg-[#f8f8f8] p-6 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
        <h3 className="mb-3 text-lg font-medium text-slate-900 dark:text-white">使用说明</h3>
        <ol className="list-inside list-decimal space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>部署 AstrBot 并安装 <code className="bg-[#ebebeb] px-1 dark:bg-[#0e1018]">astrbot_plugin_bilibili_live</code> 插件</li>
          <li>在 AstrBot 中配置 LLM 提供商（OpenAI / Ollama 等）</li>
          <li>在插件配置中填入 B 站 Cookie</li>
          <li>在上方填入 AstrBot 的 HTTP API 端口并保存</li>
          <li>打开直播间弹幕页面，在 AI 助手窗口中使用「AI 回复」或「AI 总结」</li>
        </ol>
      </div>
    </section>
  );
}
