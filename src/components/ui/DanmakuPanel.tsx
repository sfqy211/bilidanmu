import { useTranslation as useDesktopTranslation } from "@/i18n";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import "./danmaku-panel.css";

export type PanelVariant = "sheet" | "menu" | "embedded";

interface PanelShellProps {
  /** 面板标题；不传或 hideHeader 时不渲染 header。 */
  title?: string;
  /** header 右侧、关闭按钮之前的自定义内容。 */
  extra?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  variant?: PanelVariant;
  className?: string;
  bodyClassName?: string;
  /** sheet 的最大高度，默认 50vh。 */
  maxHeight?: string;
  hideHeader?: boolean;
  ariaLabel?: string;
}

/**
 * 弹幕窗公共面板外壳。
 * - sheet：直播/视频弹幕窗的整宽底部浮层
 * - menu：房间切换、账号切换等锚定小浮层
 * - embedded：面板内部的二级区块（无背景/边框）
 */
export function PanelShell({
  title,
  extra,
  onClose,
  footer,
  children,
  variant = "sheet",
  className,
  bodyClassName,
  maxHeight,
  hideHeader = false,
  ariaLabel,
}: PanelShellProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const showHeader = !hideHeader && Boolean(title);
  return (
    <section
      className={cn("panel-shell", className)}
      data-variant={variant}
      data-interactive=""
      role={variant === "menu" ? "menu" : "dialog"}
      aria-label={ariaLabel ?? title}
      style={maxHeight ? ({ "--panel-max-h": maxHeight } as CSSProperties) : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {showHeader && (
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          <div className="panel-actions">
            {extra}
            {onClose && (
              <PanelIconButton label={translate("panel.close")} onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </PanelIconButton>
            )}
          </div>
        </header>
      )}
      <div className={cn("panel-body", bodyClassName)}>{children}</div>
      {footer && <footer className="panel-footer">{footer}</footer>}
    </section>
  );
}

export interface PanelTabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
  title?: string;
}

interface PanelTabsProps<T extends string> {
  items: readonly PanelTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** false 时按内容宽度排列，不平均分配。 */
  equal?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function PanelTabs<T extends string>({
  items,
  value,
  onChange,
  equal = true,
  ariaLabel,
  className,
}: PanelTabsProps<T>) {
  return (
    <div
      className={cn("panel-tabs", className)}
      data-equal={equal ? "true" : "false"}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          data-active={value === item.value ? "true" : "false"}
          disabled={item.disabled}
          title={item.title}
          className="panel-tab"
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {typeof item.count === "number" && <span className="panel-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** 设置面板里的内联分段选择：与 PanelTabs 同视觉，但语义是 aria-pressed。 */
export function PanelSegmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: PanelTabsProps<T>) {
  return (
    <div className={cn("panel-tabs", className)} data-equal="false" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          data-active={value === item.value ? "true" : "false"}
          disabled={item.disabled}
          title={item.title}
          className="panel-tab"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface PanelListRowProps {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  align?: "center" | "start";
  onClick?: () => void;
  className?: string;
  title?: string;
}

export function PanelListRow({
  label,
  description,
  icon,
  right,
  selected = false,
  disabled = false,
  align = "center",
  onClick,
  className,
  title,
}: PanelListRowProps) {
  const content = (
    <>
      {icon && <span className="panel-list-row-icon">{icon}</span>}
      <span className="panel-list-row-main">
        <span className="panel-list-row-title">{label}</span>
        {description && <span className="panel-list-row-desc">{description}</span>}
      </span>
      {right && <span className="panel-list-row-right">{right}</span>}
    </>
  );
  const rowClassName = cn("panel-list-row", className);
  const selectedAttr = selected ? "true" : "false";
  const disabledAttr = disabled ? "true" : "false";
  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={title}
        className={rowClassName}
        data-selected={selectedAttr}
        data-disabled={disabledAttr}
        data-align={align}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      title={title}
      className={rowClassName}
      data-selected={selectedAttr}
      data-disabled={disabledAttr}
      data-align={align}
    >
      {content}
    </div>
  );
}

export function PanelInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("panel-input", className)} {...props} />;
}

export function PanelTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("panel-textarea", className)} {...props} />;
}

interface PanelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "stop";
}

export function PanelButton({ variant = "ghost", className, ...props }: PanelButtonProps) {
  return <button type="button" className={cn("panel-btn", `panel-btn-${variant}`, className)} {...props} />;
}

interface PanelIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export function PanelIconButton({ label, active = false, className, ...props }: PanelIconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-active={active ? "true" : "false"}
      className={cn("panel-icon-btn", className)}
      {...props}
    />
  );
}

export function PanelSection({
  title,
  description,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel-section", className)}>
      {title && <h3 className="panel-section-title">{title}</h3>}
      {description && <p className="panel-section-desc">{description}</p>}
      <div className="panel-section-body">{children}</div>
    </section>
  );
}

export function PanelRow({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel-row", className)}>
      <div className="panel-row-main">
        <div className="panel-row-label">{label}</div>
        {hint && <div className="panel-row-hint">{hint}</div>}
      </div>
      {children && <div className="panel-row-control">{children}</div>}
    </div>
  );
}

export function PanelField({
  label,
  value,
  children,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel-field", className)}>
      <div className="panel-field-head">
        <span className="panel-row-label">{label}</span>
        {value !== undefined && <span className="panel-field-value">{value}</span>}
      </div>
      <div className="panel-field-body">{children}</div>
    </div>
  );
}

export function PanelCheck({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="panel-check">
      <span className="panel-row-main">
        <span className="panel-row-label">{label}</span>
        {description && <span className="panel-row-hint">{description}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[rgb(var(--brand-rgb))]"
      />
    </label>
  );
}

export function PanelChip({
  selected,
  onClick,
  disabled,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-active={selected ? "true" : "false"}
      className="panel-chip"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="panel-empty">{children}</p>;
}export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="panel-note">{children}</p>;
}

export function PanelError({ children }: { children: ReactNode }) {
  return <p className="panel-error" role="alert">{children}</p>;
}
