use crate::models::ai::AIModel;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "ai_models.json";
const MODELS_KEY: &str = "models";
const CURRENT_KEY: &str = "currentModelId";

pub fn load_models(app: &tauri::AppHandle) -> Result<Vec<AIModel>, String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建 AI 模型存储失败: {error}"))?;

    let models = match store.get(MODELS_KEY) {
        Some(value) => serde_json::from_value::<Vec<AIModel>>(value)
            .map_err(|error| format!("读取 AI 模型失败: {error}"))?,
        None => Vec::new(),
    };

    let current_id = store
        .get(CURRENT_KEY)
        .and_then(|value| value.as_str().map(ToString::to_string));

    Ok(models
        .into_iter()
        .map(|mut model| {
            model.is_current = Some(current_id.as_deref() == Some(model.id.as_str()));
            model
        })
        .collect())
}

pub fn save_models(app: &tauri::AppHandle, models: &[AIModel], current_id: Option<&str>) -> Result<(), String> {
    let store = app
        .store_builder(STORE_FILE)
        .build()
        .map_err(|error| format!("创建 AI 模型存储失败: {error}"))?;

    store.set(
        MODELS_KEY,
        serde_json::to_value(models).map_err(|error| format!("序列化 AI 模型失败: {error}"))?,
    );

    match current_id {
        Some(id) => {
            store.set(CURRENT_KEY, serde_json::Value::String(id.to_string()));
        }
        None => {
            store.delete(CURRENT_KEY);
        }
    }

    store
        .save()
        .map_err(|error| format!("保存 AI 模型失败: {error}"))?;

    Ok(())
}
