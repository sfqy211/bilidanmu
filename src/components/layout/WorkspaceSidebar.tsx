import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { getAppVersion } from "@/lib/constants";
import { cn } from "@/lib/utils";

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

export function WorkspaceSidebar({ groups, utilityItems = [], label, status }: {
  groups: WorkspaceNavGroup[]; utilityItems?: WorkspaceNavItem[]; label: string; status?: string;
}) {
  const [version, setVersion] = useState("");
  useEffect(() => { getAppVersion().then(setVersion).catch(() => {}); }, []);

  const renderItem = ({ to, label: name, icon: Icon, end, active, disabled }: WorkspaceNavItem) => disabled ? (
    <span key={to} className="workspace-nav-item" aria-disabled="true" title="暂无播放中的音频">
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} /><span className="workspace-nav-label">{name}</span>
    </span>
  ) : (
    <NavLink key={to} to={to}
      end={end} title={name} aria-label={name} aria-current={active ? "page" : undefined}
      className={({ isActive }) => cn("workspace-nav-item", (active ?? isActive) && "workspace-nav-active")}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} /><span className="workspace-nav-label">{name}</span>
    </NavLink>
  );

  return (
    <aside className="workspace-sidebar">
      <nav aria-label={label} className="workspace-navigation">
        {groups.map((group, index) => (
          <div key={group.label ?? `group-${index}`} className="workspace-nav-group">
            {group.label && <p className="workspace-nav-group-label">{group.label}</p>}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>
      <div className="workspace-sidebar-bottom">
        {utilityItems.length > 0 && <nav aria-label="应用选项" className="workspace-navigation">{utilityItems.map(renderItem)}</nav>}
        <div className="workspace-sidebar-meta">
          {status && <span className="truncate" title={status}>{status}</span>}
          {version && <span className="numeric" title={`BiliDanmu ${version}`}>{version}</span>}
        </div>
      </div>
    </aside>
  );
}
