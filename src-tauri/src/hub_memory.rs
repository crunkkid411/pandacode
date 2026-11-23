//! The Hub's Memory page: what Jordan's Claude Code agents remember, read from their own memory
//! files (~/.claude/memory and ~/.claude/projects/<folder>/memory, one fact per .md file with a
//! name / description / type header). Read only; the agents write these files themselves.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// ponytail: a cap so a runaway folder can't flood the page; raise it if he ever has more.
const MAX_FILES: usize = 3000;
const MAX_READ_BYTES: u64 = 512 * 1024;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFile {
    /// Where it applies: "Everywhere" or the project folder the agent worked in.
    scope: String,
    path: String,
    name: String,
    description: String,
    /// user, feedback, project or reference (empty when the file doesn't say).
    kind: String,
    modified: u64,
}

fn claude_dir() -> Result<PathBuf, String> {
    crate::agent_usage_providers::home()
        .map(|h| h.join(".claude"))
        .ok_or_else(|| "Could not find your home folder.".to_string())
}

/// "X--AI-2-becky-tools" (Claude Code's folder name for X:\AI-2\becky-tools) -> "X:\AI-2-becky-tools".
/// Lossy on purpose: Claude Code turns both \ and - into -, so the label keeps the dashes.
fn scope_label(slug: &str) -> String {
    match slug.split_once("--") {
        Some((drive, rest)) if drive.len() == 1 => format!("{drive}:\\{rest}"),
        _ => slug.to_string(),
    }
}

/// name, description and type from a memory file's --- header.
fn header(text: &str) -> (String, String, String) {
    let (mut name, mut description, mut kind) = (String::new(), String::new(), String::new());
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (name, description, kind);
    }
    for line in lines {
        let t = line.trim();
        if t == "---" {
            break;
        }
        let Some((key, value)) = t.split_once(':') else {
            continue;
        };
        let value = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        match key.trim() {
            "name" if name.is_empty() => name = value,
            "description" if description.is_empty() => description = value,
            "type" if kind.is_empty() => kind = value,
            _ => {}
        }
    }
    (name, description, kind)
}

fn read_folder(dir: &Path, scope: &str, out: &mut Vec<MemoryFile>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let path = entry.path();
        let file = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if !file.ends_with(".md") || file == "MEMORY.md" {
            continue;
        }
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        let (name, description, kind) = header(&text);
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(MemoryFile {
            scope: scope.to_string(),
            path: path.to_string_lossy().into_owned(),
            name: if name.is_empty() {
                file.trim_end_matches(".md").to_string()
            } else {
                name
            },
            description,
            kind,
            modified,
        });
    }
}

fn list_in(claude: &Path) -> Vec<MemoryFile> {
    let mut out = Vec::new();
    read_folder(&claude.join("memory"), "Everywhere", &mut out);
    if let Ok(projects) = std::fs::read_dir(claude.join("projects")) {
        for project in projects.flatten() {
            let slug = project.file_name().to_string_lossy().into_owned();
            read_folder(
                &project.path().join("memory"),
                &scope_label(&slug),
                &mut out,
            );
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

#[tauri::command]
pub async fn hub_memory_list() -> Result<Vec<MemoryFile>, String> {
    let claude = claude_dir()?;
    tauri::async_runtime::spawn_blocking(move || list_in(&claude))
        .await
        .map_err(|e| e.to_string())
}

/// True when `path` is a .md file inside a memory folder under `claude`.
fn allowed(claude: &Path, path: &Path) -> bool {
    let (Ok(root), Ok(file)) = (claude.canonicalize(), path.canonicalize()) else {
        return false;
    };
    file.starts_with(&root)
        && file.extension().and_then(|e| e.to_str()) == Some("md")
        && file
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            == Some("memory")
}

#[tauri::command]
pub async fn hub_memory_read(path: String) -> Result<String, String> {
    let claude = claude_dir()?;
    let file = PathBuf::from(&path);
    if !allowed(&claude, &file) {
        return Err("That file is not one of your agents' memories.".into());
    }
    if std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0) > MAX_READ_BYTES {
        return Err("That memory file is too big to show here; open it instead.".into());
    }
    std::fs::read_to_string(&file).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_reads_name_description_and_nested_type() {
        let text = "---\nname: aisearch-daily\ndescription: \"read daily\"\nmetadata:\n  type: project\n---\nbody";
        assert_eq!(
            header(text),
            (
                "aisearch-daily".into(),
                "read daily".into(),
                "project".into()
            )
        );
        assert_eq!(
            header("no header"),
            (String::new(), String::new(), String::new())
        );
    }

    #[test]
    fn lists_memories_skips_the_index_and_reads_only_memory_files() {
        let root = std::env::temp_dir().join(format!("hub-memory-test-{}", std::process::id()));
        let mem = root.join("projects").join("X--AI-2").join("memory");
        std::fs::create_dir_all(&mem).unwrap();
        std::fs::create_dir_all(root.join("memory")).unwrap();
        std::fs::write(mem.join("MEMORY.md"), "index").unwrap();
        std::fs::write(mem.join("a.md"), "---\nname: a fact\ntype: feedback\n---\n").unwrap();
        std::fs::write(root.join("memory").join("b.md"), "plain").unwrap();
        std::fs::write(root.join("secret.md"), "no").unwrap();
        let mut got = list_in(&root);
        got.sort_by(|x, y| x.name.cmp(&y.name));
        assert_eq!(
            got.iter()
                .map(|m| (m.scope.as_str(), m.name.as_str(), m.kind.as_str()))
                .collect::<Vec<_>>(),
            vec![("X:\\AI-2", "a fact", "feedback"), ("Everywhere", "b", "")]
        );
        assert!(allowed(&root, &mem.join("a.md")));
        assert!(!allowed(&root, &root.join("secret.md")));
        assert!(!allowed(
            &root,
            &mem.join("..").join("..").join("..").join("secret.md")
        ));
        std::fs::remove_dir_all(&root).ok();
    }
}
