import { useTranslation as useDesktopTranslation, i18n as desktopI18n } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, RefreshCw, Send, Wheat } from "lucide-react";
import { PanelButton, PanelEmpty, PanelNote, PanelTabs } from "@/components/ui/DanmakuPanel";
import { FloatingPanel } from "@/components/danmaku/FloatingPanel";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands, type BiliResponse, type SendGiftOptions } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import type { GiftBagItem, GiftConfig, WalletInfo } from "@/types/bilibili";

/** 金瓜子数量 → 人民币展示（1000 金瓜子 = 1 元），去掉多余的 0 */
function formatYuan(price: number): string {
  const yuan = (price / 1000).toFixed(3).replace(/\.?0+$/, "");
  return `¥${yuan}`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

type SelectedGift =
  | { kind: "panel"; gift: GiftConfig }
  | { kind: "bag"; item: GiftBagItem };

const COUNT_PRESETS = [1, 10, 100];

export function GiftPanel({
  roomId,
  ruid,
  onSend,
  onClose,
}: {
  roomId: number;
  /** 主播 uid；真实房间为 0 时视为未知（mock 房间 0 由后端拦截，不在此限制） */
  ruid: number;
  onSend: (giftId: number, giftNum: number, options?: SendGiftOptions) => Promise<BiliResponse>;
  onClose: () => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const [tab, setTab] = useState<"gifts" | "bag">("gifts");
  const [gifts, setGifts] = useState<GiftConfig[] | null>(null);
  const [bag, setBag] = useState<GiftBagItem[] | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SelectedGift | null>(null);
  const [count, setCount] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  // 礼物图标显隐（外观设置；旧库缺字段时兜底为显示）
  const showGiftIcons = useSettingsStore(
    (state) => state.settings.appearance.showGiftIcons ?? true
  );
  /** 图标隐藏时格子更矮，两行总高同步收缩 */
  const cellHeightClass = showGiftIcons ? "h-[80px]" : "h-[44px]";
  const gridMaxHeightClass = showGiftIcons ? "max-h-[161px]" : "max-h-[89px]";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // 背包读取失败不阻塞主列表（未登录等场景下礼物/余额仍可用）
    const [giftsResult, walletResult, bagResult] = await Promise.allSettled([
      tauriCommands.gift.getRoomGifts(roomId),
      tauriCommands.gift.getGiftWallet(roomId),
      tauriCommands.gift.getGiftBag(roomId),
    ]);
    if (giftsResult.status === "fulfilled") setGifts(giftsResult.value);
    if (walletResult.status === "fulfilled") setWallet(walletResult.value);
    setBag(bagResult.status === "fulfilled" ? bagResult.value : []);

    const failureReason =
      giftsResult.status === "rejected"
        ? giftsResult.reason
        : walletResult.status === "rejected"
          ? walletResult.reason
          : null;
    if (failureReason != null) {
      setError(extractErrorMessage(failureReason, desktopI18n.t("desktop:gifts.loadFailed")));
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 发送成功提示 3 秒后自动消失
  useEffect(() => {
    if (!successText) return;
    const timer = window.setTimeout(() => setSuccessText(null), 3000);
    return () => window.clearTimeout(timer);
  }, [successText]);

  const bagGiftNum = selected?.kind === "bag" ? selected.item.giftNum : 0;
  const effectiveCount = useMemo(() => {
    if (selected?.kind === "bag") return Math.min(count, Math.max(bagGiftNum, 1));
    return count;
  }, [selected, count, bagGiftNum]);

  const goldUnitPrice = selected?.kind === "panel" && selected.gift.coinType === "gold" ? selected.gift.price : 0;
  const silverUnitPrice =
    selected?.kind === "panel" && selected.gift.coinType === "silver" ? selected.gift.price : 0;
  const isGold = goldUnitPrice > 0;
  /** 真实房间拿不到主播 uid 时禁止送礼（mock 房间 0 由后端拦截，不受影响） */
  const sendBlocked = ruid === 0 && roomId !== 0;

  const selectedName =
    selected?.kind === "panel" ? selected.gift.name : selected?.item.giftName ?? "";

  const handleSelect = (next: SelectedGift) => {
    setSelected(next);
    setCount(1);
    setConfirming(false);
    setSendError(null);
  };

  const handleSend = useCallback(async () => {
    if (!selected || sending) return;
    setSending(true);
    setSendError(null);
    const name = selected.kind === "panel" ? selected.gift.name : selected.item.giftName;
    try {
      if (selected.kind === "bag") {
        await onSend(selected.item.giftId, effectiveCount, {
          bagId: selected.item.bagId,
          coinType: "silver",
          price: 0
        });
      } else {
        await onSend(selected.gift.id, effectiveCount, {
          bagId: 0,
          coinType: selected.gift.coinType,
          price: selected.gift.price
        });
      }
      setSuccessText(desktopI18n.t("desktop:gifts.sent", { value: name, value2: effectiveCount }));
      setSelected(null);
      setCount(1);
      setConfirming(false);
      // 乐观更新本地余额/背包：发送成功即权威凭证，前端按单价×数量直接扣减。
      // getInfoByUser/bag_list 有服务端缓存，发送后立即拉取会拿到旧值覆盖正确数，
      // 因此这里不做接口刷新，下次面板打开时重新拉取校正。
      if (selected.kind === "bag") {
        setBag(
          (prev) =>
            prev
              ?.map((it) =>
                it.bagId === selected.item.bagId
                  ? { ...it, giftNum: it.giftNum - effectiveCount }
                  : it
              )
              .filter((it) => it.giftNum > 0) ?? null
        );
      } else if (goldUnitPrice > 0) {
        setWallet((prev) =>
          prev
            ? { ...prev, gold: Math.max(prev.gold - goldUnitPrice * effectiveCount, 0) }
            : prev
        );
      } else if (silverUnitPrice > 0) {
        setWallet((prev) =>
          prev
            ? { ...prev, silver: Math.max(prev.silver - silverUnitPrice * effectiveCount, 0) }
            : prev
        );
      }
    } catch (e) {
      setSendError(extractErrorMessage(e, desktopI18n.t("desktop:gifts.sendFailed")));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }, [selected, sending, effectiveCount, goldUnitPrice, silverUnitPrice, onSend]);

  const totalLabel = isGold
    ? formatYuan(goldUnitPrice * effectiveCount)
    : translate("gifts.seeds", { value: formatNumber(silverUnitPrice * effectiveCount) });

  const balanceChips = wallet ? (
    <span className="flex items-center gap-2.5 text-[11px]">
      <span
        className="flex items-center gap-1 text-amber-500"
        title={translate("gifts.goldWallet", { value: formatNumber(wallet.gold) })}
      >
        <Coins className="h-3 w-3" />
        {formatYuan(wallet.gold)}
      </span>
      <span className="flex items-center gap-1 text-ink-muted" title={translate("gifts.silverWallet")}>
        <Wheat className="h-3 w-3" />
        {formatNumber(wallet.silver)}
      </span>
    </span>
  ) : null;

  const cellActiveClass =
    "bg-brand/10 ring-1 ring-inset ring-brand/30";
  const cellIdleClass =
    "bg-[var(--panel-control-bg)] hover:bg-[var(--panel-hover)]";

  const actionFooter = selected ? (
    confirming && isGold ? (
      <div className="w-full space-y-2">
        <p className="text-xs text-ink">
          {translate("gifts.confirmCost") + " "}<span className="font-medium text-amber-500">{totalLabel}</span>{" "}
          {translate("gifts.sendVerb") + " "}{selectedName} ×{effectiveCount}？
        </p>
        <PanelNote>
          {translate("gifts.goldBalance")}{wallet ? formatYuan(wallet.gold) : "—"}
          {wallet && <span className="ml-1">{translate("gifts.goldUnits", { value: formatNumber(wallet.gold) })}</span>}
        </PanelNote>
        <div className="flex gap-2">
          <PanelButton
            variant="primary"
            disabled={sending || sendBlocked}
            onClick={() => void handleSend()}
          >
            <Send className="h-3 w-3" />
            {sending ? translate("gifts.sending") : translate("gifts.confirm")}
          </PanelButton>
          <PanelButton onClick={() => setConfirming(false)}>{translate("gifts.cancel")}</PanelButton>
        </div>
      </div>
    ) : (
      <div className="flex w-full flex-wrap items-center gap-2">
        <span className="text-xs text-ink">
          {selectedName} ×{effectiveCount}
          {!isGold && silverUnitPrice > 0 && (
            <span className="ml-1 text-ink-muted">{translate("gifts.total") + " "}{totalLabel}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {COUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setCount(preset)}
              className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                count === preset
                  ? "bg-brand/10 text-brand"
                  : "bg-[var(--panel-control-bg)] text-ink-muted hover:bg-[var(--panel-hover)]"
              }`}
            >
              {preset}
            </button>
          ))}
          {selected.kind === "bag" && bagGiftNum > 0 && (
            <button
              type="button"
              onClick={() => setCount(bagGiftNum)}
              className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                effectiveCount === bagGiftNum
                  ? "bg-brand/10 text-brand"
                  : "bg-[var(--panel-control-bg)] text-ink-muted hover:bg-[var(--panel-hover)]"
              }`}
            >
              {translate("gifts.all")}
            </button>
          )}
        </div>
        {sendBlocked ? (
          <span className="ml-auto text-[11px] text-ink-muted">{translate("gifts.missingStreamer")}</span>
        ) : (
          <PanelButton
            variant="primary"
            disabled={sending}
            onClick={() => (isGold ? setConfirming(true) : void handleSend())}
            className="ml-auto"
          >
            <Send className="h-3 w-3" />
            {sending ? translate("gifts.sending") : isGold ? formatYuan(goldUnitPrice * effectiveCount) : translate("gifts.send")}
          </PanelButton>
        )}
      </div>
    )
  ) : undefined;

  return (
    <FloatingPanel title={translate("gifts.title")} onClose={onClose} extra={balanceChips} footer={actionFooter}>
      {loading ? (
        <PanelEmpty>{translate("gifts.loading")}</PanelEmpty>
      ) : error ? (
        <div className="space-y-2">
          <p className="panel-error">{error}</p>
          <PanelButton onClick={() => void load()}>
            <RefreshCw className="h-3 w-3" />
            {translate("gifts.reload")}
          </PanelButton>
        </div>
      ) : (
        <div className="pb-3">
          {/* 页签 */}
          <div className="mb-3 flex items-center gap-2">
            <PanelTabs
              className="flex-1"
              items={[
                { value: "gifts" as const, label: translate("gifts.list") },
                { value: "bag" as const, label: translate("gifts.bag") },
              ]}
              value={tab}
              onChange={(value) => { setTab(value); setSelected(null); }}
              ariaLabel={translate("gifts.type")}
            />
            <p className="panel-note">
              {tab === "gifts" ? translate("gifts.goldHint") : translate("gifts.bagHint")}
            </p>
          </div>

          {/* 礼物格子：固定两行高度，更多礼物在内部滚动 */}
          {tab === "gifts" ? (
            (gifts?.length ?? 0) === 0 ? (
              <PanelEmpty>{translate("gifts.noGifts")}</PanelEmpty>
            ) : (
              <div className={gridMaxHeightClass + " overflow-y-auto"}>
                <div className="grid grid-cols-5 gap-px">
                  {gifts?.map((gift) => {
                    const active =
                      selected?.kind === "panel" && selected.gift.id === gift.id;
                    const gold = gift.coinType === "gold";
                    return (
                      <button
                        key={gift.id}
                        type="button"
                        disabled={sending}
                        onClick={() => handleSelect({ kind: "panel", gift })}
                        title={gift.desc || gift.name}
                        className={`flex ${cellHeightClass} w-full flex-col items-center justify-center rounded-md p-1 text-center transition ${
                          active ? cellActiveClass : cellIdleClass
                        } ${sending ? "cursor-wait opacity-60" : ""}`}
                      >
                        {showGiftIcons && (
                          <ProxiedImage
                            src={gift.imgBasic}
                            alt={gift.name}
                            persistent
                            className="h-8 w-8 shrink-0 object-contain"
                          />
                        )}
                        <span
                          className={`line-clamp-1 w-full text-[11px] text-ink ${
                            showGiftIcons ? "mt-1" : ""
                          }`}
                        >
                          {gift.name}
                        </span>
                        <span className={`text-[10px] ${gold ? "text-amber-500" : "text-ink-muted"}`}>
                          {gold ? formatYuan(gift.price) : translate("gifts.seeds", { value: gift.price })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : (bag?.length ?? 0) === 0 ? (
            <PanelEmpty>{translate("gifts.emptyBag")}</PanelEmpty>
          ) : (
            <div className={gridMaxHeightClass + " overflow-y-auto"}>
              <div className="grid grid-cols-5 gap-px">
                {bag?.map((item) => {
                  const active =
                    selected?.kind === "bag" && selected.item.bagId === item.bagId;
                  return (
                    <button
                      key={item.bagId}
                      type="button"
                      disabled={sending}
                      onClick={() => handleSelect({ kind: "bag", item })}
                      title={`${item.giftName} ×${item.giftNum}`}
                      className={`flex ${cellHeightClass} w-full flex-col items-center justify-center rounded-md p-1 text-center transition ${
                        active ? cellActiveClass : cellIdleClass
                      } ${sending ? "cursor-wait opacity-60" : ""}`}
                    >
                      {showGiftIcons && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm">
                          🎁
                        </span>
                      )}
                      <span
                        className={`line-clamp-1 w-full text-[11px] text-ink ${
                          showGiftIcons ? "mt-1" : ""
                        }`}
                      >
                        {item.giftName}
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        {translate("gifts.owned") + " "}{item.giftNum}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 发送反馈 */}
          {sendError && (
            <p className="panel-error mt-2">{sendError}</p>
          )}
          {!sendError && successText && (
            <p className="mt-2 text-xs text-emerald-500 dark:text-emerald-300">{successText}</p>
          )}

        </div>
      )}
    </FloatingPanel>
  );
}
