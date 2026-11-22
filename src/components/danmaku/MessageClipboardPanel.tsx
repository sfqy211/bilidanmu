import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { Plus, Send, Settings2, X } from "lucide-react";
import {
  PanelButton,
  PanelEmpty,
  PanelIconButton,
  PanelInput,
  PanelTextarea,
} from "@/components/ui/DanmakuPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { tauriCommands } from "@/lib/tauri";
import type { MessageTemplate } from "@/types/bilibili";

interface MessageClipboardPanelProps {
  onClose: () => void;
  onLoad: (content: string) => void;
}

export function MessageClipboardPanel({ onClose, onLoad }: MessageClipboardPanelProps) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadTemplates = useCallback(() => {
    tauriCommands.messageTemplate.list().then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleCreate = useCallback(async () => {
    if (!editTitle.trim() && !editContent.trim()) return;
    try {
      const title = editTitle.trim() || desktopI18n.t("desktop:quickMessages.untitled");
      await tauriCommands.messageTemplate.create(title, editContent.trim());
      setEditTitle(""); setEditContent(""); setIsCreating(false);
      loadTemplates();
    } catch (e) {
      console.error("创建模板失败:", e);
    }
  }, [editTitle, editContent, loadTemplates]);

  const handleUpdate = useCallback(async () => {
    if (editingId === null) return;
    try {
      const title = editTitle.trim() || desktopI18n.t("desktop:quickMessages.untitled");
      await tauriCommands.messageTemplate.update(editingId, title, editContent.trim());
      setEditingId(null); setEditTitle(""); setEditContent("");
      loadTemplates();
    } catch (e) {
      console.error("更新模板失败:", e);
    }
  }, [editingId, editTitle, editContent, loadTemplates]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await tauriCommands.messageTemplate.delete(id);
      if (editingId === id) { setEditingId(null); setEditTitle(""); setEditContent(""); }
      loadTemplates();
    } catch (e) {
      console.error("删除模板失败:", e);
    }
  }, [editingId, loadTemplates]);

  const startEdit = (tpl: MessageTemplate) => {
    setEditingId(tpl.id); setEditTitle(tpl.title); setEditContent(tpl.content); setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true); setEditingId(null); setEditTitle(""); setEditContent("");
  };

  const cancelEdit = () => {
    setEditingId(null); setIsCreating(false); setEditTitle(""); setEditContent("");
  };

  const isEditing = editingId !== null || isCreating;

  return (
    <FloatingPanel title={translate("quickMessages.title")} onClose={onClose}>
      <div className="space-y-3">
        {!isEditing && templates.map((tpl) => (
          <div key={tpl.id} className="panel-card">
            <div className="panel-card-head">
              <span className="panel-card-title">{tpl.title}</span>
              <div className="flex items-center gap-1">
                <PanelIconButton label={translate("quickMessages.fill")} onClick={() => onLoad(tpl.content)}>
                  <Send className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton label={translate("quickMessages.edit")} onClick={() => startEdit(tpl)}>
                  <Settings2 className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton label={translate("quickMessages.delete")} onClick={() => void handleDelete(tpl.id)}>
                  <X className="h-3.5 w-3.5" />
                </PanelIconButton>
              </div>
            </div>
            <p className="panel-card-text line-clamp-3">{tpl.content}</p>
          </div>
        ))}

        {templates.length === 0 && !isEditing && (
          <PanelEmpty>{translate("quickMessages.empty")}</PanelEmpty>
        )}

        {isEditing && (
          <div className="space-y-2">
            <PanelInput
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={translate("quickMessages.name")}
            />
            <PanelTextarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder={translate("quickMessages.body")}
              maxLength={40}
            />
            <div className="flex gap-2">
              <PanelButton
                variant="primary"
                onClick={() => void (editingId !== null ? handleUpdate() : handleCreate())}
                disabled={!editContent.trim()}
                className="flex-1"
              >
                {editingId !== null ? translate("quickMessages.save") : translate("quickMessages.add")}
              </PanelButton>
              <PanelButton onClick={cancelEdit}>{translate("quickMessages.cancel")}</PanelButton>
            </div>
          </div>
        )}

        {!isEditing && (
          <PanelButton onClick={startCreate} className="w-full">
            <Plus className="h-3 w-3" />
            {translate("quickMessages.addMessage")}
          </PanelButton>
        )}
      </div>
    </FloatingPanel>
  );
}
