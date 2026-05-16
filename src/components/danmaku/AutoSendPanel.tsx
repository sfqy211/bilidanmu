import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, Square, X } from "lucide-react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { AutoSendEntry } from "@/lib/tauri";
import type { EmoticonPackage } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

// ─── 共享类型 ───

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
  onClose?: () => void;
  className?: string;
}

type TabKey = "text" | "emotion" | "favorites";

// ─── 共享控件：间隔 + 时间限制 + 开始/停止 ───

function AutoSendControls({
  isRunning,
  entryCount,
  intervalSec,
  setIntervalSec,
  timeLimitSec,
  setTimeLimitSec,
  onStart,
  onStop,
}: {
  isRunning: boolean;
  entryCount: number;
  intervalSec: string;
  setIntervalSec: (v: string) => void;
  timeLimitSec: string;
  setTimeLimitSec: (v: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const intervalValid = Number.isFinite(Number(intervalSec)) && Number(intervalSec) >= 0.3;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-1.5">
        <label className="shrink-0 text-xs text-slate-500 dark:text-slate-400">间隔</label>
        <input
          value={intervalSec}
          onChange={(e) => setIntervalSec(e.target.value)}
          disabled={isRunning}
          inputMode="decimal"
          className="h-8 w-14 border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none disabled:opacity-60 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
        />
        <span className="text-xs text-slate-400 dark:text-slate-500">秒</span>
      </div>
      <div className="flex flex-1 items-center gap-1.5">
        <label className="shrink-0 text-xs text-slate-500 dark:text-slate-400">限时</label>
        <input
          value={timeLimitSec}
          onChange={(e) => setTimeLimitSec(e.target.value)}
          disabled={isRunning}
          inputMode="numeric"
          placeholder="0"
          className="h-8 w-14 border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
        />
        <span className="text-xs text-slate-400 dark:text-slate-500">秒</span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={onStart}
          disabled={isRunning || entryCount === 0 || !intervalValid}
          title="开始发送"
          className="flex h-8 w-8 items-center justify-center bg-pink-500 text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          onClick={onStop}
          disabled={!isRunning}
          title="停止"
          className="flex h-8 w-8 items-center justify-center border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.04]"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── 文字 Tab 内容区 ───

function TextTabContent({
  isRunning,
  textFill,
  onTextFillConsumed,
  onEntriesChange,
}: {
  isRunning: boolean;
  textFill: string | null;
  onTextFillConsumed: () => void;
  onEntriesChange: (entries: AutoSendEntry[]) => void;
}) {
  const [messagesInput, setMessagesInput] = useState("");

  useEffect(() => {
    if (textFill) {
      setMessagesInput((prev) => (prev ? prev + "\n" + textFill : textFill));
      onTextFillConsumed();
    }
  }, [textFill, onTextFillConsumed]);

  const messages = useMemo(
    () => messagesInput.split("\n").map((s) => s.trim()).filter(Boolean),
    [messagesInput]
  );

  useEffect(() => {
    onEntriesChange(messages.map((msg) => ({ message: msg, dmType: 0, emoticonOptions: undefined })));
  }, [messages, onEntriesChange]);

  return (
    <div>
      <textarea
        value={messagesInput}
        onChange={(e) => setMessagesInput(e.target.value)}
        disabled={isRunning}
        placeholder={"每行一条循环弹幕\n第一条\n第二条\n第三条"}
        className="min-h-28 w-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
      />
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">共 {messages.length} 条</p>
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
      <div className="border border-slate-200 bg-slate-50 p-3 dark:border-white/[0.06] dark:bg-[#0e1018]">
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
                    <ProxiedImage src={emotUrl} alt={entry.message} className="h-7 w-7 object-contain" />
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
                  className={`shrink-0 border p-1 transition disabled:opacity-50 ${
                    active
                      ? "border-pink-300 bg-pink-50 dark:border-pink-500/40 dark:bg-pink-500/10"
                      : "border-slate-200 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                  }`}
                  title={pkg.pkgName || `包 ${pkg.pkgId}`}
                >
                  {preview ? (
                    <ProxiedImage src={preview.url} alt={pkg.pkgName} className="h-7 w-7 object-contain" />
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
                    className={`flex items-center justify-center border p-1.5 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                      selected
                        ? "border-pink-300 bg-pink-50 dark:border-pink-500/30 dark:bg-pink-500/10"
                        : "border-slate-200 hover:border-slate-300 dark:border-white/[0.06] dark:hover:border-white/[0.1]"
                    }`}
                  >
                    <ProxiedImage src={emot.url} alt={emot.descript ?? emot.emoji ?? ""} className="h-7 w-7 object-contain" />
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

// ─── 收藏夹 Tab 内容区 ───

interface FavoritesPanel {
  key: number;
  title: string;
  msg: string;
}

function FavoritesTabContent({
  isRunning,
  onEntriesChange,
  onFillText,
}: {
  isRunning: boolean;
  onEntriesChange: (entries: AutoSendEntry[]) => void;
  onFillText: (msg: string) => void;
}) {
  const [panels, setPanels] = useState<FavoritesPanel[]>([{ key: 1, title: "弹幕组 1", msg: "" }]);
  const [activeKey, setActiveKey] = useState(1);
  const [nextKey, setNextKey] = useState(2);

  const activePanel = panels.find((p) => p.key === activeKey) ?? panels[0];

  const allMessages = useMemo(() => {
    const result: string[] = [];
    for (const panel of panels) {
      const lines = panel.msg.split("\n").map((s) => s.trim()).filter(Boolean);
      result.push(...lines);
    }
    return result;
  }, [panels]);

  useEffect(() => {
    onEntriesChange(allMessages.map((msg) => ({ message: msg, dmType: 0, emoticonOptions: undefined })));
  }, [allMessages, onEntriesChange]);

  const addPanel = () => {
    if (isRunning) return;
    const key = nextKey;
    setNextKey((k) => k + 1);
    setPanels((prev) => [...prev, { key, title: `弹幕组 ${key}`, msg: "" }]);
    setActiveKey(key);
  };

  const removePanel = (key: number) => {
    if (isRunning) return;
    setPanels((prev) => {
      const next = prev.filter((p) => p.key !== key);
      if (next.length === 0) {
        const newKey = nextKey;
        setNextKey((k) => k + 1);
        return [{ key: newKey, title: `弹幕组 ${newKey}`, msg: "" }];
      }
      return next;
    });
    if (activeKey === key) {
      setActiveKey(panels.find((p) => p.key !== key)?.key ?? panels[0]?.key ?? 1);
    }
  };

  const updatePanel = (key: number, field: "title" | "msg", value: string) => {
    setPanels((prev) => prev.map((p) => (p.key === key ? { ...p, [field]: value } : p)));
  };

  const handleFillText = useCallback(() => {
    if (!activePanel?.msg.trim()) return;
    onFillText(activePanel.msg);
  }, [activePanel, onFillText]);

  return (
    <div className="space-y-3">
      {/* 弹幕组标签 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {panels.map((panel) => (
          <button
            key={panel.key}
            onClick={() => setActiveKey(panel.key)}
            className={`group relative shrink-0 border px-2.5 py-1 text-xs transition ${
              activeKey === panel.key
                ? "border-pink-300 bg-pink-50 text-pink-600 dark:border-pink-500/40 dark:bg-pink-500/10 dark:text-pink-300"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.04]"
            }`}
          >
            {panel.title || `弹幕组 ${panel.key}`}
            {panels.length > 1 && !isRunning ? (
              <span
                onClick={(e) => { e.stopPropagation(); removePanel(panel.key); }}
                className="ml-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
        <button
          onClick={addPanel}
          disabled={isRunning}
          className="shrink-0 border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-500 disabled:opacity-50 dark:border-white/[0.06] dark:text-slate-500 dark:hover:border-white/[0.1]"
        >
          <Plus className="inline h-3 w-3" /> 新增
        </button>
      </div>

      {/* 当前弹幕组内容 */}
      {activePanel ? (
        <div className="space-y-2">
          <input
            value={activePanel.title}
            onChange={(e) => updatePanel(activePanel.key, "title", e.target.value)}
            disabled={isRunning}
            placeholder="弹幕组标题"
            className="h-9 w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
          />
          <textarea
            value={activePanel.msg}
            onChange={(e) => updatePanel(activePanel.key, "msg", e.target.value)}
            disabled={isRunning}
            placeholder={"每行一条弹幕\n弹幕组内的弹幕会合并到循环列表中"}
            className="min-h-20 w-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          onClick={handleFillText}
          disabled={isRunning || !activePanel?.msg.trim()}
          className="border border-slate-300 px-3 py-2.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.04]"
          title="将当前弹幕组内容发送到文字 Tab"
        >
          发送到文字
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500">所有弹幕组内容合并循环 · 共 {allMessages.length} 条</p>
      </div>
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
    onClose,
    className,
  } = props;

  const [activeTab, setActiveTab] = useState<TabKey>("text");
  const [textFill, setTextFill] = useState<string | null>(null);

  // 全局统一的间隔/时间限制配置
  const [intervalSec, setIntervalSec] = useState("2");
  const [timeLimitSec, setTimeLimitSec] = useState("0");

  // 当前 Tab 的 entries（由各 Tab 内容区通过 onEntriesChange 回调上报）
  const [currentEntries, setCurrentEntries] = useState<AutoSendEntry[]>([]);
  const onEntriesChange = useCallback((entries: AutoSendEntry[]) => {
    setCurrentEntries(entries);
  }, []);

  // 收藏夹 → 文字 Tab 填充
  const handleFillText = useCallback((msg: string) => {
    setTextFill(msg);
    setActiveTab("text");
  }, []);

  const handleTextFillConsumed = useCallback(() => {
    setTextFill(null);
  }, []);

  // 统一的开始/停止
  const handleStart = useCallback(() => {
    const sec = Number(intervalSec);
    if (!Number.isFinite(sec) || sec < 0.3 || currentEntries.length === 0) return;
    const limit = Number(timeLimitSec);
    void onStart(currentEntries, Math.round(sec * 1000), limit > 0 ? limit : undefined);
  }, [intervalSec, timeLimitSec, currentEntries, onStart]);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "text", label: "文字" },
    { key: "emotion", label: "表情" },
    { key: "favorites", label: "收藏夹" },
  ];

  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      className={`${className ?? ""} border border-slate-300 bg-white p-3 dark:border-white/[0.06] dark:bg-[#12141e]`}
    >
      {/* 标题栏 */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">自动发送</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">按固定间隔循环发送弹幕或表情。</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 text-xs ${
              isRunning
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {isRunning ? "运行中" : "未运行"}
          </span>
          {onClose ? (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
              title="关闭"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="mb-3 flex gap-1 border-b border-slate-200 dark:border-white/[0.06]">
        {tabs.map((tab) => (
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

      {/* Tab 内容区（只负责内容选择，不含控件） */}
      {activeTab === "text" ? (
        <TextTabContent isRunning={isRunning} textFill={textFill} onTextFillConsumed={handleTextFillConsumed} onEntriesChange={onEntriesChange} />
      ) : activeTab === "emotion" ? (
        <EmotionTabContent isRunning={isRunning} emoticonPackages={emoticonPackages} onEntriesChange={onEntriesChange} />
      ) : (
        <FavoritesTabContent isRunning={isRunning} onEntriesChange={onEntriesChange} onFillText={handleFillText} />
      )}

      {/* 全局共享控件 */}
      <div className="mt-3">
        <AutoSendControls
          isRunning={isRunning}
          entryCount={currentEntries.length}
          intervalSec={intervalSec}
          setIntervalSec={setIntervalSec}
          timeLimitSec={timeLimitSec}
          setTimeLimitSec={setTimeLimitSec}
          onStart={handleStart}
          onStop={onStop}
        />
      </div>

      {/* 运行状态 */}
      <div className="mt-3 space-y-1 text-xs">
        {lastSentMessage ? (
          <p className="text-slate-500 dark:text-slate-400">
            最近发送：{lastSentMessage.length > 30 ? `${lastSentMessage.slice(0, 30)}…` : lastSentMessage}
          </p>
        ) : null}
        {lastIndex !== null ? <p className="text-slate-400 dark:text-slate-500">当前条目索引：#{lastIndex + 1}</p> : null}
        <p className="text-slate-400 dark:text-slate-500">累计发送：{sentCount} 条</p>
        {stopReason ? <p className="text-slate-400 dark:text-slate-500">停止原因：{stopReason}</p> : null}
        {error ? <p className="text-rose-500 dark:text-rose-400">错误：{error}</p> : null}
      </div>
    </div>
  );
}
