import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useSettingsStore } from "@/stores/settings-store";

interface FilterPanelProps {
  className?: string;
  onClose: () => void;
}

type FilterTab = "keywords" | "users";

export function FilterPanel({ className, onClose }: FilterPanelProps) {
  const settings = useSettingsStore((state) => state.settings);
  const patchSettings = useSettingsStore((state) => state.patchSettings);
  const { blockedUsers, blockedKeywords } = settings.filter;
  const [activeTab, setActiveTab] = useState<FilterTab>("keywords");
  const [keywordInput, setKeywordInput] = useState("");

  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (blockedKeywords.includes(kw)) {
      setKeywordInput("");
      return;
    }
    const newKeywords = [...blockedKeywords, kw];
    patchSettings({ filter: { ...settings.filter, blockedKeywords: newKeywords } });
    useDanmakuStore.getState().setBlockFilter(blockedUsers, newKeywords);
    void saveSettings();
    setKeywordInput("");
  };

  const handleRemoveKeyword = (kw: string) => {
    const newKeywords = blockedKeywords.filter((k) => k !== kw);
    patchSettings({ filter: { ...settings.filter, blockedKeywords: newKeywords } });
    useDanmakuStore.getState().setBlockFilter(blockedUsers, newKeywords);
    void saveSettings();
  };

  const handleRemoveUser = (uid: number) => {
    const newBlockedUsers = blockedUsers.filter((u) => u.uid !== uid);
    patchSettings({ filter: { ...settings.filter, blockedUsers: newBlockedUsers } });
    useDanmakuStore.getState().setBlockFilter(newBlockedUsers, blockedKeywords);
    void saveSettings();
  };

  const handleClearAll = () => {
    patchSettings({ filter: { blockedUsers: [], blockedKeywords: [] } });
    useDanmakuStore.getState().setBlockFilter([], []);
    void saveSettings();
  };

  const hasAnyItems = blockedKeywords.length > 0 || blockedUsers.length > 0;

  return (
    <div className={`danmaku-bg-panel flex max-h-80 w-72 flex-col rounded p-3 ${className ?? ""}`}>
        {/* 标题栏 */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">屏蔽管理</h3>
          <div className="flex items-center gap-1">
            {hasAnyItems && (
              <button
                type="button"
                onClick={handleClearAll}
                className="flex h-5 w-5 items-center justify-center text-slate-400 transition hover:text-rose-500 dark:hover:text-rose-400"
                title="一键清空"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-5 w-5 items-center justify-center text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Tab 栏 */}
        <div className="mb-2 flex rounded bg-[#f0f0f0] p-0.5 dark:bg-[#0e1018]">
          {([
            { key: "keywords" as const, label: "屏蔽关键词" },
            { key: "users" as const, label: "屏蔽用户" },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                activeTab === tab.key
                  ? "bg-white text-slate-700 shadow-sm dark:bg-[#1a1c24] dark:text-slate-200"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "keywords" ? (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddKeyword(); }}
                  placeholder="输入关键词"
                  className="h-8 flex-1 rounded border border-neutral-200 bg-[#f8f8f8] px-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-pink-500/30 dark:border-neutral-700 dark:bg-[#1a1c24] dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  disabled={!keywordInput.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-pink-500 text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {blockedKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {blockedKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-0.5 rounded bg-pink-500/10 px-1.5 py-0.5 text-xs text-pink-600 dark:bg-pink-500/20 dark:text-pink-300"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center text-pink-400 transition hover:text-pink-600 dark:hover:text-pink-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">暂无屏蔽关键词</p>
              )}
            </div>
          ) : (
            <div>
              {blockedUsers.length > 0 ? (
                <div className="space-y-1">
                  {blockedUsers.map((user) => (
                    <div
                      key={user.uid}
                      className="flex items-center justify-between rounded bg-[#f0f0f0] px-2 py-1 dark:bg-[#0e1018]"
                    >
                      <span className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-300">
                        {user.username}
                        <span className="ml-1 shrink-0 text-slate-400 dark:text-slate-500">({user.uid})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(user.uid)}
                        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 transition hover:text-rose-500 dark:hover:text-rose-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  暂无屏蔽用户。在弹幕上右键选择「屏蔽此用户」即可添加。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
  );
}
