//! A bot's work project: an ordinary PandaCode project its Hub chat runs in, instead of the
//! bot's own workspace folder. The bot keeps its own workspace (its skills files, memories and
//! other threads stay there); only the desktop chat moves. Skills reach that chat as text, so
//! nothing is written into the project's checkout.
use super::*;

/// Where a new thread for this bot is created: its work project when that still exists.
pub(crate) fn thread_project<'a>(store: &Store, bot: &'a Bot) -> &'a str {
    if !bot.work_project.is_empty() && store.project(&bot.work_project).is_ok() { &bot.work_project } else { &bot.project_id }
}

/// Sets (or clears, with `None`) the bot's work project. The next Hub chat starts fresh there;
/// the old conversation stays in the task list.
pub(crate) fn set(store: &Store, id: &str, project_id: Option<&str>) -> Result<Bot> {
    let bot = get(store, id)?;
    let project = project_id.map(str::trim).filter(|p| !p.is_empty() && *p != bot.project_id);
    if let Some(project) = project {
        store.project(project).map_err(|_| "That project no longer exists.".to_owned())?;
        if project_ids(store)?.iter().any(|p| p == project) {
            return Err("That folder is another bot's own workspace. Pick a regular project.".into());
        }
    }
    let value = project.unwrap_or_default();
    if value == bot.work_project {
        return Ok(bot);
    }
    store.db.execute("UPDATE bots SET work_project=?2,updated_at=?3 WHERE id=?1", params![id, value, crate::storage::now()]).map_err(|e| e.to_string())?;
    store.db.execute("DELETE FROM bot_threads WHERE bot_id=?1 AND channel_id=?2", params![id, DESKTOP]).map_err(|e| e.to_string())?;
    let name = if value.is_empty() { "its own workspace".to_owned() } else { store.project(value).map(|p| p.name).unwrap_or_default() };
    log(store, id, "updated", &format!("Now works in {name}"), json!({"project": value}))?;
    get(store, id)
}

#[tauri::command]
pub async fn bot_set_work_project(app: tauri::AppHandle, window: tauri::WebviewWindow, state: State<'_, AppState>, bot_id: String, project_id: Option<String>) -> Result<Bot> {
    guard_main(&window)?;
    let bot = set(&*state.store.lock().map_err(|e| e.to_string())?, &bot_id, project_id.as_deref())?;
    let _ = app.emit("bots-changed", ());
    let _ = app.emit("sessions-changed", ());
    Ok(bot)
}
