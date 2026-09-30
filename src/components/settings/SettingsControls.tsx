import { useId, type ReactNode } from "react";
import type { Settings } from "@/types/bilibili";

export interface SettingsPanelProps {
  settings: Settings;
  patchSettings: (patch: Partial<Settings>) => void;
}

export function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="settings-group" aria-labelledby={id}>
      <header className="mb-2">
        <h3 id={id} className="text-[13px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </header>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

export function SettingsRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function SettingsToggle({ title, description, checked, onChange, disabled = false }: {
  title: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[13px] text-ink">{title}</label>
        {description && <p id={`${id}-description`} className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-label={title} aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled} onClick={() => onChange(!checked)} className="settings-switch">
        <span />
      </button>
    </div>
  );
}

export function SettingsChoice({ title, description, value, onChange, options, disabled = false, placeholder }: {
  title: string; description?: string; value: string; onChange: (value: string) => void;
  options: readonly { value: string; label: string }[]; disabled?: boolean; placeholder?: string;
}) {
  return (
    <SettingsRow title={title} description={description}>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={title} className="settings-select w-full">
        {!options.length && <option value={value}>{placeholder || "暂无选项"}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </SettingsRow>
  );
}

export function SettingsRange({ title, description, value, min, max, step = 1, unit, onChange, disabled = false }: {
  title: string; description?: string; value: number; min: number; max: number; step?: number;
  unit: string; onChange: (value: number) => void; disabled?: boolean;
}) {
  return (
    <SettingsRow title={title} description={description}>
      <div className="flex items-center gap-3">
        <input type="range" aria-label={title} min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(event) => onChange(event.target.valueAsNumber)} className="settings-range min-w-0 flex-1" />
        <span className="numeric min-w-12 text-right text-xs text-ink-muted">{value}{unit}</span>
      </div>
    </SettingsRow>
  );
}
