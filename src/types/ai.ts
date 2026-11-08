/**
 * AI 工具层类型。与 Rust 侧 `src-tauri/src/ai/spec.rs` 一一对应。
 *
 * 工具规格由 Rust 单一真源生成（MCP tools/list 直接返回给客户端），前端不再
 * 展示工具清单与调用记录——那些记在 AI 专用日志（ai.log）里。
 */

export type AiRisk = "read" | "write" | "costly" | "destructive";

export type AiPermissionMode = "confirmAll" | "autonomous" | "full";

export interface McpStatus {
  running: boolean;
  port: number;
  endpoint: string;
  error?: string | null;
}

/** 确认弹窗收到的事件载荷 */
export interface AiConfirmRequest {
  id: string;
  tool: string;
  title: string;
  message: string;
  risk: AiRisk;
}
