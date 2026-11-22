import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  PanelButton,
  PanelEmpty,
  PanelIconButton,
  PanelInput,
  PanelListRow,
  PanelTabs,
} from "@/components/ui/DanmakuPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useSettingsStore } from "@/stores/settings-store";

interface FilterPanelProps {
  onClose: () => void;
}

type FilterTab = "keywords" | "users";

export function FilterPanel({ onClose }: FilterPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
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
    <FloatingPanel title={translate("filters.title")} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <PanelTabs
          className="min-w-0 flex-1"
          items={[
            { value: "keywords" as const, label: translate("filters.keywords") },
            { value: "users" as const, label: translate("filters.users") },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel={translate("filters.types")}
        />
        {hasAnyItems && (
          <PanelIconButton label={translate("filters.clear")} onClick={handleClearAll}>
            <Trash2 className="h-3.5 w-3.5" />
          </PanelIconButton>
        )}
      </div>

      {activeTab === "keywords" ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <PanelInput
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddKeyword(); }}
              placeholder={translate("filters.placeholder")}
              className="flex-1"
            />
            <PanelButton
              variant="primary"
              onClick={handleAddKeyword}
              disabled={!keywordInput.trim()}
              aria-label={translate("filters.add")}
              className="w-8 shrink-0 px-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </PanelButton>
          </div>
          {blockedKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {blockedKeywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-0.5 text-xs text-brand"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(kw)}
                    aria-label={translate("filters.removeKeyword", { value: kw })}
                    className="inline-flex h-3.5 w-3.5 items-center justify-center text-brand/70 transition hover:text-brand"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <PanelEmpty>{translate("filters.noKeywords")}</PanelEmpty>
          )}
        </div>
      ) : blockedUsers.length > 0 ? (
        <div className="panel-list">
          {blockedUsers.map((user) => (
            <PanelListRow
              key={user.uid}
              label={user.username}
              description={String(user.uid)}
              right={
                <PanelIconButton label={translate("filters.removeUser", { value: user.username })} onClick={() => handleRemoveUser(user.uid)}>
                  <X className="h-3 w-3" />
                </PanelIconButton>
              }
            />
          ))}
        </div>
      ) : (
        <PanelEmpty>{translate("filters.noUsers")}</PanelEmpty>
      )}
    </FloatingPanel>
  );
}
