import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "@/App";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoomPage } from "@/pages/RoomPage";
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
      {
        element: <AppLayout />,
        children: [
          { path: "/rooms", element: <RoomPage /> },
          { path: "/accounts", element: <AccountPage /> },
          { path: "/ai", element: <AIPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ]
      },
      { path: "/danmaku/:roomId", element: <DanmakuPage /> }
    ]
  }
]);
