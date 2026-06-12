use crate::message_template_store;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_message_templates(
    state: State<'_, AppState>,
) -> Result<Vec<message_template_store::MessageTemplate>, String> {
    message_template_store::list_templates(state.inner())
}

#[tauri::command]
pub async fn create_message_template(
    state: State<'_, AppState>,
    title: String,
    content: String,
) -> Result<i64, String> {
    message_template_store::insert_template(state.inner(), &title, &content)
}

#[tauri::command]
pub async fn update_message_template(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    content: String,
) -> Result<(), String> {
    message_template_store::update_template(state.inner(), id, &title, &content)
}

#[tauri::command]
pub async fn delete_message_template(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    message_template_store::delete_template(state.inner(), id)
}
