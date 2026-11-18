import type { ReactNode } from "react";
import { PanelShell } from "@/components/ui/DanmakuPanel";

interface FloatingPanelProps {
  title: string;
  onClose: () => void;
  className?: string;
  extra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** 直播弹幕窗的整宽底部面板：实际外壳由公共 PanelShell 提供。 */
export function FloatingPanel({ title, onClose, className, extra, footer, children }: FloatingPanelProps) {
  return (
    <PanelShell
      title={title}
      variant="sheet"
      onClose={onClose}
      extra={extra}
      footer={footer}
      className={className}
    >
      {children}
    </PanelShell>
  );
}
