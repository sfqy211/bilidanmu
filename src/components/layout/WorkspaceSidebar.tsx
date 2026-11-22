import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import "./WorkspaceSidebar.css";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  active?: boolean;
  disabled?: boolean;
}

export interface WorkspaceNavGroup {
  label?: string;
  items: WorkspaceNavItem[];
}

export function WorkspaceSidebar({ groups, utilityItems = [], label, collapsed, onToggleCollapsed }: {
  groups: WorkspaceNavGroup[]; utilityItems?: WorkspaceNavItem[]; label: string;
  collapsed: boolean; onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = t(collapsed ? "navigation.expand" : "navigation.collapse");
  const collapsedStyle = collapsed ? { justifyContent: "center", paddingInline: 0 } : undefined;
  const renderItem = ({ to, label: name, icon: Icon, end, active, disabled }: WorkspaceNavItem) => disabled ? (
    <span key={to} className="workspace-nav-item" aria-disabled="true" title={t("navigation.noAudio")} style={collapsedStyle}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />{!collapsed && <span className="workspace-nav-label">{name}</span>}
    </span>
  ) : (
    <NavLink key={to} to={to}
      end={end} title={name} aria-label={name} aria-current={active ? "page" : undefined}
      style={collapsedStyle}
      className={({ isActive }) => cn("workspace-nav-item", (active ?? isActive) && "workspace-nav-active")}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />{!collapsed && <span className="workspace-nav-label">{name}</span>}
    </NavLink>
  );

  return (
    <aside className="workspace-sidebar">
      <nav aria-label={label} className="workspace-navigation">
        {groups.map((group, index) => (
          <div key={group.label ?? `group-${index}`} className="workspace-nav-group">
            {group.label && !collapsed && <p className="workspace-nav-group-label">{group.label}</p>}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>
      <div className="workspace-sidebar-bottom">
        {utilityItems.length > 0 && (
          <nav aria-label={t("navigation.options")} className="workspace-navigation">
            {utilityItems.map(renderItem)}
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={toggleLabel}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              className="workspace-nav-item mt-1 w-full"
              style={collapsedStyle}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.7} />
              ) : (
                <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.7} />
              )}
              {!collapsed && <span className="workspace-nav-label">{t("navigation.collapseShort")}</span>}
            </button>
          </nav>
        )}
      </div>
    </aside>
  );
}
