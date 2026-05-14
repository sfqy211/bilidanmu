use crate::models::ai::{AIModel, AIModelInput, TestResult};

#[tauri::command]
pub async fn add_ai_model(input: AIModelInput) -> Result<AIModel, String> {
    Ok(AIModel::from_input("mock-model", input))
}

#[tauri::command]
pub async fn test_ai_connection(_input: AIModelInput) -> Result<TestResult, String> {
    Ok(TestResult {
        success: true,
        latency_ms: Some(328),
        message: Some("连接成功".into()),
    })
}

#[tauri::command]
pub async fn fetch_models(_endpoint: String, _api_key: String) -> Result<Vec<String>, String> {
    Ok(vec!["gpt-4o-mini".into(), "gpt-4o".into()])
}

#[tauri::command]
pub async fn set_current_model(_id: String) -> Result<(), String> {
    Ok(())
}
