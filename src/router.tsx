import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "@/App";
import { AppLayout } from "@/components/layout/AppLayout";

/** 路由级懒加载：每个页面拆成独立 chunk，首屏只加载当前路由所需代码。
 *  在 Tauri 本地资源下加载极快（无网络往返），主要用于缩短冷启动解析时间。 */
const RoomPage = lazy(() => import("@/pages/RoomPage").then((m) => ({ default: m.RoomPage })));
const RoomAddPage = lazy(() =>
  import("@/pages/RoomAddPage").then((m) => ({ default: m.RoomAddPage }))
);
const ListenHomePage = lazy(() =>
  import("@/pages/ListenHomePage").then((m) => ({ default: m.ListenHomePage }))
);
const ListenFavPage = lazy(() =>
  import("@/pages/ListenFavPage").then((m) => ({ default: m.ListenFavPage }))
);
const VideoAddPage = lazy(() =>
  import("@/pages/VideoAddPage").then((m) => ({ default: m.VideoAddPage }))
);
const VideoPlayerPage = lazy(() =>
  import("@/pages/VideoPlayerPage").then((m) => ({ default: m.VideoPlayerPage }))
);
const VideoCommentsPage = lazy(() =>
  import("@/pages/VideoCommentsPage").then((m) => ({ default: m.VideoCommentsPage }))
);
const WatchLaterPage = lazy(() =>
  import("@/pages/WatchLaterPage").then((m) => ({ default: m.WatchLaterPage }))
);
const AccountPage = lazy(() =>
  import("@/pages/AccountPage").then((m) => ({ default: m.AccountPage }))
);
const AIPage = lazy(() => import("@/pages/AIPage").then((m) => ({ default: m.AIPage })));
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const DanmakuPage = lazy(() =>
  import("@/pages/DanmakuPage").then((m) => ({ default: m.DanmakuPage }))
);

/** 懒加载占位：本地资源加载通常在几十毫秒内，仅避免白屏闪烁。 */
function RouteFallback() {
  return <div className="flex h-full items-center justify-center text-sm text-ink-muted" />;
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/rooms" replace /> },
      // 共用主窗口外壳，模式切换时保留标题栏与播放器，只更换侧栏和页面。
      {
        element: <AppLayout />,
        children: [
          { path: "/rooms", element: withSuspense(<RoomPage />) },
          { path: "/rooms/add", element: withSuspense(<RoomAddPage />) },
          { path: "/accounts", element: withSuspense(<AccountPage />) },
          { path: "/ai", element: withSuspense(<AIPage />) },
          { path: "/settings", element: withSuspense(<SettingsPage />) },
          { path: "/listen", element: withSuspense(<ListenHomePage />) },
          { path: "/listen/add", element: withSuspense(<VideoAddPage />) },
          { path: "/listen/search", element: <Navigate to="/listen/add" replace /> },
          { path: "/listen/watchlater", element: withSuspense(<WatchLaterPage />) },
          { path: "/listen/fav/:mediaId", element: withSuspense(<ListenFavPage />) },
          { path: "/listen/video/:bvid", element: withSuspense(<VideoPlayerPage />) },
          {
            path: "/listen/video/:bvid/comments",
            element: withSuspense(<VideoCommentsPage />),
          },
        ],
      },
      { path: "/danmaku/:roomId", element: withSuspense(<DanmakuPage />) },
    ],
  },
]);
