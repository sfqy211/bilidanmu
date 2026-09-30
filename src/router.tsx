import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "@/App";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoomPage } from "@/pages/RoomPage";
import { RoomAddPage } from "@/pages/RoomAddPage";
import { ListenHomePage } from "@/pages/ListenHomePage";
import { ListenFavPage } from "@/pages/ListenFavPage";
import { ListenSearchPage } from "@/pages/ListenSearchPage";
import { VideoPlayerPage } from "@/pages/VideoPlayerPage";
import { VideoCommentsPage } from "@/pages/VideoCommentsPage";
import { WatchLaterPage } from "@/pages/WatchLaterPage";
import { AccountPage } from "@/pages/AccountPage";
import { AIPage } from "@/pages/AIPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DanmakuPage } from "@/pages/DanmakuPage";

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
          { path: "/rooms", element: <RoomPage /> },
          { path: "/rooms/add", element: <RoomAddPage /> },
          { path: "/accounts", element: <AccountPage /> },
          { path: "/ai", element: <AIPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/listen", element: <ListenHomePage /> },
          { path: "/listen/search", element: <ListenSearchPage /> },
          { path: "/listen/watchlater", element: <WatchLaterPage /> },
          { path: "/listen/fav/:mediaId", element: <ListenFavPage /> },
          { path: "/listen/video/:bvid", element: <VideoPlayerPage /> },
          { path: "/listen/video/:bvid/comments", element: <VideoCommentsPage /> },
        ]
      },
      { path: "/danmaku/:roomId", element: <DanmakuPage /> }
    ]
  }
]);
