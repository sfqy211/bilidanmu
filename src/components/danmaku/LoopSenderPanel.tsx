export function LoopSenderPanel({
  loopRunning,
  loopMessages,
  loopMessagesInput,
  loopIntervalSec,
  lastLoopMessage,
  lastLoopIndex,
  loopSentCount,
  stopReason,
  loopError,
  onLoopMessagesInputChange,
  onLoopIntervalSecChange,
  onStartLoop,
  onStopLoop,
}: {
  loopRunning: boolean;
  loopMessages: string[];
  loopMessagesInput: string;
  loopIntervalSec: string;
  lastLoopMessage: string | null;
  lastLoopIndex: number | null;
  loopSentCount: number;
  stopReason: string | null;
  loopError: string | null;
  onLoopMessagesInputChange: (value: string) => void;
  onLoopIntervalSecChange: (value: string) => void;
  onStartLoop: () => void;
  onStopLoop: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-white">独轮车（最小版）</h3>
          <p className="mt-1 text-xs text-slate-400">每行一条弹幕，按固定间隔循环发送。</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            loopRunning ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
          }`}
        >
          {loopRunning ? "运行中" : "未运行"}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_160px_auto]">
        <textarea
          value={loopMessagesInput}
          onChange={(event) => onLoopMessagesInputChange(event.target.value)}
          placeholder={"每行一条循环弹幕\n第一条\n第二条\n第三条"}
          className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />
        <div>
          <label className="mb-2 block text-sm text-slate-400">发送间隔（秒）</label>
          <input
            value={loopIntervalSec}
            onChange={(event) => onLoopIntervalSecChange(event.target.value)}
            inputMode="decimal"
            className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
          />
          <p className="mt-2 text-xs text-slate-500">最小 0.3 秒，当前共 {loopMessages.length} 条</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onStartLoop}
            disabled={!loopMessagesInput.trim() || loopRunning || loopMessages.length === 0 || Number(loopIntervalSec) < 0.3}
            className="rounded-xl bg-pink-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            开始循环
          </button>
          <button
            onClick={onStopLoop}
            disabled={!loopRunning}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            停止循环
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {lastLoopMessage ? <p className="text-slate-400">最近发送：{lastLoopMessage}</p> : null}
        {lastLoopIndex !== null ? <p className="text-slate-500">当前条目索引：#{lastLoopIndex + 1}</p> : null}
        <p className="text-slate-500">累计循环发送：{loopSentCount} 条</p>
        {stopReason ? <p className="text-slate-500">停止原因：{stopReason}</p> : null}
        {loopError ? <p className="text-rose-400">循环发送错误：{loopError}</p> : null}
      </div>
    </div>
  );
}
