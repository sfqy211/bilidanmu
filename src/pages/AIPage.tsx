import { PageHeader } from "@/components/layout/PageHeader";

export function AIPage() {
  return (
    <section className="flex h-full min-h-0 select-none flex-col">
      <PageHeader title="AI 接入" description="AI 服务与功能。" />
      <div className="border-t border-subtle py-6">
        <h3 className="text-[13px] font-medium text-ink">功能开发中</h3>
        <p className="mt-2 text-xs text-ink-muted">
          AI 接入正在开发中，敬请期待后续版本。
        </p>
      </div>
    </section>
  );
}
