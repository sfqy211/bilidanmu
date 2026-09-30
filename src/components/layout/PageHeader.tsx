import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, leading }: {
  title: string; description?: ReactNode; actions?: ReactNode; leading?: ReactNode;
}) {
  return (
    <header className="workspace-page-header app-rise">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h2>
          {description && <div className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</div>}
        </div>
      </div>
      {actions && <div className="workspace-page-actions">{actions}</div>}
    </header>
  );
}
