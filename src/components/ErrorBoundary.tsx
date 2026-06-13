import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 捕获子组件渲染错误并输出到 console.error。
 * tauri-plugin-log 的 Webview target 会自动转发到后端日志文件。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[frontend] React render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">页面加载出错，请重启应用</p>
        </div>
      );
    }
    return this.props.children;
  }
}
