//! Hub Skills panel: Jordan's own skill catalog ("X:\AI-2\skill-library\catalog\catalog.json", built by
//! build_catalog.py from every harness on this PC), not PandaCode's separate skill library.
//! A skill is "made for you" when it lives in one of his projects or its file mentions Jordan.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;

const CATALOG: &str = r"X:\AI-2\skill-library\catalog\catalog.json";
const BUILDER: &str = r"X:\AI-2\skill-library\build_catalog.py";
const PYTHON: &str = r"C:\ProgramData\anaconda3\python.exe";
const MAX_CATALOG_BYTES: u64 = 32 * 1024 * 1024;
const MAX_SKILL_READ: usize = 64 * 1024;

#[derive(Deserialize)]
struct Entry {
    kind: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    r#where: BTreeMap<String, String>,
    #[serde(default)]
    paths: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub kind: String,
    pub name: String,
    pub description: String,
    /// "Claude Code (plugin X ON)", "Hermes", ...
    pub places: Vec<String>,
    pub path: String,
    pub ours: bool,
}

/// One parse per catalog version: the list is ~2,000 items and each "ours" check reads a file.
static CACHE: Mutex<Option<(SystemTime, Vec<Skill>)>> = Mutex::new(None);

fn mentions_jordan(path: &str) -> bool {
    use std::io::Read;
    let Ok(file) = std::fs::File::open(path) else { return false };
    let mut text = String::new();
    let _ = file.take(MAX_SKILL_READ as u64).read_to_string(&mut text);
    text.contains("Jordan")
}

pub(crate) fn skills_from(json: &str, ours: impl Fn(&str) -> bool) -> Result<Vec<Skill>, String> {
    let entries: Vec<Entry> = serde_json::from_str(json).map_err(|e| format!("The skill catalog is unreadable: {e}"))?;
    Ok(entries
        .into_iter()
        .map(|e| {
            let project = e.r#where.keys().any(|h| h.starts_with(r"X:\AI-2"));
            let path = e.paths.first().cloned().unwrap_or_default();
            Skill {
                ours: project || (!path.is_empty() && ours(&path)),
                places: e.r#where.iter().map(|(h, s)| if s.is_empty() { h.clone() } else { format!("{h} ({s})") }).collect(),
                kind: e.kind,
                name: e.name,
                description: e.description,
                path,
            }
        })
        .collect())
}

fn load() -> Result<Vec<Skill>, String> {
    let meta = std::fs::metadata(CATALOG).map_err(|_| "No skill catalog yet. Press Rebuild.".to_string())?;
    if meta.len() > MAX_CATALOG_BYTES {
        return Err("The skill catalog is too big to read.".into());
    }
    let stamp = meta.modified().map_err(|e| e.to_string())?;
    let mut cache = CACHE.lock().map_err(|e| e.to_string())?;
    if let Some((at, list)) = cache.as_ref() {
        if *at == stamp {
            return Ok(list.clone());
        }
    }
    let json = std::fs::read_to_string(CATALOG).map_err(|e| e.to_string())?;
    let list = skills_from(&json, mentions_jordan)?;
    *cache = Some((stamp, list.clone()));
    Ok(list)
}

#[tauri::command]
pub async fn hub_skills_list() -> Result<Vec<Skill>, String> {
    tokio::task::spawn_blocking(load).await.map_err(|e| e.to_string())?
}

/// Re-reads every harness's skill folders (about 15 s), then returns the new list.
#[tauri::command]
pub async fn hub_skills_rebuild() -> Result<Vec<Skill>, String> {
    tokio::task::spawn_blocking(|| {
        let dir = Path::new(BUILDER).parent().ok_or("bad builder path")?;
        let out = crate::hub::quiet(PYTHON)
            .args(["-I", BUILDER])
            .current_dir(dir)
            .env_remove("PIP_TARGET")
            .env_remove("PYTHONUSERBASE")
            .output()
            .map_err(|e| format!("The catalog builder did not start: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("The catalog builder failed").to_string());
        }
        load()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"[
      {"kind":"skill","name":"agent-firefox","description":"Browse","where":{"Claude Code":""},"paths":["C:\\a\\SKILL.md"]},
      {"kind":"agent","name":"planner","description":"Plans","where":{"Claude Code":"plugin ecc ON","Codex":""},"paths":["C:\\b.md"]},
      {"kind":"skill","name":"whoretana-dev","where":{"X:\\AI-2 project":""},"paths":["X:\\AI-2\\.claude\\skills\\w\\SKILL.md"]}
    ]"#;

    #[test]
    fn ours_is_a_project_skill_or_one_that_mentions_jordan() {
        let list = skills_from(SAMPLE, |p| p == r"C:\a\SKILL.md").unwrap();
        assert_eq!(list.iter().map(|s| s.ours).collect::<Vec<_>>(), [true, false, true]);
        assert_eq!(list[1].places, ["Claude Code (plugin ecc ON)", "Codex"]);
        assert_eq!(list[2].description, "");
    }

    #[test]
    fn a_broken_catalog_says_so() {
        assert!(skills_from("not json", |_| false).unwrap_err().contains("unreadable"));
    }
}
