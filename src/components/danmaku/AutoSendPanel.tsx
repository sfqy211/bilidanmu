import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Square, Star, X, Loader2, Circle } from "lucide-react";
import {
  PanelButton,
  PanelInput,
  PanelNote,
  PanelTabs,
  PanelTextarea,
} from "@/components/ui/DanmakuPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { AutoSendEntry } from "@/lib/tauri";
import type { EmoticonPackage } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

// ─── 共享类型 ───

interface AutoLikeProps {
  anchorId: number;
  isRunning: boolean;
  sentTotal: number;
  targetTotal: number;
  error: string | null;
  stopReason: string | null;
  onStart: (targetTotal: number, batchSize: number, intervalMs: number) => Promise<void>;
  onStop: () => void;
}

interface AutoSendPanelProps {
  isRunning: boolean;
  lastSentMessage: string | null;
  lastIndex: number | null;
  sentCount: number;
  stopReason: string | null;
  error: string | null;
  emoticonPackages: EmoticonPackage[];
  onStart: (entries: AutoSendEntry[], intervalMs: number, timeLimitSecs?: number) => Promise<void>;
  onStop: () => void;
  like: AutoLikeProps;
  onClose: () => void;
}

type TabKey = "text" | "emotion" | "like";


// ─── 文字 Tab 内容区 ───

