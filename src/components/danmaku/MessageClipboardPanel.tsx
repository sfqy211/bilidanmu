import { useCallback, useEffect, useState } from "react";
import { Plus, Send, Settings2, X } from "lucide-react";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { tauriCommands } from "@/lib/tauri";
import type { MessageTemplate } from "@/types/bilibili";

interface MessageClipboardPanelProps {
  onClose: () => void;
  onLoad: (content: string) => void;
}

export function MessageClipboardPanel({ onClose, onLoad }: MessageClipboardPanelProps) {
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
      const title = editTitle.trim() || "未命名模板";
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
      const title = editTitle.trim() || "未命名模板";
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
    <FloatingPanel title="快捷消息" onClose={onClose}>
      <div className="space-y-3">
        {/* 模板列表 */}
        {!isEditing && templates.map((tpl) => (
          <div key={tpl.id} className="rounded bg-white/10 p-3 dark:bg-white/[0.06]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{tpl.title}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => onLoad(tpl.content)} title="填入发送栏" className="p-1 text-slate-400 hover:text-pink-500 transition">
                  <Send className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => startEdit(tpl)} title="编辑" className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => void handleDelete(tpl.id)} title="删除" className="p-1 text-slate-400 hover:text-rose-500 transition">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap line-clamp-3">{tpl.content}</p>
          </div>
        ))}

        {templates.length === 0 && !isEditing && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">暂无快捷消息，点击下方添加</p>
        )}

        {/* 编辑/创建表单 */}
        {isEditing && (
          <div className="space-y-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="消息名称"
              className="h-9 w-full rounded bg-white/10 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-pink-500/30 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="消息内容（最多 40 字）"
              maxLength={40}
              className="min-h-24 w-full rounded bg-white/10 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-pink-500/30 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void (editingId !== null ? handleUpdate() : handleCreate())}
                disabled={!editContent.trim()}
                className="flex-1 rounded bg-pink-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editingId !== null ? "保存" : "添加"}
              </button>
              <button
                onClick={cancelEdit}
                className="rounded bg-white/10 px-3 py-1.5 text-xs text-slate-500 transition hover:bg-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.04]"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 底部操作 */}
        {!isEditing && (
          <button
            onClick={startCreate}
            className="w-full rounded bg-white/10 px-3 py-2 text-xs text-slate-500 transition hover:bg-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.04]"
          >
            <Plus className="inline h-3 w-3 mr-1" />
            添加消息
          </button>
        )}
      </div>
    </FloatingPanel>
  );
}
