import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "@/App";
import { AppLayout } from "@/components/layout/AppLayout";
import { MusicLayout } from "@/components/layout/MusicLayout";
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
      // 直播外壳：直播侧栏 + 直播/账号/设置路由
      {
        element: <AppLayout />,
        children: [
          { path: "/rooms", element: <RoomPage /> },
          { path: "/rooms/add", element: <RoomAddPage /> },
          { path: "/accounts", element: <AccountPage /> },
          { path: "/ai", element: <AIPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ]
      },
      // 音乐外壳：音乐侧栏 + 听视频路由（切模式即整个外壳重绘）
      {
        element: <MusicLayout />,
        children: [
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
