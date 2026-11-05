import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, RefreshCw, Send, Wheat } from "lucide-react";
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
  const cellHeightClass = showGiftIcons ? "h-[86px]" : "h-[48px]";
  const gridMaxHeightClass = showGiftIcons ? "max-h-[173px]" : "max-h-[97px]";

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
      setError(extractErrorMessage(failureReason, "礼物信息加载失败"));
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
      setSuccessText(`已送出 ${name} ×${effectiveCount}`);
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
      setSendError(extractErrorMessage(e, "发送礼物失败"));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }, [selected, sending, effectiveCount, goldUnitPrice, silverUnitPrice, onSend]);

  const totalLabel = isGold
    ? formatYuan(goldUnitPrice * effectiveCount)
    : `${(silverUnitPrice * effectiveCount).toLocaleString()} 瓜子`;

  const balanceChips = wallet ? (
    <span className="flex items-center gap-2.5 text-[11px]">
      <span
        className="flex items-center gap-1 text-amber-500"
        title={`金瓜子余额 ${wallet.gold.toLocaleString()}（1000 金瓜子 = 1 元）`}
      >
        <Coins className="h-3 w-3" />
        {formatYuan(wallet.gold)}
      </span>
      <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500" title="银瓜子余额">
        <Wheat className="h-3 w-3" />
        {wallet.silver.toLocaleString()}
      </span>
    </span>
  ) : null;

  const cellActiveClass =
    "ring-1 ring-pink-300 bg-pink-50 dark:ring-pink-500/40 dark:bg-pink-500/[0.08]";
  const cellIdleClass =
    "bg-white/10 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.04]";

  return (
    <FloatingPanel title="礼物打赏" onClose={onClose} extra={balanceChips}>
      {loading ? (
        <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          正在加载礼物列表...
        </div>
      ) : error ? (
        <div className="mb-3 bg-rose-50 px-3 py-4 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 flex items-center gap-1 text-xs text-pink-500 hover:text-pink-400 dark:text-pink-300 dark:hover:text-pink-200"
          >
            <RefreshCw className="h-3 w-3" />
            重新加载
          </button>
        </div>
      ) : (
        <div className="pb-3">
          {/* 页签 */}
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setTab("gifts"); setSelected(null); }}
              className={`rounded px-2.5 py-1 text-xs transition ${
                tab === "gifts"
                  ? "bg-pink-50 text-pink-600 dark:bg-pink-500/[0.08] dark:text-pink-200"
                  : "bg-white/10 text-slate-400 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.04]"
              }`}
            >
              礼物
            </button>
            <button
              type="button"
              onClick={() => { setTab("bag"); setSelected(null); }}
              className={`rounded px-2.5 py-1 text-xs transition ${
                tab === "bag"
                  ? "bg-pink-50 text-pink-600 dark:bg-pink-500/[0.08] dark:text-pink-200"
                  : "bg-white/10 text-slate-400 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.04]"
              }`}
            >
              背包
            </button>
            <p className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
              {tab === "gifts" ? "金瓜子礼物发送前需确认" : "背包礼物不扣费"}
            </p>
          </div>

          {/* 礼物格子：固定两行高度，更多礼物在内部滚动 */}
          {tab === "gifts" ? (
            (gifts?.length ?? 0) === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                当前房间没有可用礼物。
              </div>
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
                        className={`flex ${cellHeightClass} w-full flex-col items-center justify-center p-1.5 text-center transition ${
                          active ? cellActiveClass : cellIdleClass
                        } ${sending ? "cursor-wait opacity-60" : ""}`}
                      >
                        {showGiftIcons && (
                          <ProxiedImage
                            src={gift.imgBasic}
                            alt={gift.name}
                            persistent
                            className="h-10 w-10 shrink-0 object-contain"
                          />
                        )}
                        <span
                          className={`line-clamp-1 w-full text-[11px] text-slate-500 dark:text-slate-300 ${
                            showGiftIcons ? "mt-1" : ""
                          }`}
                        >
                          {gift.name}
                        </span>
                        <span className={`text-[10px] ${gold ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`}>
                          {gold ? formatYuan(gift.price) : `${gift.price} 瓜子`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : (bag?.length ?? 0) === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              背包里没有礼物。
            </div>
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
                      className={`flex ${cellHeightClass} w-full flex-col items-center justify-center p-1.5 text-center transition ${
                        active ? cellActiveClass : cellIdleClass
                      } ${sending ? "cursor-wait opacity-60" : ""}`}
                    >
                      {showGiftIcons && (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100 text-base dark:bg-pink-500/10">
                          🎁
                        </span>
                      )}
                      <span
                        className={`line-clamp-1 w-full text-[11px] text-slate-500 dark:text-slate-300 ${
                          showGiftIcons ? "mt-1" : ""
                        }`}
                      >
                        {item.giftName}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        持有 {item.giftNum}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 发送反馈 */}
          {sendError && (
            <p className="mt-2 text-xs text-rose-500 dark:text-rose-300">{sendError}</p>
          )}
          {!sendError && successText && (
            <p className="mt-2 text-xs text-emerald-500 dark:text-emerald-300">{successText}</p>
          )}

          {/* 操作条 / 金瓜子确认 */}
          {selected && (
            <div className="mt-3 border-t border-slate-200/50 pt-3 dark:border-white/[0.06]">
              {confirming && isGold ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    确认花费{" "}
                    <span className="font-medium text-amber-500">{totalLabel}</span>{" "}
                    送出 {selectedName} ×{effectiveCount}？
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    当前金瓜子余额：
                    {wallet ? formatYuan(wallet.gold) : "—"}
                    {wallet && (
                      <span className="ml-1">({wallet.gold.toLocaleString()} 金瓜子)</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={sending || sendBlocked}
                      onClick={() => void handleSend()}
                      className="inline-flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-3 w-3" />
                      {sending ? "发送中..." : "确认发送"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded px-3 py-1.5 text-xs text-ink-muted transition hover:bg-[#ebebeb] dark:text-ink-muted dark:hover:bg-white/[0.06]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {selectedName} ×{effectiveCount}
                    {!isGold && silverUnitPrice > 0 && (
                      <span className="ml-1 text-slate-400 dark:text-slate-500">
                        合计 {totalLabel}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    {COUNT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCount(preset)}
                        className={`rounded px-2 py-0.5 text-[11px] transition ${
                          count === preset
                            ? "bg-brand/10 text-brand"
                            : "bg-white/10 text-slate-400 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                    {selected.kind === "bag" && bagGiftNum > 0 && (
                      <button
                        type="button"
                        onClick={() => setCount(bagGiftNum)}
                        className={`rounded px-2 py-0.5 text-[11px] transition ${
                          effectiveCount === bagGiftNum
                            ? "bg-brand/10 text-brand"
                            : "bg-white/10 text-slate-400 hover:bg-white/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        全部
                      </button>
                    )}
                  </div>
                  {sendBlocked ? (
                    <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                      未获取到主播信息，无法送礼
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => (isGold ? setConfirming(true) : void handleSend())}
                      className="ml-auto inline-flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-3 w-3" />
                      {sending ? "发送中..." : isGold ? formatYuan(goldUnitPrice * effectiveCount) : "发送"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </FloatingPanel>
  );
}
