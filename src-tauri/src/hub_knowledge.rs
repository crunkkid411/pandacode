//! The Hub's Knowledge page: Jordan's qmd library (his saved videos, starred repos, phone browsing,
//! past chats, becky docs). Runs qmd's own CLI script with node directly, never through a shell,
//! so the words he searches for are only ever one argument.

use crate::hub::quiet;
use serde::Serialize;
use std::path::PathBuf;

const MAX_DOC_BYTES: usize = 400 * 1024;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    name: String,
    files: u64,
    updated: String,
}

fn qmd_script() -> Result<PathBuf, String> {
    let appdata =
        std::env::var("APPDATA").map_err(|_| "Windows did not say where apps live.".to_string())?;
    let script = PathBuf::from(appdata).join(r"npm\node_modules\@tobilu\qmd\dist\cli\qmd.js");
    if script.exists() {
        Ok(script)
    } else {
        Err("qmd is not installed (npm install -g @tobilu/qmd).".into())
    }
}

fn run_qmd(args: Vec<String>) -> Result<String, String> {
    let out = quiet("node")
        .arg(qmd_script()?)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "qmd failed: {}",
            err.trim().lines().last().unwrap_or("no reason given")
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `qmd collection list` text -> collections.
fn parse_collections(text: &str) -> Vec<Collection> {
    let mut out: Vec<Collection> = Vec::new();
    for line in text.lines() {
        let t = line.trim();
        if !line.starts_with(' ') && t.ends_with("/)") {
            if let Some((name, _)) = t.split_once(" (qmd://") {
                out.push(Collection {
                    name: name.to_string(),
                    files: 0,
                    updated: String::new(),
                });
            }
        } else if let Some(last) = out.last_mut() {
            if let Some(n) = t.strip_prefix("Files:") {
                last.files = n
                    .trim()
                    .split_whitespace()
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
            } else if let Some(u) = t.strip_prefix("Updated:") {
                last.updated = u.trim().to_string();
            }
        }
    }
    out
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn hub_knowledge_collections() -> Result<Vec<Collection>, String> {
    blocking(|| {
        Ok(parse_collections(&run_qmd(vec![
            "collection".into(),
            "list".into(),
        ])?))
    })
    .await
}

/// Keyword search (qmd search: BM25, no model, about a second), optionally in one collection.
#[tauri::command]
pub async fn hub_knowledge_search(
    query: String,
    collection: Option<String>,
) -> Result<serde_json::Value, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(serde_json::Value::Array(vec![]));
    }
    blocking(move || {
        let mut args = vec!["search".into(), "--json".into(), "-n".into(), "30".into()];
        if let Some(c) = collection.filter(|c| !c.is_empty()) {
            args.extend(["-c".into(), c]);
        }
        args.push("--".into());
        args.push(query);
        let text = run_qmd(args)?;
        let start = text.find('[').unwrap_or(0);
        serde_json::from_str(&text[start..])
            .map_err(|e| format!("qmd answered something unexpected: {e}"))
    })
    .await
}

#[tauri::command]
pub async fn hub_knowledge_get(file: String) -> Result<String, String> {
    if !file.starts_with("qmd://") {
        return Err("Not a library document.".into());
    }
    blocking(move || {
        let mut text = run_qmd(vec!["get".into(), "--".into(), file])?;
        if text.len() > MAX_DOC_BYTES {
            let cut = (0..=MAX_DOC_BYTES)
                .rev()
                .find(|&i| text.is_char_boundary(i))
                .unwrap_or(0);
            text.truncate(cut);
            text.push_str("\n\n(The rest is cut off here; it is too long to show.)");
        }
        Ok(text)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_collection_list() {
        let text = "Collections (2):\n\nyoutube-notes (qmd://youtube-notes/)\n  Pattern:  **/*.md\n  Files:    1048\n  Updated:  15h ago\n\nlibrary (qmd://library/)\n  Files:    2463\n";
        assert_eq!(
            parse_collections(text),
            vec![
                Collection {
                    name: "youtube-notes".into(),
                    files: 1048,
                    updated: "15h ago".into()
                },
                Collection {
                    name: "library".into(),
                    files: 2463,
                    updated: String::new()
                },
            ]
        );
    }
}
