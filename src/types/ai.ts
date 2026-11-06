/**
 * AI 工具层类型。与 Rust 侧 `src-tauri/src/ai/spec.rs` 一一对应。
 *
 * 工具规格由 Rust 单一真源生成（`ai_list_tools`），前端不手抄 JSON Schema——
 * 这里只定义外壳类型，参数结构由调试面板按 schema 动态渲染。
 */

export type AiRisk = "read" | "write" | "costly" | "destructive";

export type AiPermissionMode = "confirmAll" | "autonomous" | "full";

export interface AiToolSpec {
  name: string;
  title: string;
  description: string;
  risk: AiRisk;
  /** JSON Schema，调试面板据此校验与提示参数 */
  inputSchema: Record<string, unknown>;
}

export interface AiToolError {
  code: string;
  message: string;
  hint?: string;
  retryable: boolean;
  confirmationId?: string;
}

export interface AiToolResult {
  ok: boolean;
  data?: unknown;
  error?: AiToolError;
  truncated?: boolean;
  cursor?: unknown;
}

export interface McpStatus {
  running: boolean;
  port: number;
  endpoint: string;
  error?: string | null;
}

export interface AiAuditEntry {
  tool: string;
  origin: string;
  args: unknown;
  ok: boolean;
  summary: string;
  durationMs: number;
  createdAt: number;
}

/** 确认弹窗收到的事件载荷 */
export interface AiConfirmRequest {
  id: string;
  tool: string;
  title: string;
  message: string;
  risk: AiRisk;
}

/** 工具调用活动通知（MCP 侧每调一次都会广播） */
export interface AiToolActivity {
  tool: string;
  ok: boolean;
}
