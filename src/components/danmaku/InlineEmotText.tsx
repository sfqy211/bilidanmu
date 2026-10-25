import type { ReactNode } from "react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { InlineEmoticon } from "@/types/danmaku";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildEmotPattern(emots: Record<string, InlineEmoticon>): RegExp {
  const keys = [...Object.keys(emots)].sort((a, b) => b.length - a.length);
  return new RegExp(keys.map(escapeRegExp).join("|"), "g");
}

/** 去除表情 token 后正文是否为空（"不显示"模式下用于整条隐藏纯表情弹幕） */
export function isEmoticonOnlyContent(
  content: string,
  emots?: Record<string, InlineEmoticon>
): boolean {
  if (!emots || Object.keys(emots).length === 0) {
    return false;
  }
  return content.replace(buildEmotPattern(emots), "").trim().length === 0;
}

export function InlineEmotText({
  content,
  emots,
  cachedEmotUrls,
  emoticonStyle = "image",
}: {
  content: string;
  emots?: Record<string, InlineEmoticon>;
  cachedEmotUrls?: Set<string>;
  emoticonStyle?: "hidden" | "text" | "image";
}) {
  if (!emots || Object.keys(emots).length === 0) {
    return <>{content}</>;
  }

  const pattern = buildEmotPattern(emots);

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(content.slice(lastIndex, index));
    }

    const token = match[0];
    const emot = emots[token];

    if (emoticonStyle === "hidden") {
      // 不显示：跳过表情 token
    } else if (emoticonStyle === "text" || !emot?.url) {
      // 文字模式：显示原始 token 文本
      parts.push(emot?.emoji ?? token);
    } else {
      // 图片模式（默认）
      const persistent = cachedEmotUrls?.has(emot.url) ?? false;
      parts.push(
        <ProxiedImage
          key={`${token}-${index}`}
          src={emot.url}
          alt={emot.emoji ?? token}
          title={emot.descript ?? token}
          persistent={persistent}
          className="mx-0.5 inline-block align-middle"
          style={{ width: emot.width ?? 20, height: emot.height ?? 20 }}
        />
      );
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
}
