//! AI 专用日志：与主应用日志（bilidanmu.log）分开的 `ai.log`，与主日志同目录。
//!
//! 记录两件事：启动时的工具清单（给排查"客户端为什么看不到某工具"用）
//! 与每次工具调用的结果。页面不再展示这些内容——可用工具是给 AI 客户端看的
//! （走 MCP tools/list），调用记录查这个日志即可。写入失败只进主日志，
//! 绝不影响工具调用本身。

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// 日志文件名，与 tauri_plugin_log 的 bilidanmu.log 放在同一目录
const LOG_FILE: &str = "ai.log";

/// 超过该大小（字节）在下次启动时轮转，避免无限增长
const ROTATE_THRESHOLD: u64 = 1024 * 1024;

/// 并发调用可能同时追加，串行化写入避免行交错
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// 启动时调用：必要时轮转过大文件，然后写入当前工具清单。
pub fn log_startup(app: &tauri::AppHandle) {
    rotate_if_large(app);
    let specs = crate::ai::registry::all_specs();
    let mut lines = vec![format!("[启动] 工具清单共 {} 项", specs.len())];
    for spec in &specs {
        lines.push(format!(
            "[工具] {} [{}] {}",
            spec.name,
            risk_label(spec.risk),
            spec.title
        ));
    }
    append(app, &lines);
}

/// 记录一次工具调用（无论成败）。
pub fn record(
    app: &tauri::AppHandle,
    tool: &str,
    args: &serde_json::Value,
    ok: bool,
    summary: &str,
    duration_ms: u64,
) {
    // 参数截短留痕即可，完整结果本来就在调用方手里
    let args_text = serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string());
    let args_text = truncate(&args_text, 500);
    let summary = truncate(summary, 500);
    let outcome = if ok { "成功" } else { "失败" };
    let mut line = format!("[调用] {tool} → {outcome}（{duration_ms}ms）{summary}");
    if args_text != "{}" {
        line.push_str(&format!(" ｜ 参数：{args_text}"));
    }
    append(app, &[line]);
}

/// 记录一条与具体调用无关但值得留痕的事件（如 MCP 服务启动）。
pub fn note(app: &tauri::AppHandle, text: &str) {
    append(app, &[format!("[事件] {text}")]);
}

fn log_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_log_dir()
        .map(|dir| dir.join(LOG_FILE))
        .map_err(|error| format!("获取日志目录失败: {error}"))
}

fn append(app: &tauri::AppHandle, lines: &[String]) {
    let path = match log_path(app) {
        Ok(path) => path,
        Err(error) => {
            log::warn!("[ai] {error}");
            return;
        }
    };
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    // 首次启动时主日志插件可能还没建目录，自己兜底
    let result = std::fs::create_dir_all(path.parent().unwrap_or(&path))
        .and_then(|()| std::fs::OpenOptions::new().create(true).append(true).open(&path))
        .and_then(|mut file| {
            for line in lines {
                writeln!(file, "{timestamp} {line}")?;
            }
            Ok(())
        });
    if let Err(error) = result {
        log::warn!("[ai] 写 {LOG_FILE} 失败: {error}");
    }
}

/// 超过阈值时把旧文件挪走（保留一份 .old），本次启动重新开始记
fn rotate_if_large(app: &tauri::AppHandle) {
    let path = match log_path(app) {
        Ok(path) => path,
        Err(_) => return,
    };
    let Ok(metadata) = std::fs::metadata(&path) else {
        return;
    };
    if metadata.len() <= ROTATE_THRESHOLD {
        return;
    }
    let old = path.with_file_name(format!("{LOG_FILE}.old"));
    let _ = std::fs::remove_file(&old);
    if let Err(error) = std::fs::rename(&path, &old) {
        log::warn!("[ai] 轮转 {LOG_FILE} 失败: {error}");
    }
}

fn risk_label(risk: crate::ai::spec::Risk) -> &'static str {
    match risk {
        crate::ai::spec::Risk::Read => "只读",
        crate::ai::spec::Risk::Write => "写",
        crate::ai::spec::Risk::Costly => "有风险",
        crate::ai::spec::Risk::Destructive => "不可逆",
    }
}

/// 按字符边界截断，避免把多字节 UTF-8 切成半个字符。
fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max_chars).collect();
    out.push('…');
    out
}
