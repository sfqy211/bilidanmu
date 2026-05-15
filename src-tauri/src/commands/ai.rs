use crate::ai_store;
use crate::models::ai::{AIModel, AIModelInput, TestResult};
use crate::tray;
use rand::Rng;
use std::time::Instant;

#[tauri::command]
pub async fn get_ai_models(app: tauri::AppHandle) -> Result<Vec<AIModel>, String> {
    ai_store::load_models(&app)
}

#[tauri::command]
pub async fn add_ai_model(app: tauri::AppHandle, input: AIModelInput) -> Result<AIModel, String> {
    let mut models = ai_store::load_models(&app)?;
    let id = generate_model_id();
    let model = AIModel::from_input(&id, input, models.is_empty());

    if model.is_current == Some(true) {
        for existing in &mut models {
            existing.is_current = Some(false);
        }
    }

    models.push(model.clone());
    let current_id = models.iter().find(|item| item.is_current == Some(true)).map(|item| item.id.as_str());
    ai_store::save_models(&app, &models, current_id)?;
    let _ = tray::refresh_tray(&app);
    Ok(model)
}

#[tauri::command]
pub async fn update_ai_model(app: tauri::AppHandle, id: String, input: AIModelInput) -> Result<AIModel, String> {
    let mut models = ai_store::load_models(&app)?;
    let index = models
        .iter()
        .position(|item| item.id == id)
        .ok_or_else(|| "未找到对应模型".to_string())?;

    let is_current = models[index].is_current == Some(true);
    let model = AIModel::from_input(&id, input, is_current);
    models[index] = model.clone();

    let current_id = models.iter().find(|item| item.is_current == Some(true)).map(|item| item.id.as_str());
    ai_store::save_models(&app, &models, current_id)?;
    let _ = tray::refresh_tray(&app);
    Ok(model)
}

#[tauri::command]
pub async fn test_ai_connection(input: AIModelInput) -> Result<TestResult, String> {
    let start = Instant::now();
    let endpoint = normalize_endpoint(&input.endpoint);
    let url = format!("{endpoint}/models");

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    let response = client
        .get(&url)
        .bearer_auth(&input.api_key)
        .send()
        .await
        .map_err(|error| format!("连接失败: {error}"))?;

    let latency_ms = start.elapsed().as_millis() as u64;

    if response.status().is_success() {
        Ok(TestResult {
            success: true,
            latency_ms: Some(latency_ms),
            message: Some("连接成功".into()),
        })
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Ok(TestResult {
            success: false,
            latency_ms: Some(latency_ms),
            message: Some(format!("请求失败: {} {}", status, body)),
        })
    }
}

#[tauri::command]
pub async fn fetch_models(endpoint: String, api_key: String) -> Result<Vec<String>, String> {
    let endpoint = normalize_endpoint(&endpoint);
    let url = format!("{endpoint}/models");

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    let response = client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| format!("获取模型列表失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("获取模型列表失败: {}", response.status()));
    }

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析模型列表失败: {error}"))?;

    let models = json
        .get("data")
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str).map(ToString::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(models)
}

#[tauri::command]
pub async fn set_current_model(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut models = ai_store::load_models(&app)?;
    let mut found = false;

    for model in &mut models {
        let is_current = model.id == id;
        if is_current {
            found = true;
        }
        model.is_current = Some(is_current);
    }

    if !found {
        return Err("未找到对应模型".to_string());
    }

    ai_store::save_models(&app, &models, Some(&id))?;
    let _ = tray::refresh_tray(&app);
    Ok(())
}

#[tauri::command]
pub async fn delete_ai_model(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut models = ai_store::load_models(&app)?;
    let removed_current = models.iter().any(|item| item.id == id && item.is_current == Some(true));
    let original_len = models.len();
    models.retain(|item| item.id != id);

    if models.len() == original_len {
        return Err("未找到对应模型".to_string());
    }

    if removed_current {
        if let Some(first) = models.first_mut() {
            first.is_current = Some(true);
            let current_id = first.id.clone();
            ai_store::save_models(&app, &models, Some(&current_id))?;
            let _ = tray::refresh_tray(&app);
            return Ok(());
        }

        ai_store::save_models(&app, &models, None)?;
        let _ = tray::refresh_tray(&app);
        return Ok(());
    }

    let current_id = models.iter().find(|item| item.is_current == Some(true)).map(|item| item.id.as_str());
    ai_store::save_models(&app, &models, current_id)?;
    let _ = tray::refresh_tray(&app);
    Ok(())
}

fn normalize_endpoint(endpoint: &str) -> String {
    endpoint.trim().trim_end_matches('/').to_string()
}

fn generate_model_id() -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let random: u16 = rand::thread_rng().gen();
    format!("model-{timestamp}-{random:04x}")
}
