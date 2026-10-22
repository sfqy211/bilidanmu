import { Eye } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { useAuthStore } from "@/stores/auth-store";

export function AppLayout() {
  const { pathname } = useLocation();
  const isListening = pathname.startsWith("/listen");
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  return (
    <WorkspaceLayout sidebar={<AppSidebar />} notice={!isListening && isAnonymous && (
      <p className="workspace-notice flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>匿名模式：仅可接收弹幕和音频流，无法发送弹幕、点赞或使用表情。</span>
      </p>
    )} />
  );
}
