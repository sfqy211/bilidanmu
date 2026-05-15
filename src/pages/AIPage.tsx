import { useEffect, useState } from "react";
import { tauriCommands } from "@/lib/tauri";
import { useAIStore } from "@/stores/ai-store";
import type { AIModelInput } from "@/types/bilibili";

const emptyInput: AIModelInput = {
  endpoint: "https://api.openai.com/v1",
  apiKey: "",
  modelName: "gpt-4o-mini",
  notes: ""
};

export function AIPage() {
  const models = useAIStore((state) => state.models);
  const currentModelId = useAIStore((state) => state.currentModelId);
  const setModels = useAIStore((state) => state.setModels);
  const setCurrentModelId = useAIStore((state) => state.setCurrentModelId);
  const [form, setForm] = useState<AIModelInput>(emptyInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const canSaveModel = Boolean(form.endpoint && form.modelName && (editingModelId || form.apiKey));

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loaded = await tauriCommands.ai.getModels();
        if (!cancelled) {
          setModels(loaded);
          setCurrentModelId(loaded.find((item) => item.isCurrent)?.id ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载 AI 模型失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [setCurrentModelId, setModels]);

  const handleSaveModel = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const model = editingModelId
        ? await tauriCommands.ai.updateModel(editingModelId, form)
        : await tauriCommands.ai.addModel(form);

      const nextModels = editingModelId
        ? models.map((item) => (item.id === editingModelId ? model : item))
        : [...models.map((item) => ({ ...item, isCurrent: model.isCurrent ? false : item.isCurrent })), model];

      setModels(nextModels);
      if (model.isCurrent) {
        setCurrentModelId(model.id);
      }
      setEditingModelId(null);
      setForm(emptyInput);
      setSuccess(editingModelId ? "模型已更新" : "模型已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存模型失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setTestMessage(null);

    try {
      const result = await tauriCommands.ai.testConnection(form);
      setTestMessage(result.success ? `连接成功（${result.latencyMs ?? 0}ms）` : result.message ?? "连接失败");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "测试连接失败");
    } finally {
      setTesting(false);
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setError(null);

    try {
      const nextModels = await tauriCommands.ai.fetchModels(form.endpoint, form.apiKey);
      setAvailableModels(nextModels);
      if (nextModels.length > 0) {
        setForm((current) => ({ ...current, modelName: nextModels[0] }));
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "获取模型列表失败");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSetCurrent = async (id: string) => {
    setError(null);

    try {
      await tauriCommands.ai.setCurrentModel(id);
      setCurrentModelId(id);
      setModels(models.map((item) => ({ ...item, isCurrent: item.id === id })));
    } catch (setErrorObj) {
      setError(setErrorObj instanceof Error ? setErrorObj.message : "切换当前模型失败");
    }
  };

  const handleEditModel = (id: string) => {
    const model = models.find((item) => item.id === id);
    if (!model) {
      return;
    }

    setEditingModelId(id);
    setForm({
      endpoint: model.endpoint,
      apiKey: "",
      modelName: model.modelName,
      notes: model.notes ?? ""
    });
    setSuccess(null);
    setError(null);
  };

  const handleDeleteModel = async (id: string) => {
    setError(null);
    setSuccess(null);

    try {
      await tauriCommands.ai.deleteModel(id);
      const nextModels = models.filter((item) => item.id !== id);
      setModels(nextModels);
      const nextCurrent = nextModels.find((item) => item.isCurrent)?.id ?? null;
      setCurrentModelId(nextCurrent);
      if (editingModelId === id) {
        setEditingModelId(null);
        setForm(emptyInput);
      }
      setSuccess("模型已删除");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除模型失败");
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">AI 接入</h2>
        <p className="mt-1 text-sm text-slate-400">当前提供 OpenAI 兼容接口的最小配置、连通测试与模型切换。</p>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
      {testMessage ? <p className="text-sm text-cyan-300">{testMessage}</p> : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-medium">{editingModelId ? "编辑模型" : "添加模型"}</h3>
          {editingModelId ? (
            <button
              onClick={() => {
                setEditingModelId(null);
                setForm(emptyInput);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
            >
              取消编辑
            </button>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Endpoint
            <input
              value={form.endpoint}
              onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white outline-none"
            />
          </label>

          <label className="text-sm text-slate-300">
            API Key
            <input
              value={form.apiKey}
              onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white outline-none"
            />
            {editingModelId ? (
              <p className="mt-2 text-xs text-slate-500">编辑时可留空，当前实现不会保存密钥到本地。</p>
            ) : null}
          </label>

          <label className="text-sm text-slate-300">
            模型名
            <input
              value={form.modelName}
              onChange={(event) => setForm((current) => ({ ...current, modelName: event.target.value }))}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white outline-none"
            />
          </label>

          <label className="text-sm text-slate-300">
            备注
            <input
              value={form.notes ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white outline-none"
            />
          </label>
        </div>

        {availableModels.length > 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
            <p className="mb-2 text-slate-400">可用模型</p>
            <div className="flex flex-wrap gap-2">
              {availableModels.map((model) => (
                <button
                  key={model}
                  onClick={() => setForm((current) => ({ ...current, modelName: model }))}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5"
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => void handleFetchModels()}
            disabled={fetchingModels || !form.endpoint || !form.apiKey}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fetchingModels ? "获取中..." : "获取模型列表"}
          </button>
          <button
            onClick={() => void handleTestConnection()}
            disabled={testing || !form.endpoint || !form.apiKey}
            className="rounded-xl border border-cyan-500/20 px-4 py-3 text-sm text-cyan-300 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testing ? "测试中..." : "测试连接"}
          </button>
          <button
            onClick={() => void handleSaveModel()}
            disabled={saving || !canSaveModel}
            className="rounded-xl bg-pink-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "保存中..." : editingModelId ? "更新模型" : "保存模型"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium">已保存模型</h3>
          <span className="text-sm text-slate-400">{loading ? "加载中..." : `${models.length} 个`}</span>
        </div>

        <div className="space-y-3">
          {models.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-sm text-slate-500">
              还没有保存任何模型配置。
            </div>
          ) : (
            models.map((model) => (
              <div key={model.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{model.modelName}</p>
                      {model.isCurrent || currentModelId === model.id ? (
                        <span className="rounded-full bg-pink-500/15 px-2 py-1 text-xs text-pink-200">当前模型</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{model.endpoint}</p>
                    {model.notes ? <p className="mt-1 text-xs text-slate-500">{model.notes}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleEditModel(model.id)}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => void handleSetCurrent(model.id)}
                      disabled={currentModelId === model.id}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      设为当前
                    </button>
                    <button
                      onClick={() => void handleDeleteModel(model.id)}
                      className="rounded-xl border border-rose-500/20 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
