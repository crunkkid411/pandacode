//! What Jordan has read in the Hub's Inbox (agent replies, agents waiting on him, failures).
//! The conversations themselves are PandaCode's; this only keeps "read at" per conversation, in
//! %LOCALAPPDATA%\PandaCodeHub\inbox-seen.json. `since` is when the Inbox first opened: older
//! replies count as read, so it doesn't start with every chat he ever had.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// ponytail: oldest entries go past this many; a conversation he never opens again is cheap to forget.
const MAX_ENTRIES: usize = 5000;
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    since: u64,
    seen: HashMap<String, u64>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn store() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA")
        .map_err(|_| "Windows did not say where app data goes.".to_string())?;
    Ok(PathBuf::from(base)
        .join("PandaCodeHub")
        .join("inbox-seen.json"))
}

fn save(path: &PathBuf, seen: &Seen) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Could not make {}: {e}", dir.display()))?;
    }
    let text = serde_json::to_string(seen).map_err(|e| e.to_string())?;
    // Written whole to a side file first, so a crash mid-write never leaves half a file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("Could not save {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Could not save {}: {e}", path.display()))
}

/// The record, made on first use with `since` = now.
fn load(path: &PathBuf, now: u64) -> Result<Seen, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or(Seen {
            since: now,
            seen: HashMap::new(),
        })),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let fresh = Seen {
                since: now,
                seen: HashMap::new(),
            };
            save(path, &fresh)?;
            Ok(fresh)
        }
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

fn mark(mut seen: Seen, ids: &[String], now: u64) -> Seen {
    for id in ids.iter().filter(|id| !id.trim().is_empty()) {
        seen.seen.insert(id.clone(), now);
    }
    if seen.seen.len() > MAX_ENTRIES {
        let mut by_age: Vec<(String, u64)> =
            seen.seen.iter().map(|(k, v)| (k.clone(), *v)).collect();
        by_age.sort_by_key(|(_, at)| *at);
        for (id, _) in by_age.into_iter().take(seen.seen.len() - MAX_ENTRIES) {
            seen.seen.remove(&id);
        }
    }
    seen
}

/// When the Inbox started, and when each conversation was last read.
#[tauri::command]
pub async fn hub_inbox_seen() -> Result<Seen, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = LOCK.lock().map_err(|e| e.to_string())?;
        load(&store()?, now_ms())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Marks conversations read (one, or a whole selection).
#[tauri::command]
pub async fn hub_inbox_mark_read(ids: Vec<String>) -> Result<Seen, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|e| e.to_string())?;
        let path = store()?;
        let now = now_ms();
        let seen = mark(load(&path, now)?, &ids, now);
        save(&path, &seen)?;
        Ok(seen)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_use_starts_now_and_marks_stick() {
        let path = std::env::temp_dir().join(format!("hub-inbox-seen-{}.json", now_ms()));
        let first = load(&path, 1000).unwrap();
        assert_eq!(first.since, 1000);
        assert!(path.exists(), "the start time is saved, so it doesn't move");
        let marked = mark(load(&path, 5000).unwrap(), &["a".into(), "".into()], 2000);
        save(&path, &marked).unwrap();
        let again = load(&path, 9000).unwrap();
        assert_eq!(again.since, 1000);
        assert_eq!(again.seen.get("a"), Some(&2000));
        assert_eq!(again.seen.len(), 1, "blank ids are ignored");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn oldest_marks_go_past_the_cap() {
        let mut seen = Seen::default();
        for i in 0..MAX_ENTRIES as u64 {
            seen.seen.insert(format!("old{i}"), i);
        }
        let seen = mark(seen, &["new".into()], u64::MAX);
        assert_eq!(seen.seen.len(), MAX_ENTRIES);
        assert!(seen.seen.contains_key("new") && !seen.seen.contains_key("old0"));
    }
}
