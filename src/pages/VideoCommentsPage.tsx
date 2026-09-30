import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CornerDownRight,
  Loader2,
  MessageSquare,
  Send,
  ThumbsUp,
  X,
} from "lucide-react";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { tauriCommands } from "@/lib/tauri";
import { useAuthStore } from "@/stores/auth-store";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { cn } from "@/lib/utils";
import type { VideoComment } from "@/types/bilibili";

const PAGE_SIZE = 20;

interface ReplyTarget {
  /** 楼主评论 rpid（楼中楼 root） */
  root: number;
  /** 直接父评论 rpid（回复子评论时与 root 不同，顶层评论时等于 root） */
  parent: number;
  memberName: string;
}

/** 视频评论页：未登录可看不可互动，登录后可点赞/发布/回复（点评论体进入回复模式）。
 *  评论内容可选中复制；输入框固定在页面底部；在列表顶部继续上滑返回播放器。 */
export function VideoCommentsPage() {
  const navigate = useNavigate();
  const { bvid } = useParams();
  const isAnonymous = useAuthStore((s) => s.isAnonymous);

  const [aid, setAid] = useState<number | null>(null);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<0 | 1>(1); // 1 点赞 0 时间
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgKey, setMsgKey] = useState(0);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [likingId, setLikingId] = useState<number | null>(null);
  /** 正在展开子评论的 rpid（展开是异步的，按钮在此期间显示转圈） */
  const [loadingReplyId, setLoadingReplyId] = useState<number | null>(null);
  /** 评论右键菜单：屏幕坐标 + 待复制文本 */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; content: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  /** 回复目标：非空时进入回复模式（页面其余部分变暗） */
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // 子评论展开状态：rpid → { list, total, page }
  const [expanded, setExpanded] = useState<Record<number, { list: VideoComment[]; total: number; page: number }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const hasMoreComments = comments.length < total;
  const loadMoreRef = useInfiniteScroll(
    () => {
      if (!loadingMore && !loading) void load(page + 1, true, sort);
    },
    hasMoreComments && !loading,
    comments.length
  );

  // bvid → aid（评论接口以 av 号为 oid）
  useEffect(() => {
    if (!bvid) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await tauriCommands.video.getInfo(bvid);
        if (!cancelled) setAid(info.aid);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "获取视频信息失败");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bvid]);

  const load = useCallback(
    async (targetPage: number, append: boolean, sortValue: 0 | 1) => {
      if (aid == null) return;
      if (append) setLoadingMore(true);
      try {
        const result = await tauriCommands.video.getComments(aid, targetPage, sortValue);
        setTotal(result.total);
        setComments((prev) => (append ? [...prev, ...result.list] : result.list));
        setPage(targetPage);
        // 回读点赞状态：新加载的评论以服务器记录为准
        setLiked((prev) => {
          const next = new Set(prev);
          result.list.forEach((c) => {
            if (c.action >= 1) next.add(c.rpid);
            else next.delete(c.rpid);
          });
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "获取评论失败");
        setMsgKey((k) => k + 1);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [aid]
  );

  useEffect(() => {
    if (aid == null) return;
    setLoading(true);
    void load(1, false, sort);
  }, [aid, sort, load]);

  const toggleLike = async (comment: VideoComment) => {
    if (isAnonymous || aid == null || likingId != null) return;
    const nowLiked = liked.has(comment.rpid);
    setLikingId(comment.rpid);
    try {
      await tauriCommands.video.likeComment(aid, comment.rpid, !nowLiked);
      setLiked((prev) => {
        const next = new Set(prev);
        if (nowLiked) next.delete(comment.rpid);
        else next.add(comment.rpid);
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          c.rpid === comment.rpid ? { ...c, like: Math.max(0, c.like + (nowLiked ? -1 : 1)) } : c
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "点赞失败");
      setMsgKey((k) => k + 1);
    } finally {
      setLikingId(null);
    }
  };

  // 点评论体进入回复模式（按钮/链接除外；匿名不可互动）
  const commentClickHandler = (root: number, parent: number, memberName: string) => (event: React.MouseEvent) => {
    if (isAnonymous) return;
    if ((event.target as HTMLElement).closest("button")) return;
    setReplyTo({ root, parent, memberName });
    window.setTimeout(() => draftRef.current?.focus(), 80);
  };

  const expandReplies = async (comment: VideoComment) => {
    if (aid == null) return;
    const state = expanded[comment.rpid];
    // 已展开则收起
    if (state) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[comment.rpid];
        return next;
      });
      return;
    }
    setExpanded((prev) => ({ ...prev, [comment.rpid]: { list: [], total: comment.replyCount, page: 0 } }));
    setLoadingReplyId(comment.rpid);
    try {
      const result = await tauriCommands.video.getCommentReplies(aid, comment.rpid, 1);
      setExpanded((prev) => ({
        ...prev,
        [comment.rpid]: { list: result.list, total: result.total, page: 1 },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取子评论失败");
      setMsgKey((k) => k + 1);
    } finally {
      setLoadingReplyId(null);
    }
  };

  const loadMoreReplies = async (rpid: number) => {
    if (aid == null) return;
    const state = expanded[rpid];
    if (!state) return;
    try {
      const result = await tauriCommands.video.getCommentReplies(aid, rpid, state.page + 1);
      setExpanded((prev) => ({
        ...prev,
        [rpid]: { list: [...state.list, ...result.list], total: result.total, page: state.page + 1 },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取子评论失败");
      setMsgKey((k) => k + 1);
    }
  };

  const sendComment = async () => {
    const message = draft.trim();
    if (!message || aid == null || sending) return;
    setSending(true);
    try {
      const created = await tauriCommands.video.addComment(
        aid,
        message,
        replyTo?.root ?? undefined,
        replyTo?.parent ?? undefined
      );
      setTotal((t) => t + 1);
      if (replyTo) {
        // 楼中楼回复：就地追加到展开面板，父评论回复数 +1（面板未展开则只加计数）
        setExpanded((prev) => {
          const state = prev[replyTo.root];
          if (!state) return prev;
          return { ...prev, [replyTo.root]: { list: [...state.list, created], total: state.total + 1, page: state.page } };
        });
        setComments((prev) =>
          prev.map((c) => (c.rpid === replyTo.root ? { ...c, replyCount: c.replyCount + 1 } : c))
        );
      } else {
        // 顶层评论：插入列表头部（下次重新加载后按当前排序归位）
        setComments((prev) => [created, ...prev]);
      }
      setDraft("");
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败");
      setMsgKey((k) => k + 1);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ctime: number) => {
    const date = new Date(ctime * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const formatCount = (count: number) => (count >= 10000 ? `${(count / 10000).toFixed(1)}万` : String(count));

  // 评论块点击 → 回复该评论（按钮/链接除外）
  const makeCommentClick = (root: number, parent: number, memberName: string) => (event: React.MouseEvent) => {
    if (isAnonymous) return;
    if ((event.target as HTMLElement).closest("button")) return;
    setReplyTo({ root, parent, memberName });
    window.setTimeout(() => draftRef.current?.focus(), 80);
  };

  // 评论块右键 → 复制整段评论（左侧回复、右侧复制，互不打架）
  const copyViaTextarea = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  };

  const makeCommentContextMenu = (content: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setCopied(false);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 150),
      y: Math.min(event.clientY, window.innerHeight - 70),
      content,
    });
  };

  // 菜单打开期间：点击空白/滚轮/ESC 关闭
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const handleMenuCopy = async () => {
    if (!contextMenu) return;
    const ok = await copyViaTextarea(contextMenu.content);
    setCopied(ok);
    window.setTimeout(() => setContextMenu(null), 650);
  };

  return (
    <section
      className="relative flex h-full flex-col select-none"
      onContextMenu={(e) => {
        if (!import.meta.env.DEV) {
          e.preventDefault();
        }
      }}
    >
      <header className="mb-4 flex shrink-0 items-center gap-3">
        <button
          onClick={() => navigate(`/listen/video/${bvid}`)}
          className="glass-panel inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          title="返回播放器"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">评论区</h2>
          <p className="mt-1 numeric text-[13px] text-slate-500 dark:text-slate-400">共 {formatCount(total)} 条评论</p>
        </div>
        <div className="ml-auto flex shrink-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
          {([
            { value: 1 as const, label: "按点赞" },
            { value: 0 as const, label: "按时间" },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSort(value)}
              className={`px-3 py-1.5 text-xs transition ${
                sort === value
                  ? "bg-pink-500 text-white"
                  : "bg-[#f8f8f8] text-slate-500 hover:bg-[#efefef] dark:bg-[#1a1c24] dark:text-slate-400 dark:hover:bg-[#22242e]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && <InlineMessage key={msgKey} type="error" className="mb-3">{error}</InlineMessage>}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="app-rise rounded-lg bg-[#f8f8f8] p-5 shadow-sm dark:bg-[#12141e] dark:ring-1 dark:ring-white/[0.06]">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">加载中...</div>
          ) : comments.length > 0 ? (
            <>
              <div className="flex flex-col gap-4">
                {comments.map((comment) => {
                  const isLiked = liked.has(comment.rpid);
                  const subState = expanded[comment.rpid];
                  return (
                    <div key={comment.rpid} className="flex gap-3">
                      {comment.memberAvatar ? (
                        <ProxiedImage
                          src={comment.memberAvatar}
                          alt={comment.memberName}
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500/10 text-sm text-pink-500">
                          {comment.memberName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div
                          onClick={makeCommentClick(comment.rpid, comment.rpid, comment.memberName)}
                          onContextMenu={makeCommentContextMenu(comment.content)}
                          className={cn(
                            "-mx-2 rounded-lg px-2 py-1 transition-colors",
                            !isAnonymous && "cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                          )}
                          title={isAnonymous ? undefined : `回复 @${comment.memberName}`}
                        >
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{comment.memberName}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
                            {comment.content}
                          </p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-4 px-2 text-xs text-slate-400 dark:text-slate-500">
                          <span className="numeric">{formatTime(comment.ctime)}</span>
                          {comment.replyCount > 0 && (
                            <button
                              onClick={() => void expandReplies(comment)}
                              className="inline-flex items-center gap-1 transition hover:text-slate-600 dark:hover:text-slate-300"
                              title="展开子评论"
                            >
                              {loadingReplyId === comment.rpid ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CornerDownRight className="h-3 w-3" />
                              )}
                              {subState ? "收起回复" : `${formatCount(comment.replyCount)} 条回复`}
                            </button>
                          )}
                          <button
                            onClick={() => void toggleLike(comment)}
                            disabled={isAnonymous || likingId === comment.rpid}
                            className={cn(
                              "inline-flex items-center gap-1 transition disabled:cursor-not-allowed",
                              isAnonymous
                                ? "cursor-default"
                                : isLiked
                                  ? "text-pink-500 dark:text-pink-300"
                                  : "hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                            title={isAnonymous ? "登录后可点赞" : isLiked ? "取消点赞" : "点赞"}
                          >
                            <ThumbsUp className={cn("h-3 w-3", isLiked && "fill-current")} />
                            {formatCount(comment.like)}
                          </button>
                        </div>

                        {/* 子评论（楼中楼） */}
                        {subState && subState.list.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2.5 rounded-lg bg-black/[0.03] p-2.5 dark:bg-white/[0.03]">
                            {subState.list.map((sub) => (
                              <div key={sub.rpid} className="flex gap-2.5">
                                {sub.memberAvatar ? (
                                  <ProxiedImage
                                    src={sub.memberAvatar}
                                    alt={sub.memberName}
                                    className="h-6 w-6 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-500/10 text-[10px] text-pink-500">
                                    {sub.memberName.charAt(0)}
                                  </div>
                                )}
                                <div
                                  onClick={makeCommentClick(comment.rpid, sub.rpid, sub.memberName)}
                                  onContextMenu={makeCommentContextMenu(sub.content)}
                                  className={cn(
                                    "-mx-1.5 min-w-0 flex-1 rounded px-1.5 py-0.5 transition-colors",
                                    !isAnonymous && "cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                                  )}
                                  title={isAnonymous ? undefined : `回复 @${sub.memberName}`}
                                >
                                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {sub.memberName}
                                    <span className="ml-2 numeric font-normal text-slate-400 dark:text-slate-500">
                                      {formatTime(sub.ctime)}
                                    </span>
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-200">
                                    {sub.content}
                                  </p>
                                </div>
                                <span className="flex shrink-0 items-center gap-1 self-start text-xs text-slate-400 dark:text-slate-500">
                                  <ThumbsUp className="h-3 w-3" />
                                  {formatCount(sub.like)}
                                </span>
                              </div>
                            ))}
                            {subState.list.length < subState.total && (
                              <button
                                onClick={() => void loadMoreReplies(comment.rpid)}
                                className="self-start text-xs text-pink-500 transition hover:text-pink-400"
                              >
                                查看更多回复（{subState.list.length}/{subState.total}）
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMoreComments && (
                <div ref={loadMoreRef} className="flex justify-center py-3">
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <MessageSquare className="h-8 w-8" strokeWidth={1.6} />
              还没有评论
            </div>
          )}
        </div>
      </div>

      {/* 评论右键菜单：整段复制 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-36 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/10 dark:bg-[#1a1c24] dark:ring-white/10"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => void handleMenuCopy()}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              {copied ? "已复制" : "复制评论"}
            </button>
          </div>
        </>
      )}

      {/* 回复模式：评论框以外全部变暗，点击暗处取消回复 */}
      <div
        onClick={() => setReplyTo(null)}
        className={cn(
          "absolute inset-0 z-20 bg-black/45 transition-opacity duration-200",
          replyTo ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* 输入框固定在页面底部 */}
      <div
        className={cn(
          "relative z-30 mt-3 shrink-0 rounded-lg bg-[#f8f8f8] p-3 shadow-sm transition-shadow dark:bg-[#12141e] dark:ring-1",
          replyTo ? "ring-2 ring-pink-500/60 dark:ring-pink-500/60" : "dark:ring-white/[0.06]"
        )}
      >
        {replyTo && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-pink-500 dark:text-pink-300">
            <CornerDownRight className="h-3 w-3" />
            正在回复 @{replyTo.memberName}
            <button
              onClick={() => setReplyTo(null)}
              className="ml-1 rounded p-0.5 transition hover:bg-black/10 dark:hover:bg-white/10"
              title="取消回复"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) void sendComment();
            }}
            placeholder={
              isAnonymous
                ? "匿名模式下无法发布评论"
                : replyTo
                  ? `回复 ${replyTo.memberName}：`
                  : "发一条友善的评论"
            }
            disabled={isAnonymous}
            className="h-9 flex-1 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            onClick={() => void sendComment()}
            disabled={isAnonymous || sending || !draft.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-pink-500 px-4 text-sm font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
            title={isAnonymous ? "登录后可发布评论" : "发布"}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            发布
          </button>
        </div>
      </div>
    </section>
  );
}
