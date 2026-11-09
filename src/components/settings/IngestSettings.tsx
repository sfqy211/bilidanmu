import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { IngestStats } from "@/types/bilibili";
import { SettingsGroup, SettingsRow, type SettingsPanelProps } from "./SettingsControls";

/**
 * 弹幕共享上报设置。
 *
 * 开启后，本机在 bilidanmu 里收到的弹幕/礼物/醒目留言会实时推送到中心归档服务，
 * 由中心按 B 站消息 ID 跨节点去重后统一存储（多台机器录同一场可以拼成完整一场）。
 */
export function IngestSettings({ settings, patchSettings }: SettingsPanelProps) {
  const ingest = settings.ingest;
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refreshStats = useCallback(() => {
    invoke<IngestStats>("ingest_stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    refreshStats();
    const timer = window.setInterval(refreshStats, 3000);
    return () => window.clearInterval(timer);
  }, [refreshStats]);

  const patchIngest = (patch: Partial<typeof ingest>) => {
    patchSettings({ ingest: { ...ingest, ...patch } });
  };

  const pushConfig = async () => {
    try {
      await invoke("ingest_apply_config", {
        enabled: ingest.enabled,
        centerUrl: ingest.centerUrl,
        nodeToken: ingest.nodeToken,
        nodeId: ingest.nodeId,
      });
      refreshStats();
    } catch (error) {
      setTestResult({ ok: false, message: `应用配置失败：${String(error)}` });
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<{ nodeId: string; name?: string; totalEvents?: number }>(
        "ingest_test_connection",
        {
          centerUrl: ingest.centerUrl,
          nodeToken: ingest.nodeToken,
          nodeId: ingest.nodeId,
        },
      );
      setTestResult({
        ok: true,
        message: `连接成功：节点 ${result.nodeId}${result.name ? `（${result.name}）` : ""}`,
      });
    } catch (error) {
      setTestResult({ ok: false, message: `连接失败：${String(error)}` });
    } finally {
      setTesting(false);
    }
  };

  const statusText = !ingest.enabled
    ? "未启用"
    : stats?.connected
      ? "已连接"
      : "未连接";

  return (
    <>
      <SettingsGroup
        title="弹幕共享上报"
        description="把本机采集到的弹幕、礼物与醒目留言实时推送到中心归档服务。多台机器录同一场直播时，中心会按消息 ID 去重并拼成完整一场。"
      >
        <SettingsRow
          title="启用上报"
          description="仅在填写了中心地址与节点 Token 后生效。开启后不影响本地弹幕显示。"
        >
          <input
            type="checkbox"
            aria-label="启用弹幕共享上报"
            checked={ingest.enabled}
            onChange={(event) => {
              patchIngest({ enabled: event.target.checked });
              void pushConfig();
            }}
            className="h-4 w-4"
          />
        </SettingsRow>

        <SettingsRow title="中心地址" description="中心服务的根地址，例如 https://api.example.com">
          <input
            type="text"
            aria-label="中心服务地址"
            placeholder="https://api.example.com"
            value={ingest.centerUrl}
            onChange={(event) => patchIngest({ centerUrl: event.target.value.trim() })}
            onBlur={() => void pushConfig()}
            className="h-8 w-full px-3 text-[13px]"
          />
        </SettingsRow>

        <SettingsRow title="节点标识" description="需与中心后台创建节点时填写的 nodeId 一致">
          <input
            type="text"
            aria-label="节点标识"
            placeholder="例如 home-desktop"
            value={ingest.nodeId}
            onChange={(event) => patchIngest({ nodeId: event.target.value.trim() })}
            onBlur={() => void pushConfig()}
            className="h-8 w-full px-3 text-[13px]"
          />
        </SettingsRow>

        <SettingsRow title="节点 Token" description="中心后台创建节点时一次性返回，请妥善保存">
          <input
            type="password"
            aria-label="节点 Token"
            placeholder="粘贴节点 Token"
            value={ingest.nodeToken}
            onChange={(event) => patchIngest({ nodeToken: event.target.value.trim() })}
            onBlur={() => void pushConfig()}
            className="h-8 w-full px-3 text-[13px]"
          />
        </SettingsRow>

        <SettingsRow title="连接测试" description="验证中心地址与 Token 是否可用">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={testing || !ingest.centerUrl || !ingest.nodeToken}
              className="h-8 rounded-md border px-3 text-[13px] disabled:opacity-50"
            >
              {testing ? "测试中…" : "测试连接"}
            </button>
            {testResult && (
              <span className={`text-[12px] ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="上报状态" description="实时显示本节点的上报队列与连接情况">
        <SettingsRow title="当前状态" description="未连接时事件会留在本地队列，恢复后自动补传">
          <span className="text-[13px]">
            {statusText}
            {stats && ingest.enabled ? `　队列 ${stats.queued} 条　已发送 ${stats.sent} 条` : ""}
            {stats && stats.dropped > 0 ? `　已丢弃 ${stats.dropped} 条` : ""}
          </span>
        </SettingsRow>
        {stats?.lastError && (
          <SettingsRow title="最近错误" description="通常为网络问题或 Token 失效">
            <span className="text-[12px] text-red-600">{stats.lastError}</span>
          </SettingsRow>
        )}
        {stats?.activeSessionId ? (
          <SettingsRow title="当前会话" description="中心为该场直播分配的会话 ID">
            <span className="text-[13px]">#{stats.activeSessionId}</span>
          </SettingsRow>
        ) : null}
      </SettingsGroup>
    </>
  );
}
