import type { ReactNode } from "react";

interface BottomActivityBarProps {
  icon: ReactNode;
  username?: string;
  content: string;
  tone?: "like" | "entry" | "neutral";
}

const toneClasses: Record<string, string> = {
  like: "text-pink-500/80 dark:text-pink-400/80",
  entry: "text-slate-500 dark:text-slate-400",
  neutral: "text-slate-400 dark:text-slate-500",
};

const usernameClasses: Record<string, string> = {
  like: "text-pink-600 dark:text-pink-300",
  entry: "text-pink-600 dark:text-pink-300",
  neutral: "text-slate-500 dark:text-slate-400",
};

const iconClasses: Record<string, string> = {
  like: "text-pink-400",
  entry: "text-slate-400",
  neutral: "text-slate-400",
};

export function BottomActivityBar({
  icon,
  username,
  content,
  tone = "neutral",
}: BottomActivityBarProps) {
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 bg-white px-5 py-1.5 text-xs ${toneClasses[tone]} dark:bg-[#12141e]`}
    >
      <span className={`shrink-0 ${iconClasses[tone]}`}>{icon}</span>
      {username && (
        <span className={`shrink-0 max-w-[120px] truncate font-medium ${usernameClasses[tone]}`}>
          {username}
        </span>
      )}
      <span className="min-w-0 truncate">{content}</span>
    </div>
  );
}
