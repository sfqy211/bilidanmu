import type { ReactNode } from "react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { InlineEmoticon } from "@/types/danmaku";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function InlineEmotText({
  content,
  emots,
}: {
  content: string;
  emots?: Record<string, InlineEmoticon>;
}) {
  if (!emots || Object.keys(emots).length === 0) {
    return <>{content}</>;
  }

  const keys = Object.keys(emots);
  if (keys.length === 0) {
    return <>{content}</>;
  }

  const pattern = new RegExp(
    [...keys].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"),
    "g"
  );

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(content.slice(lastIndex, index));
    }

    const token = match[0];
    const emot = emots[token];
    if (emot?.url) {
      parts.push(
        <ProxiedImage
          key={`${token}-${index}`}
          src={emot.url}
          alt={emot.emoji ?? token}
          title={emot.descript ?? token}
          className="mx-0.5 inline-block align-middle"
          style={{ width: emot.width ?? 20, height: emot.height ?? 20 }}
        />
      );
    } else {
      parts.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
}