function TextTabContent({
  isRunning,
  onEntriesChange,
}: {
  isRunning: boolean;
  onEntriesChange: (entries: AutoSendEntry[]) => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [messagesInput, setMessagesInput] = useState("");

  const entries = useMemo(
    () => messagesInput.split("\n").flatMap((s) => {
      const msg = s.trim();
      return msg ? [{ message: msg, dmType: 0, emoticonOptions: undefined }] : [];
    }),
    [messagesInput]
  );

  useEffect(() => {
    onEntriesChange(entries);
  }, [entries, onEntriesChange]);

  return (
    <div>
      <PanelTextarea
        value={messagesInput}
        onChange={(e) => setMessagesInput(e.target.value)}
        disabled={isRunning}
        placeholder={translate("autoSend.placeholder")}
        rows={2}
      />
      <PanelNote>{translate("autoSend.count", { count: entries.length })}</PanelNote>
    </div>
  );
}

// ─── 表情 Tab 内容区 ───

function EmotionTabContent({
  isRunning,
  emoticonPackages,
  onEntriesChange,
}: {
  isRunning: boolean;
  emoticonPackages: EmoticonPackage[];
  onEntriesChange: (entries: AutoSendEntry[]) => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [selectedMap, setSelectedMap] = useState<Map<string, string>>(new Map());
  const [activePkgKey, setActivePkgKey] = useState<string | null>(null);

  const activePkg = useMemo(() => {
    if (activePkgKey) {
      return emoticonPackages.find((pkg) => makePkgKey(pkg) === activePkgKey);
    }
    return emoticonPackages[0];
  }, [emoticonPackages, activePkgKey]);

  const selectedEntries = useMemo(() => {
    const result: AutoSendEntry[] = [];
    for (const [unique] of selectedMap) {
      result.push({ message: unique, dmType: 1, emoticonOptions: "{}" });
    }
    return result;
  }, [selectedMap]);

  useEffect(() => {
    onEntriesChange(selectedEntries);
  }, [selectedEntries, onEntriesChange]);

  const toggleEmotion = (unique: string, url: string) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(unique)) next.delete(unique);
      else next.set(unique, url);
      return next;
    });
  };

  const clearAll = () => setSelectedMap(new Map());

  return (
    <div className="space-y-3">
      {/* 已选表情 */}
      <div className="panel-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="panel-row-label">{translate("autoSend.selected", { count: selectedEntries.length })}</span>
          {selectedEntries.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              disabled={isRunning}
              className="text-xs text-rose-500 transition hover:text-rose-600 disabled:opacity-50 dark:text-rose-400"
            >
              {translate("autoSend.clear")}
            </button>
          ) : null}
        </div>
        {selectedEntries.length === 0 ? (
          <PanelNote>{translate("autoSend.chooseEmotes")}</PanelNote>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedEntries.map((entry) => {
              const emotUrl = selectedMap.get(entry.message) ?? "";
              return (
                <button
                  key={entry.message}
                  type="button"
                  onClick={() => toggleEmotion(entry.message, emotUrl)}
                  disabled={isRunning}
                  className="relative rounded-md border border-brand/30 bg-brand/10 p-0.5 disabled:opacity-50"
                  title={entry.message}
                >
                  {emotUrl ? (
                    <ProxiedImage src={emotUrl} alt={entry.message} persistent className="h-7 w-7 object-contain" />
                  ) : (
                    <span className="px-1 text-xs">{entry.message}</span>
                  )}
                  <X className="absolute -right-1 -top-1 h-3 w-3 text-rose-400" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 表情包选择 */}
      {emoticonPackages.length > 0 ? (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {emoticonPackages.map((pkg) => {
              const key = makePkgKey(pkg);
              const active = key === (activePkgKey ?? makePkgKey(emoticonPackages[0]));
              const preview = pkg.emoticons[0];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivePkgKey(key)}
                  disabled={isRunning}
                  className={`shrink-0 rounded-md p-1 transition disabled:opacity-50 ${
                    active
                      ? "bg-brand/10 ring-1 ring-inset ring-brand/30"
                      : "hover:bg-[var(--panel-hover)]"
                  }`}
                  title={pkg.pkgName || translate("autoSend.unnamedPack", { value: pkg.pkgId })}
                >
                  {pkg.pkgId === -1 ? (
                    <Star className={`h-5 w-5 ${active ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />
                  ) : preview ? (
                    <ProxiedImage src={preview.url} alt={pkg.pkgName} persistent className="h-7 w-7 object-contain" />
                  ) : (
                    <span className="px-1 text-xs text-ink-muted">{pkg.pkgName || translate("autoSend.unnamedPack", { value: pkg.pkgId })}</span>
                  )}
                </button>
              );
            })}
          </div>

          {activePkg ? (
            <div className="grid max-h-40 grid-cols-6 gap-1.5 overflow-y-auto">
              {activePkg.emoticons.map((emot) => {
                const available = (emot.perm ?? 1) !== 0 && Boolean(emot.emoticonUnique);
                const selected = Boolean(emot.emoticonUnique && selectedMap.has(emot.emoticonUnique));
                return (
                  <button
                    key={emot.emoticonUnique ?? emot.emoticonId}
                    type="button"
                    onClick={() => emot.emoticonUnique && toggleEmotion(emot.emoticonUnique, emot.url)}
                    disabled={!available || isRunning}
                    title={emot.descript ?? emot.emoji ?? ""}
                    className={`flex items-center justify-center rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                      selected
                        ? "bg-brand/10 ring-1 ring-inset ring-brand/30"
                        : "hover:bg-[var(--panel-hover)]"
                    }`}
                  >
                    <ProxiedImage src={emot.url} alt={emot.descript ?? emot.emoji ?? ""} persistent className="h-7 w-7 object-contain" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <PanelNote>{translate("autoSend.loadEmotes")}</PanelNote>
      )}
    </div>
  );
}

// ─── 主面板 ───

export function AutoSendPanel(props: AutoSendPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const AUTO_SEND_TABS: Array<{ value: TabKey; label: string }> = [
    { value: "text", label: translate("autoSend.text") },
    { value: "emotion", label: translate("autoSend.emotes") },
    { value: "like", label: translate("autoSend.like") },
  ];
  const {
    isRunning,
    lastSentMessage,
    lastIndex,
    sentCount,
    stopReason,
    error,
    emoticonPackages,
    onStart,
    onStop,
    like,
    onClose,
  } = props;

  const [activeTab, setActiveTab] = useState<TabKey>("text");

  // 全局统一的间隔/时间限制配置
  const [intervalSec, setIntervalSec] = useState("5");
  const [timeLimitSec, setTimeLimitSec] = useState("0");

  // 当前 Tab 的 entries（由各 Tab 内容区通过 onEntriesChange 回调上报）
  const [currentEntries, setCurrentEntries] = useState<AutoSendEntry[]>([]);
  const onEntriesChange = useCallback((entries: AutoSendEntry[]) => {
    setCurrentEntries(entries);
  }, []);

  // 统一的开始/停止
  const handleStart = useCallback(() => {
    const sec = Number(intervalSec);
    if (!Number.isFinite(sec) || sec < 0.3 || currentEntries.length === 0) return;
    const limit = Number(timeLimitSec);
    void onStart(currentEntries, Math.round(sec * 1000), limit > 0 ? limit : undefined);
  }, [intervalSec, timeLimitSec, currentEntries, onStart]);

  // 自动点赞参数
  const [likeTarget, setLikeTarget] = useState("100");
  const [likeBatchSize, setLikeBatchSize] = useState("5");
  const [likeIntervalSec, setLikeIntervalSec] = useState("1.5");

  const running = activeTab === "like" ? like.isRunning : isRunning;
  const canStart = activeTab === "like"
    ? !like.isRunning && like.anchorId && (() => {
        const t = Number(likeTarget), b = Number(likeBatchSize), i = Number(likeIntervalSec);
        return Number.isFinite(t) && t > 0 && t <= 1000 && Number.isFinite(b) && b > 0 && b <= 100 && Number.isFinite(i) && i >= 0.5;
      })()
    : !isRunning && currentEntries.length > 0 && Number.isFinite(Number(intervalSec)) && Number(intervalSec) >= 0.3;

  const handleToggle = () => {
    if (running) {
      if (activeTab === "like") like.onStop();
      else onStop();
      return;
    }
    if (!canStart) return;
    if (activeTab === "like") {
      const t = Math.round(Number(likeTarget));
      const b = Math.round(Number(likeBatchSize));
      const i = Math.round(Number(likeIntervalSec) * 1000);
      void like.onStart(t, b, i);
    } else {
      handleStart();
    }
  };

  return (
    <FloatingPanel
      title={translate("autoSend.repeat")}
      onClose={onClose}
      extra={
        <>
          <PanelButton
            variant={running ? "stop" : "primary"}
            onClick={handleToggle}
            disabled={!running && !canStart}
            title={running ? translate("autoSend.stop") : activeTab === "like" && !like.anchorId ? translate("autoSend.missingStreamer") : translate("autoSend.start")}
            aria-label={running ? translate("autoSend.stop") : translate("autoSend.start")}
            className="h-6 w-6 shrink-0 px-0"
          >
            {running ? <Square className="h-3 w-3" /> : <Play className="h-3.5 w-3.5" />}
          </PanelButton>
          {(isRunning || like.isRunning)
            ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            : <Circle className="h-4 w-4 text-ink-muted" />}
        </>
      }
      footer={
        activeTab === "like" ? (
          /* 进度条（仅点赞 tab 且有目标时显示，无内容时不渲染 footer） */
          like.targetTotal > 0 ? (
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center justify-between text-[10px] text-ink-muted">
                <span>{like.sentTotal}/{like.targetTotal}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-control-bg)]">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${Math.min(100, (like.sentTotal / like.targetTotal) * 100)}%` }}
                />
              </div>
            </div>
          ) : undefined
        ) : (
          /* 间隔 / 限时：同一行放置 */
          <div className="flex flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="shrink-0 text-xs text-ink-muted">{translate("autoSend.interval")}</label>
              <div className="w-12 shrink-0">
                <PanelInput
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(e.target.value)}
                  disabled={isRunning}
                  inputMode="decimal"
                />
              </div>
              <span className="text-xs text-ink-muted">{translate("autoSend.seconds")}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="shrink-0 text-xs text-ink-muted">{translate("autoSend.duration")}</label>
              <div className="w-12 shrink-0">
                <PanelInput
                  value={timeLimitSec}
                  onChange={(e) => setTimeLimitSec(e.target.value)}
                  disabled={isRunning}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <span className="text-xs text-ink-muted">{translate("autoSend.seconds")}</span>
            </div>
          </div>
        )
      }
    >
      <PanelTabs
        className="mb-3"
        items={AUTO_SEND_TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel={translate("autoSend.type")}
      />

      {/* Tab 内容区 */}
      {activeTab === "text" ? (
        <TextTabContent isRunning={isRunning} onEntriesChange={onEntriesChange} />
      ) : activeTab === "emotion" ? (
        <EmotionTabContent isRunning={isRunning} emoticonPackages={emoticonPackages} onEntriesChange={onEntriesChange} />
      ) : (
        /* 点赞 Tab */
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-ink-muted">{translate("autoSend.total")}</label>
              <PanelInput
                value={likeTarget}
                onChange={(e) => setLikeTarget(e.target.value)}
                disabled={like.isRunning}
                inputMode="numeric"
                placeholder="100"
              />
              <PanelNote>{translate("autoSend.max")}</PanelNote>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-ink-muted">{translate("autoSend.batchSize")}</label>
              <PanelInput
                value={likeBatchSize}
                onChange={(e) => setLikeBatchSize(e.target.value)}
                disabled={like.isRunning}
                inputMode="numeric"
                placeholder="5"
              />
              <PanelNote>{translate("autoSend.batchMax")}</PanelNote>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-ink-muted">{translate("autoSend.batchInterval")}</label>
              <PanelInput
                value={likeIntervalSec}
                onChange={(e) => setLikeIntervalSec(e.target.value)}
                disabled={like.isRunning}
                inputMode="decimal"
                placeholder="1.5"
              />
              <PanelNote>{translate("autoSend.minimum")}</PanelNote>
            </div>
          </div>

          {/* 状态 */}
          <div className="space-y-1">
            {like.stopReason === "completed" ? (
              <PanelNote>{translate("autoSend.likesDone")}</PanelNote>
            ) : like.stopReason === "manual" ? (
              <PanelNote>{translate("autoSend.stopped")}</PanelNote>
            ) : like.stopReason === "error" ? (
              <p className="panel-error">{translate("autoSend.stoppedError")}</p>
            ) : null}
            {like.error ? <p className="panel-error">{translate("autoSend.error")}{like.error}</p> : null}
          </div>
        </div>
      )}

      {/* 运行状态 */}
      <div className="mt-3 space-y-1">
        {lastSentMessage ? (
          <PanelNote>{translate("autoSend.lastSent")}{lastSentMessage.length > 30 ? `${lastSentMessage.slice(0, 30)}…` : lastSentMessage}</PanelNote>
        ) : null}
        {lastIndex !== null ? <PanelNote>{translate("autoSend.index")}{lastIndex + 1}</PanelNote> : null}
        {sentCount > 0 ? <PanelNote>{translate("autoSend.sentCount", { count: sentCount })}</PanelNote> : null}
        {stopReason ? <PanelNote>{translate("autoSend.stopReason")}{stopReason}</PanelNote> : null}
        {error ? <p className="panel-error">{translate("autoSend.error")}{error}</p> : null}
      </div>
    </FloatingPanel>
  );
}
