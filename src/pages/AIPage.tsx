import { Bot } from "lucide-react";

export function AIPage() {
  return (
    <section className="flex h-full select-none flex-col items-center justify-center gap-3">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f0f0f0] dark:bg-white/[0.06]">
        <Bot className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI 功能开发中</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          AI 接入正在开发中，敬请期待后续版本。
        </p>
      </div>
    </section>
  );
}
