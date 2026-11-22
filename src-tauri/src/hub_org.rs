//! Hub Org chart panel (SwarmClaw's org chart, on real data): every Claude Code session running now
//! (`~/.claude/sessions/<pid>.json`), what it is called, whether it is busy, its last words, and the
//! helpers (subagents) it started in the last 12 hours (`<session>/subagents/*.meta.json`).
//! Other running agents (OpenCode, Hermes, ...) come from `hub_running_now` on the page.

use serde::{Deserialize, Serialize};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const TAIL_BYTES: u64 = 256 * 1024;
const HELPER_WINDOW: Duration = Duration::from_secs(12 * 3600);
const WORKING_WINDOW: Duration = Duration::from_secs(180);
const MAX_HELPERS: usize = 30;
const WORDS: usize = 240;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Helper {
    pub id: String,
    pub description: String,
    pub agent_type: String,
    pub model: String,
    /// `working` | `done` | `quiet`
    pub state: String,
    pub last_words: String,
    pub updated_ms: u64,
    pub log: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub pid: u32,
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    /// Claude Code's own word: `busy`, `idle`, ...
    pub status: String,
    pub started_ms: u64,
    pub last_words: String,
    pub log: String,
    pub helpers: Vec<Helper>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    pid: u32,
    session_id: String,
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    started_at: u64,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Meta {
    agent_type: String,
    description: String,
    model: String,
    finished: bool,
}

fn ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Claude Code's project folder name for a working folder: every non-alphanumeric char becomes `-`.
pub(crate) fn project_dir_name(cwd: &str) -> String {
    cwd.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

fn tail(path: &Path) -> String {
    let Ok(mut file) = std::fs::File::open(path) else { return String::new() };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let _ = file.seek(SeekFrom::Start(len.saturating_sub(TAIL_BYTES)));
    let mut bytes = Vec::new();
    let _ = file.take(TAIL_BYTES).read_to_end(&mut bytes);
    String::from_utf8_lossy(&bytes).into_owned()
}

fn short(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= WORDS {
        return flat;
    }
    format!("{}...", flat.chars().take(WORDS).collect::<String>())
}

/// The newest assistant text and the newest AI title in a log's last lines.
pub(crate) fn last_words_and_title(log_tail: &str) -> (String, String) {
    let (mut words, mut title) = (String::new(), String::new());
    for line in log_tail.lines().rev() {
        if !words.is_empty() && !title.is_empty() {
            break;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        if title.is_empty() && v["type"] == "ai-title" {
            title = v["aiTitle"].as_str().unwrap_or_default().to_string();
        }
        if words.is_empty() && v["type"] == "assistant" {
            if let Some(text) = v["message"]["content"].as_array().and_then(|parts| {
                parts.iter().rev().find_map(|p| (p["type"] == "text").then(|| p["text"].as_str()).flatten())
            }) {
                if !text.trim().is_empty() {
                    words = short(text);
                }
            }
        }
    }
    (words, title)
}

fn helper_state(finished: bool, age: Duration) -> &'static str {
    if finished {
        "done"
    } else if age <= WORKING_WINDOW {
        "working"
    } else {
        "quiet"
    }
}

fn helpers(folder: &Path, now: SystemTime) -> Vec<Helper> {
    let Ok(entries) = std::fs::read_dir(folder) else { return Vec::new() };
    let mut list: Vec<Helper> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(".meta.json")?.to_string();
            let log = folder.join(format!("{id}.jsonl"));
            let modified = std::fs::metadata(&log).and_then(|m| m.modified()).ok()?;
            let age = now.duration_since(modified).unwrap_or_default();
            if age > HELPER_WINDOW {
                return None;
            }
            let meta: Meta = serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).unwrap_or_default();
            Some(Helper {
                state: helper_state(meta.finished, age).to_string(),
                last_words: last_words_and_title(&tail(&log)).0,
                updated_ms: ms(modified),
                log: log.to_string_lossy().into_owned(),
                id,
                description: meta.description,
                agent_type: meta.agent_type,
                model: meta.model,
            })
        })
        .collect();
    list.sort_by(|a, b| b.updated_ms.cmp(&a.updated_ms));
    list.truncate(MAX_HELPERS);
    list
}

