import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Plus, Send, Square, Star, X, Loader2, Circle } from "lucide-react";
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

const AUTO_SEND_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "text", label: "文字" },
  { key: "emotion", label: "表情" },
  { key: "like", label: "点赞" },
];

// ─── 文字 Tab 内容区 ───

function TextTabContent({
  isRunning,
  onEntriesChange,
}: {
  isRunning: boolean;
  onEntriesChange: (entries: AutoSendEntry[]) => void;
}) {
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
      <textarea
        value={messagesInput}
        onChange={(e) => setMessagesInput(e.target.value)}
        disabled={isRunning}
        placeholder={"每行一条循环弹幕\n第一条"}
        rows={2}
        className="w-full rounded bg-white/10 px-4 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-pink-500/30 disabled:opacity-60 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
      />
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">共 {entries.length} 条</p>
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
      <div className="rounded bg-white/10 p-3 dark:bg-white/[0.06]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            已选表情 ({selectedEntries.length})
          </span>
          {selectedEntries.length > 0 ? (
            <button onClick={clearAll} disabled={isRunning} className="text-xs text-rose-500 hover:text-rose-600 disabled:opacity-50 dark:text-rose-400">
              清空
            </button>
          ) : null}
        </div>
        {selectedEntries.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">点击下方表情添加</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedEntries.map((entry) => {
              const emotUrl = selectedMap.get(entry.message) ?? "";
              return (
                <button
                  key={entry.message}
                  onClick={() => toggleEmotion(entry.message, emotUrl)}
                  disabled={isRunning}
                  className="relative border border-pink-200 bg-pink-50 p-0.5 dark:border-pink-500/30 dark:bg-pink-500/10 disabled:opacity-50"
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
                  onClick={() => setActivePkgKey(key)}
                  disabled={isRunning}
                  className={`shrink-0 p-1 transition disabled:opacity-50 ${
                    active
                      ? "border border-pink-300 bg-pink-50 dark:border-pink-500/40 dark:bg-pink-500/10"
                      : "hover:bg-white/[0.08] dark:hover:bg-white/[0.04]"
                  }`}
                  title={pkg.pkgName || `包 ${pkg.pkgId}`}
                >
                  {pkg.pkgId === -1 ? (
                    <Star className={`h-5 w-5 ${active ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />
                  ) : preview ? (
                    <ProxiedImage src={preview.url} alt={pkg.pkgName} persistent className="h-7 w-7 object-contain" />
                  ) : (
                    <span className="px-1 text-xs text-slate-500 dark:text-slate-400">{pkg.pkgName || `包 ${pkg.pkgId}`}</span>
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
                    onClick={() => emot.emoticonUnique && toggleEmotion(emot.emoticonUnique, emot.url)}
                    disabled={!available || isRunning}
                    title={emot.descript ?? emot.emoji ?? ""}
                    className={`flex items-center justify-center p-1.5 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                      selected
                        ? "border border-pink-300 bg-pink-50 dark:border-pink-500/30 dark:bg-pink-500/10"
                        : "hover:bg-white/[0.08] dark:hover:bg-white/[0.04]"
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
        <p className="text-xs text-slate-400 dark:text-slate-500">请先在弹幕页打开表情选择器加载表情列表</p>
      )}
    </div>
  );
}

// ─── 主面板 ───

export function AutoSendPanel(props: AutoSendPanelProps) {
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

  return (
    <FloatingPanel
      title="循环发送"
      onClose={onClose}
      extra={
        (isRunning || like.isRunning)
          ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
          : <Circle className="h-4 w-4 text-slate-400" />
      }
    >

      {/* Tab 切换 */}
      <div className="mb-3 flex gap-1">
        {AUTO_SEND_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              activeTab === tab.key
                ? "border-b-2 border-pink-500 text-pink-600 dark:text-pink-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容区 */}
      {activeTab === "text" ? (
        <TextTabContent isRunning={isRunning} onEntriesChange={onEntriesChange} />
      ) : activeTab === "emotion" ? (
        <EmotionTabContent isRunning={isRunning} emoticonPackages={emoticonPackages} onEntriesChange={onEntriesChange} />
      ) : (
        /* 点赞 Tab */
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">目标总数</label>
              <input
                value={likeTarget}
                onChange={(e) => setLikeTarget(e.target.value)}
                disabled={like.isRunning}
                inputMode="numeric"
                placeholder="100"
                className="h-8 rounded bg-white/10 px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-pink-500/30 disabled:opacity-60 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">上限 1000</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">批次大小</label>
              <input
                value={likeBatchSize}
                onChange={(e) => setLikeBatchSize(e.target.value)}
                disabled={like.isRunning}
                inputMode="numeric"
                placeholder="5"
                className="h-8 rounded bg-white/10 px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-pink-500/30 disabled:opacity-60 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">每批 ≤100</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">批次间隔</label>
              <input
                value={likeIntervalSec}
                onChange={(e) => setLikeIntervalSec(e.target.value)}
                disabled={like.isRunning}
                inputMode="decimal"
                placeholder="1.5"
                className="h-8 rounded bg-white/10 px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-pink-500/30 disabled:opacity-60 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">秒，最小 0.5</span>
            </div>
          </div>

          {/* 状态 */}
          <div className="space-y-1 text-xs">
            {like.stopReason === "completed" ? (
              <p className="text-emerald-600 dark:text-emerald-400">✓ 点赞完成</p>
            ) : like.stopReason === "manual" ? (
              <p className="text-slate-400 dark:text-slate-500">已手动停止</p>
            ) : like.stopReason === "error" ? (
              <p className="text-rose-500 dark:text-rose-400">已停止（错误）</p>
            ) : null}
            {like.error ? <p className="text-rose-500 dark:text-rose-400">错误：{like.error}</p> : null}
          </div>
        </div>
      )}

      {/* 底部控件：进度 + 间隔 + 限时 + 启停 */}
      <div className="mt-3 flex items-center gap-2">
        {/* 进度条（仅点赞 tab 且有目标时显示） */}
        {activeTab === "like" && like.targetTotal > 0 && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">
              <span>{like.sentTotal}/{like.targetTotal}</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-500 transition-all rounded-full"
                style={{ width: `${Math.min(100, (like.sentTotal / like.targetTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 间隔（仅文字/表情 tab，点赞 tab 上方已有批次间隔） */}
        {activeTab !== "like" && (
          <div className="flex items-center gap-1.5">
            <label className="shrink-0 text-xs text-slate-500 dark:text-slate-400">间隔</label>
            <input
              value={intervalSec}
              onChange={(e) => setIntervalSec(e.target.value)}
              disabled={isRunning}
              inputMode="decimal"
              className="h-8 w-14 rounded bg-white/10 px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 disabled:opacity-60 dark:bg-white/[0.06] dark:text-white"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">秒</span>
          </div>
        )}

        {/* 限时（仅文字/表情 tab） */}
        {activeTab !== "like" && (
          <div className="flex items-center gap-1.5">
            <label className="shrink-0 text-xs text-slate-500 dark:text-slate-400">限时</label>
            <input
              value={timeLimitSec}
              onChange={(e) => setTimeLimitSec(e.target.value)}
              disabled={isRunning}
              inputMode="numeric"
              placeholder="0"
              className="h-8 w-14 rounded bg-white/10 px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">秒</span>
          </div>
        )}

        {/* 启停按钮 */}
        {(() => {
          const running = activeTab === "like" ? like.isRunning : isRunning;
          const canStart = activeTab === "like"
            ? !like.isRunning && like.anchorId && (() => {
                const t = Number(likeTarget), b = Number(likeBatchSize), i = Number(likeIntervalSec);
                return Number.isFinite(t) && t > 0 && t <= 1000 && Number.isFinite(b) && b > 0 && b <= 100 && Number.isFinite(i) && i >= 0.5;
              })()
            : !isRunning && currentEntries.length > 0 && Number.isFinite(Number(intervalSec)) && Number(intervalSec) >= 0.3;

          return (
            <button
              onClick={() => {
                if (running) {
                  activeTab === "like" ? like.onStop() : onStop();
                } else if (canStart) {
                  if (activeTab === "like") {
                    const t = Math.round(Number(likeTarget));
                    const b = Math.round(Number(likeBatchSize));
                    const i = Math.round(Number(likeIntervalSec) * 1000);
                    void like.onStart(t, b, i);
                  } else {
                    handleStart();
                  }
                }
              }}
              disabled={!running && !canStart}
              title={running ? "停止" : activeTab === "like" && !like.anchorId ? "缺少主播信息" : "开始"}
              className={`ml-auto flex h-8 w-8 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
                running
                  ? "bg-rose-500 text-white hover:bg-rose-400"
                  : "bg-pink-500 text-white hover:bg-pink-400"
              }`}
            >
              {running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-4 w-4" />}
            </button>
          );
        })()}
      </div>

      {/* 运行状态 */}
      <div className="mt-3 space-y-1 text-xs">
        {lastSentMessage ? (
          <p className="text-slate-500 dark:text-slate-400">
            最近发送：{lastSentMessage.length > 30 ? `${lastSentMessage.slice(0, 30)}…` : lastSentMessage}
          </p>
        ) : null}
        {lastIndex !== null ? <p className="text-slate-400 dark:text-slate-500">当前条目索引：#{lastIndex + 1}</p> : null}
        {sentCount > 0 ? <p className="text-slate-400 dark:text-slate-500">累计发送：{sentCount} 条</p> : null}
        {stopReason ? <p className="text-slate-400 dark:text-slate-500">停止原因：{stopReason}</p> : null}
        {error ? <p className="text-rose-500 dark:text-rose-400">错误：{error}</p> : null}
      </div>
    </FloatingPanel>
  );
}
