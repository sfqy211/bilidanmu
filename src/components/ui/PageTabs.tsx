import * as Tabs from "@radix-ui/react-tabs";

interface TabItem {
  value: string;
  label: string;
}

export function PageTabs({
  tabs,
  activeTab,
  onTabChange,
  children
}: {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Root value={activeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
      <Tabs.List className="mb-4 flex gap-1 border-b border-slate-300 dark:border-white/[0.06]">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            className="relative px-4 py-2.5 text-sm text-slate-500 transition hover:text-slate-700 data-[state=active]:text-slate-900 data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-pink-500 dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:text-white"
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

export function TabContent({
  value,
  className,
  children
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Content
      value={value}
      className="min-h-0 flex-1 data-[state=inactive]:hidden"
    >
      <div className={className}>{children}</div>
    </Tabs.Content>
  );
}