fn alive(pids: &[u32]) -> Vec<u32> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let wanted: Vec<Pid> = pids.iter().map(|p| Pid::from_u32(*p)).collect();
    let Ok(mut system) = System::new_with_specifics(sysinfo::RefreshKind::nothing()) else { return Vec::new() };
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&wanted), true, ProcessRefreshKind::nothing());
    pids.iter().copied().filter(|p| system.process(Pid::from_u32(*p)).is_some()).collect()
}

pub(crate) fn sessions_in(claude_home: &Path, is_alive: impl Fn(&[u32]) -> Vec<u32>) -> Vec<Session> {
    let now = SystemTime::now();
    let registry: Vec<Registry> = std::fs::read_dir(claude_home.join("sessions"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok())
        .collect();
    let live = is_alive(&registry.iter().map(|r| r.pid).collect::<Vec<_>>());
    let mut sessions: Vec<Session> = registry
        .into_iter()
        .filter(|r| live.contains(&r.pid))
        .map(|r| {
            let project: PathBuf = claude_home.join("projects").join(project_dir_name(&r.cwd));
            let log = project.join(format!("{}.jsonl", r.session_id));
            let (last_words, title) = last_words_and_title(&tail(&log));
            let fallback = Path::new(&r.cwd).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| r.cwd.clone());
            Session {
                helpers: helpers(&project.join(&r.session_id).join("subagents"), now),
                title: if title.is_empty() { fallback } else { title },
                log: log.to_string_lossy().into_owned(),
                last_words,
                pid: r.pid,
                session_id: r.session_id,
                cwd: r.cwd,
                status: r.status,
                started_ms: r.started_at,
            }
        })
        .collect();
    sessions.sort_by(|a, b| b.started_ms.cmp(&a.started_ms));
    sessions
}

#[tauri::command]
pub async fn hub_org() -> Result<Vec<Session>, String> {
    let home = PathBuf::from(std::env::var_os("USERPROFILE").ok_or("No home folder")?).join(".claude");
    tokio::task::spawn_blocking(move || sessions_in(&home, alive)).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_match_claude_codes_projects() {
        assert_eq!(project_dir_name(r"X:\AI-2"), "X--AI-2");
        assert_eq!(project_dir_name(r"C:\Users\only1\Documents\Obsidian"), "C--Users-only1-Documents-Obsidian");
    }

    #[test]
    fn last_words_skip_tool_calls_and_find_the_title() {
        let log = [
            r#"{"type":"ai-title","aiTitle":"Hub pages"}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Building   the\nOrg chart"}]}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash"}]}}"#,
            "not json",
        ]
        .join("\n");
        assert_eq!(last_words_and_title(&log), ("Building the Org chart".into(), "Hub pages".into()));
    }

    #[test]
    fn helper_states() {
        assert_eq!(helper_state(true, Duration::from_secs(5)), "done");
        assert_eq!(helper_state(false, Duration::from_secs(60)), "working");
        assert_eq!(helper_state(false, Duration::from_secs(600)), "quiet");
    }

    #[test]
    fn reads_live_sessions_and_their_helpers_only() {
        let home = std::env::temp_dir().join(format!("hub-org-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let project = home.join("projects").join("X--AI-2");
        let sub = project.join("s1").join("subagents");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::create_dir_all(home.join("sessions")).unwrap();
        std::fs::write(home.join("sessions/1.json"), r#"{"pid":1,"sessionId":"s1","cwd":"X:\\AI-2","status":"busy","startedAt":5}"#).unwrap();
        std::fs::write(home.join("sessions/2.json"), r#"{"pid":2,"sessionId":"s2","cwd":"X:\\AI-2","status":"idle","startedAt":6}"#).unwrap();
        std::fs::write(project.join("s1.jsonl"), r#"{"type":"ai-title","aiTitle":"Build the Hub"}"#).unwrap();
        std::fs::write(sub.join("agent-a.meta.json"), r#"{"agentType":"Explore","description":"Find files","model":"haiku","finished":true}"#).unwrap();
        std::fs::write(sub.join("agent-a.jsonl"), r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Found 3"}]}}"#).unwrap();
        let list = sessions_in(&home, |pids| pids.iter().copied().filter(|p| *p == 1).collect());
        let _ = std::fs::remove_dir_all(&home);
        assert_eq!(list.len(), 1);
        assert_eq!((list[0].title.as_str(), list[0].status.as_str()), ("Build the Hub", "busy"));
        assert_eq!(list[0].helpers.len(), 1);
        assert_eq!((list[0].helpers[0].state.as_str(), list[0].helpers[0].last_words.as_str()), ("done", "Found 3"));
    }
}
