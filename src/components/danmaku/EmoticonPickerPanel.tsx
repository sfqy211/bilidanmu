import { X } from "lucide-react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";
import { makePkgKey } from "@/types/bilibili";

function getPackageLabel(pkg: EmoticonPackage): string {
  return pkg.pkgName || `表情包 ${pkg.pkgId}`;
}

export function EmoticonPickerPanel({
  loading,
  error,
  packages,
  activePkgKey,
  sending,
  onClose,
  onReload,
  onSelectPackage,
  onSelectEmoticon,
  className,
}: {
  loading: boolean;
  error: string | null;
  packages: EmoticonPackage[];
  activePkgKey: string | null;
  sending: boolean;
  onClose: () => void;
  onReload: () => void;
  onSelectPackage: (pkgKey: string) => void;
  onSelectEmoticon: (emoticon: Emoticon) => void;
  className?: string;
}) {
  const activePackage = packages.find((pkg) => makePkgKey(pkg) === activePkgKey) ?? packages[0];

  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      className={`${className ?? ""} border border-slate-300 bg-white p-3 dark:border-white/[0.06] dark:bg-[#12141e]`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">表情选择器</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">点击大表情后直接发送</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-400 dark:border-white/[0.06] dark:text-slate-500">
          正在加载表情列表...
        </div>
      ) : error ? (
        <div className="border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <p>{error}</p>
          <button type="button" onClick={onReload} className="mt-2 text-xs text-pink-500 hover:text-pink-400 dark:text-pink-300 dark:hover:text-pink-200">
            重新加载
          </button>
        </div>
      ) : packages.length === 0 ? (
        <div className="border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-400 dark:border-white/[0.06] dark:text-slate-500">
          当前房间没有可用表情。
        </div>
      ) : (
        <>
          <div className="mb-3 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
            {packages.map((pkg, index) => {
              const active = pkg === activePackage;
              const preview = pkg.emoticons[0];
              return (
                <button
                  key={`${pkg.pkgId}-${pkg.pkgType ?? 0}-${index}`}
                  type="button"
                  onClick={() => onSelectPackage(makePkgKey(pkg))}
                  title={getPackageLabel(pkg)}
                  className={`flex h-12 w-12 items-center justify-center border transition ${
                    active
                      ? "border-pink-300 bg-pink-50 text-pink-600 dark:border-pink-500/40 dark:bg-pink-500/[0.08] dark:text-pink-200"
                      : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 dark:border-white/[0.06] dark:bg-[#0e1018] dark:text-slate-400 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {preview ? (
                    <ProxiedImage
                      src={preview.url}
                      alt={getPackageLabel(pkg)}
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <span className="text-[10px]">包</span>
                  )}
                </button>
              );
            })}
            </div>
          </div>

          <div className="grid max-h-64 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 xl:grid-cols-6">
            {activePackage?.emoticons.map((emoticon, index) => {
              const available = (emoticon.perm ?? 1) !== 0 && Boolean(emoticon.emoticonUnique);
              return (
                <button
                  key={`${activePackage.pkgId}-${emoticon.emoticonUnique ?? emoticon.emoticonId ?? index}`}
                  type="button"
                  disabled={!available || sending}
                  onClick={() => onSelectEmoticon(emoticon)}
                  title={emoticon.descript ?? emoticon.emoji ?? "表情"}
                  className={`flex flex-col items-center border p-2 text-center transition ${
                    available
                      ? "border-slate-200 bg-white hover:border-pink-300 hover:bg-slate-50 dark:border-white/[0.06] dark:bg-[#161822] dark:hover:border-pink-500/40 dark:hover:bg-white/[0.04]"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50 dark:border-white/[0.04] dark:bg-[#0c0e18]"
                  }`}
                >
                  <ProxiedImage
                    src={emoticon.url}
                    alt={emoticon.descript ?? emoticon.emoji ?? "表情"}
                    className="h-12 w-12 object-contain"
                  />
                  <span className="mt-2 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-300">
                    {emoticon.descript ?? emoticon.emoji ?? "未命名表情"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
