import { useEffect } from "react";

/**
 * 捕获全局未处理错误，输出到 console.error。
 * tauri-plugin-log 已配置 Webview target，console.error 会自动转发到后端日志文件。
 * 在 App 组件中挂载一次即可。
 */
export function useErrorCapture() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.message || "Unknown error";
      const filename = event.filename ? ` (${event.filename}:${event.lineno})` : "";
      console.error(`[frontend] ${message}${filename}`, event.error);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(`[frontend] Unhandled rejection: ${message}`, reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
}
