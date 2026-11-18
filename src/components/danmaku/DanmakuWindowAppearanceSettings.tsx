import type { ReactNode } from "react";
import { toast } from "sonner";
import { PanelRow } from "@/components/ui/DanmakuPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings-store";
import type { Settings } from "@/types/bilibili";

function commitAppearance(patch: Partial<Settings["appearance"]>) {
  const { settings, patchSettings, saveSettings } = useSettingsStore.getState();
  patchSettings({ appearance: { ...settings.appearance, ...patch } });
  void saveSettings().catch((reason) =>
    toast.error(`保存外观设置失败。${String(reason)}`),
  );
}

function AppearanceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <PanelRow label={label}>
      <div className="danmaku-window-select">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger aria-label={label} />
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </PanelRow>
  );
}

function DanmakuWindowThemeSettings() {
  const appearance = useSettingsStore((state) => state.settings.appearance);
  return (
    <AppearanceSelect
      label="主题"
      value={appearance.autoThemeFromBackground ? "background" : appearance.theme}
      onChange={(theme) =>
        commitAppearance(
          theme === "background"
            ? { autoThemeFromBackground: true }
            : {
                theme: theme as Settings["appearance"]["theme"],
                autoThemeFromBackground: false,
              },
        )
      }
      options={[
        { value: "dark", label: "深色" },
        { value: "light", label: "浅色" },
        { value: "background", label: "跟随背景" },
        { value: "system", label: "跟随系统" },
      ]}
    />
  );
}

/** 弹幕窗/视频窗共用的精简外观设置：主题只在这里切换，其余外观项归主设置页。 */
export function DanmakuWindowAppearanceSettings({ children }: { children?: ReactNode }) {
  return (
    <div className="danmaku-window-appearance">
      <DanmakuWindowThemeSettings />
      {children}
    </div>
  );
}
