import { X } from "lucide-react";
import type { Emoticon, EmoticonPackage } from "@/types/bilibili";

function getPackageLabel(pkg: EmoticonPackage): string {
  return pkg.pkgName || `表情包 ${pkg.pkgId}`;
}

export function EmoticonPickerPanel({
  loading,
  error,
  packages,
  activePkgId,
  sending,
  onClose,
  onReload,
  onSelectPackage,
  onSelectEmoticon,
}: {
  loading: boolean;
  error: string | null;
  packages: EmoticonPackage[];
  activePkgId: number | null;
  sending: boolean;
  onClose: () => void;
  onReload: () => void;
  onSelectPackage: (pkgId: number) => void;
  onSelectEmoticon: (emoticon: Emoticon) => void;
}) {
  const activePackage = packages.find((pkg) => pkg.pkgId === activePkgId) ?? packages[0];

  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-slate-950/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-200">表情选择器</p>
          <p className="text-xs text-slate-500">点击大表情后直接发送</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
          正在加载表情列表...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-4 text-sm text-rose-300">
          <p>{error}</p>
          <button type="button" onClick={onReload} className="mt-2 text-xs text-pink-300 hover:text-pink-200">
            重新加载
          </button>
        </div>
      ) : packages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
          当前房间没有可用表情。
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {packages.map((pkg) => {
              const active = pkg.pkgId === activePackage?.pkgId;
              return (
                <button
                  key={pkg.pkgId}
                  type="button"
                  onClick={() => onSelectPackage(pkg.pkgId)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? "border-pink-400 bg-pink-500/15 text-pink-200"
                      : "border-white/10 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  {getPackageLabel(pkg)}
                </button>
              );
            })}
          </div>

          <div className="grid max-h-64 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 xl:grid-cols-6">
            {activePackage?.emoticons.map((emoticon, index) => {
              const available = (emoticon.perm ?? 1) !== 0 && Boolean(emoticon.emoticonUnique);
              return (
                <button
                  key={`${activePackage.pkgId}-${emoticon.emoticonId ?? index}`}
                  type="button"
                  disabled={!available || sending}
                  onClick={() => onSelectEmoticon(emoticon)}
                  title={emoticon.descript ?? emoticon.emoji ?? "表情"}
                  className={`flex flex-col items-center rounded-xl border p-2 text-center transition ${
                    available
                      ? "border-white/10 bg-slate-900/70 hover:border-pink-400/40 hover:bg-slate-800"
                      : "cursor-not-allowed border-white/5 bg-slate-900/40 opacity-50"
                  }`}
                >
                  <img
                    src={emoticon.url}
                    alt={emoticon.descript ?? emoticon.emoji ?? "表情"}
                    className="h-12 w-12 object-contain"
                  />
                  <span className="mt-2 line-clamp-2 text-[11px] text-slate-300">
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
