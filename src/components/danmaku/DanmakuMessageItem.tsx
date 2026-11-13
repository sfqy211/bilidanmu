import { memo, useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DanmakuMessageItem as SharedDanmakuMessageItem,
  type DanmakuMessageItemProps,
} from "@danmaku-core/ui";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { useDanmakuStore } from "@/stores/danmaku-store";
import { useSettingsStore } from "@/stores/settings-store";

function blockUser(uid: number, username: string) {
  const { patchSettings, settings } = useSettingsStore.getState();
  const currentFilter = settings.filter;
  if (currentFilter.blockedUsers.some((user) => user.uid === uid)) return;

  const blockedUsers = [...currentFilter.blockedUsers, { uid, username }];
  patchSettings({ filter: { ...currentFilter, blockedUsers } });
  useDanmakuStore.getState().setBlockFilter(blockedUsers, currentFilter.blockedKeywords);
  void useSettingsStore.getState().saveSettings();
}

type ClientMessageProps = Pick<
  DanmakuMessageItemProps,
  "item" | "fontSize" | "cachedEmotUrls" | "onMention"
>;

export const DanmakuMessageItem = memo(function DanmakuMessageItem(props: ClientMessageProps) {
  const showMedal = useSettingsStore((state) => state.settings.appearance.showMedal);
  const hideGloryLevel = useSettingsStore((state) => state.settings.appearance.hideGloryLevel);
  const hideFanMedal = useSettingsStore((state) => state.settings.appearance.hideFanMedal);
  const hideAdminBadge = useSettingsStore((state) => state.settings.appearance.hideAdminBadge);
  const hideUserIdColor = useSettingsStore((state) => state.settings.appearance.hideUserIdColor);
  const hideUsername = useSettingsStore((state) => state.settings.appearance.hideUsername);
  const hideContributionRank = useSettingsStore((state) => state.settings.appearance.hideContributionRank);
  const hideBubbleColor = useSettingsStore((state) => state.settings.appearance.hideBubbleColor);
  const emoticonStyle = useSettingsStore((state) => state.settings.appearance.emoticonStyle);
  const plainPriceMessages = useSettingsStore((state) => state.settings.appearance.plainPriceMessages);
  const priceColors = useSettingsStore((state) => state.settings.appearance.priceColors);
  const appearance = useMemo(() => ({
    showMedal, hideGloryLevel, hideFanMedal, hideAdminBadge, hideUserIdColor,
    hideUsername, hideContributionRank, hideBubbleColor, emoticonStyle,
    plainPriceMessages, priceColors,
  }), [
    showMedal, hideGloryLevel, hideFanMedal, hideAdminBadge, hideUserIdColor,
    hideUsername, hideContributionRank, hideBubbleColor, emoticonStyle,
    plainPriceMessages, priceColors,
  ]);

  return (
    <SharedDanmakuMessageItem
      {...props}
      appearance={appearance}
      imageComponent={ProxiedImage}
      onBlockUser={blockUser}
      onOpenUrl={openUrl}
    />
  );
});
