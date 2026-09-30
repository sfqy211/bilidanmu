import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Disc3, ListMusic, Loader2, RefreshCw, SquarePlay } from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { tauriCommands } from "@/lib/tauri";
import type { FavFolder } from "@/types/bilibili";

/** 听视频入口页：BV 号直达 + 我的收藏夹（专辑列表） */
export function ListenHomePage() {
  const navigate = useNavigate();
  const [bvid, setBvid] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState<string | null>(null);

  const showError = (msg: string | null) => { setError(msg); setMsgKey((k) => k + 1); };

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    setFoldersError(null);
    try {
      setFolders(await tauriCommands.video.listFavFolders());
    } catch (e) {
      setFoldersError(e instanceof Error ? e.message : "获取收藏夹失败");
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  /** 从输入提取 BV 号：兼容纯 BV 号、完整链接、带参数链接 */
  const extractBvid = (input: string): string | null => {
    const match = input.match(/BV[0-9A-Za-z]{10}/);
    return match ? match[0] : null;
  };

  const handlePlay = async () => {
    const parsed = extractBvid(bvid.trim());
    if (!parsed) {
      showError("请输入有效的 BV 号或视频链接");
      return;
    }
    setLoading(true);
    showError(null);
    try {
      // 校验视频存在并预取信息后进入播放页，播放器页会自动开播
      await tauriCommands.video.getInfo(parsed);
      navigate(`/listen/video/${parsed}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : "视频不存在或获取失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="flex h-full flex-col select-none"
      onContextMenu={(e) => {
        if (!import.meta.env.DEV) {
          e.preventDefault();
        }
      }}
    >
      <header className="app-rise mb-6">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">听视频</h2>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              把 B 站视频当音乐听：分 P 是歌单，收藏夹是专辑
            </p>
          </div>
        </div>
      </header>

      {/* BV 号直达 */}
      <div className="app-rise mb-4 rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
        <div className="flex gap-2">
          <input
            value={bvid}
            onChange={(event) => setBvid(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handlePlay();
            }}
            placeholder="输入 BV 号或视频链接，如 BV1GJ411x7h7"
            className="h-9 flex-1 px-3 text-sm"
          />
          <button
            onClick={() => void handlePlay()}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-pink-500 px-4 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SquarePlay className="h-4 w-4" />}
            {loading ? "解析中..." : "播放"}
          </button>
        </div>
        {error && <InlineMessage key={msgKey} type="error" className="mt-3">{error}</InlineMessage>}
      </div>

      {/* 我的收藏夹（专辑） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              <ListMusic className="h-4 w-4" />
              我的收藏夹
            </h3>
            <button
              onClick={() => void loadFolders()}
              disabled={foldersLoading}
              className="inline-flex items-center gap-1 rounded p-1 text-xs text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed dark:hover:text-slate-200"
              title="刷新收藏夹"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${foldersLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          {foldersLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : foldersError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <Disc3 className="h-8 w-8" strokeWidth={1.6} />
              {foldersError}
            </div>
          ) : folders.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => navigate(`/listen/fav/${folder.id}`)}
                  className="group rounded-lg bg-[#f0f0f0] p-4 text-left shadow-sm transition hover:bg-[#ebebeb] dark:bg-[#161822] dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-[#1a1c26]"
                >
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{folder.title}</p>
                  <p className="mt-1 numeric text-xs text-slate-400 dark:text-slate-500">
                    {folder.mediaCount} 个视频
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <Disc3 className="h-8 w-8" strokeWidth={1.6} />
              还没有创建收藏夹
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
