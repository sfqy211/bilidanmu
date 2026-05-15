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
  onClose,
  className,
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
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      className={`${className ?? ""} border border-slate-300 bg-white p-3 dark:border-white/[0.06] dark:bg-[#12141e]`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">独轮车（最小版）</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">每行一条弹幕，按固定间隔循环发送。</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 text-xs ${
              loopRunning ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {loopRunning ? "运行中" : "未运行"}
          </span>
          {onClose ? (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
              title="关闭"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_140px]">
        <textarea
          value={loopMessagesInput}
          onChange={(event) => onLoopMessagesInputChange(event.target.value)}
          placeholder={"每行一条循环弹幕\n第一条\n第二条\n第三条"}
          className="min-h-28 w-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white dark:placeholder:text-slate-500"
        />
        <div>
          <label className="mb-2 block text-sm text-slate-500 dark:text-slate-400">发送间隔（秒）</label>
          <input
            value={loopIntervalSec}
            onChange={(event) => onLoopIntervalSecChange(event.target.value)}
            inputMode="decimal"
            className="h-12 w-full border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-white"
          />
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">最小 0.3 秒，当前共 {loopMessages.length} 条</p>
        </div>
        <div className="flex gap-2 lg:col-span-2">
          <button
            onClick={onStartLoop}
            disabled={!loopMessagesInput.trim() || loopRunning || loopMessages.length === 0 || Number(loopIntervalSec) < 0.3}
            className="flex-1 bg-pink-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            开始循环
          </button>
          <button
            onClick={onStopLoop}
            disabled={!loopRunning}
            className="flex-1 border border-slate-300 px-4 py-3 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.04]"
          >
            停止循环
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {lastLoopMessage ? <p className="text-slate-500 dark:text-slate-400">最近发送：{lastLoopMessage}</p> : null}
        {lastLoopIndex !== null ? <p className="text-slate-400 dark:text-slate-500">当前条目索引：#{lastLoopIndex + 1}</p> : null}
        <p className="text-slate-400 dark:text-slate-500">累计循环发送：{loopSentCount} 条</p>
        {stopReason ? <p className="text-slate-400 dark:text-slate-500">停止原因：{stopReason}</p> : null}
        {loopError ? <p className="text-rose-500 dark:text-rose-400">循环发送错误：{loopError}</p> : null}
      </div>
    </div>
  );
}
