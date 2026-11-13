import {
  InlineEmotText as SharedInlineEmotText,
  type InlineEmotTextProps,
} from "@danmaku-core/ui";
import { ProxiedImage } from "@/components/ui/ProxiedImage";

export { isEmoticonOnlyContent } from "@danmaku-core/ui";

export function InlineEmotText(props: InlineEmotTextProps) {
  return <SharedInlineEmotText imageComponent={ProxiedImage} {...props} />;
}
