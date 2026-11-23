//! Agent templates for the Hub's "Start from a template" picker (Jordan, 2026-11-22: "Definitely take
//! the agent templates from opencompany X:\AI-2\opencompany and paperclip", Claude-Extras, plugins and
//! skills, and "hermes agents / bots should also be available").
//! Sources: agent files in his skill catalog (every harness and plugin), agent .md files under
//! Claude-Extras, opencompany's company agents (agents/*.toml + agents/prompts/*.md), and his Hermes
//! bot profiles (SOUL.md). Paperclip ships no agent templates (its companies are made by a skill).

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CATALOG: &str = r"X:\AI-2\skill-library\catalog\catalog.json";
const EXTRAS: &str = r"C:\Users\only1\Documents\AI_Local\Claude-Extras";
const COMPANIES: &str = r"X:\AI-2\opencompany\companies";
const MAX_FILE: u64 = 256 * 1024;
const MAX_FILES: usize = 20_000;
const CACHE_FOR: Duration = Duration::from_secs(300);

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    /// The file the template is read from (also its id).
    pub path: String,
    pub name: String,
    pub description: String,
    /// "Claude Code plugins", "Claude-Extras · agency-agents", "opencompany · media_company", "Hermes bot"
    pub source: String,
    /// PandaCode harness id when the template belongs to one (Hermes bots), else "".
    pub provider: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TemplateText {
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub provider: String,
}

static CACHE: Mutex<Option<(Instant, Vec<Template>)>> = Mutex::new(None);

fn hermes_profiles() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| r"C:\Users\only1\AppData\Local".into());
    Path::new(&base).join("hermes").join("profiles")
}

fn read_small(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    if meta.len() > MAX_FILE {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// (frontmatter fields name, description; body) of a markdown agent file.
pub(crate) fn front(text: &str) -> (Option<String>, Option<String>, String) {
    let t = text.trim_start_matches('\u{feff}');
    let Some(rest) = t.strip_prefix("---") else { return (None, None, t.to_string()) };
    let Some(end) = rest.find("\n---") else { return (None, None, t.to_string()) };
    let head = &rest[..end];
    let body = rest[end + 4..].trim_start_matches(['-', '\r', '\n']).to_string();
    let field = |k: &str| {
        head.lines().find_map(|l| {
            let v = l.strip_prefix(k)?.strip_prefix(':')?.trim().trim_matches(['"', '\'']).to_string();
            (!v.is_empty()).then_some(v)
        })
    };
    (field("name"), field("description"), body)
}

fn first_line(text: &str) -> String {
    text.lines()
        .map(|l| l.trim().trim_start_matches('#').trim())
        .find(|l| !l.is_empty() && !l.starts_with("MASTER RULES"))
        .unwrap_or("")
        .chars()
        .take(200)
        .collect()
}

fn walk_md(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_lowercase();
        if p.is_dir() {
            if !matches!(name.as_str(), "node_modules" | ".git" | "target" | "dist" | "build" | "vendor") {
                walk_md(&p, out);
            }
        } else if name.ends_with(".md") && !matches!(name.as_str(), "readme.md" | "skill.md" | "contributing.md" | "license.md" | "changelog.md" | "security.md") {
            out.push(p);
        }
    }
}

fn from_catalog(out: &mut Vec<Template>) {
    #[derive(serde::Deserialize)]
    struct Entry {
        kind: String,
        name: String,
        #[serde(default)]
        description: String,
        #[serde(default)]
        r#where: std::collections::BTreeMap<String, String>,
        #[serde(default)]
        paths: Vec<String>,
    }
    let Ok(json) = std::fs::read_to_string(CATALOG) else { return };
    let Ok(entries) = serde_json::from_str::<Vec<Entry>>(&json) else { return };
    for e in entries.into_iter().filter(|e| e.kind == "agent") {
        let Some(path) = e.paths.first().cloned() else { continue };
        let plugin = e.r#where.values().any(|s| s.contains("plugin"));
        let harness = e.r#where.keys().next().cloned().unwrap_or_default();
        out.push(Template { path, name: e.name, description: e.description, source: if plugin { format!("{harness} plugins") } else { harness }, provider: String::new() });
    }
}

fn from_extras(out: &mut Vec<Template>) {
    let mut files = Vec::new();
    walk_md(Path::new(EXTRAS), &mut files);
    for p in files {
        let rel = p.strip_prefix(EXTRAS).unwrap_or(&p).to_string_lossy().to_lowercase();
        if !rel.contains("agent") {
            continue; // agent files only (agency-agents, */agents/*.md)
        }
        let Some(text) = read_small(&p) else { continue };
        let (Some(name), Some(description), _) = front(&text) else { continue };
        let top = rel.split(['\\', '/']).find(|s| !s.is_empty()).unwrap_or("").to_string();
        out.push(Template { path: p.to_string_lossy().into(), name, description, source: format!("Claude-Extras · {top}"), provider: String::new() });
    }
}

fn from_opencompany(out: &mut Vec<Template>) {
    let Ok(companies) = std::fs::read_dir(COMPANIES) else { return };
    for c in companies.flatten() {
        let company = c.file_name().to_string_lossy().to_string();
        if company.starts_with('_') || company.starts_with("e2e") {
            continue;
        }
        let Ok(agents) = std::fs::read_dir(c.path().join("agents")) else { continue };
        for a in agents.flatten() {
            let p = a.path();
            if p.extension().and_then(|x| x.to_str()) != Some("toml") {
                continue;
            }
            let Some(text) = read_small(&p) else { continue };
            let Ok(v) = text.parse::<toml::Table>() else { continue };
            let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
            let id = p.file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
            let name = if s("role").is_empty() { id.replace('_', " ") } else { s("role") };
            out.push(Template { path: p.to_string_lossy().into(), name, description: s("description"), source: format!("opencompany · {}", company.replace('_', " ")), provider: String::new() });
        }
    }
}

fn from_hermes(out: &mut Vec<Template>) {
    let Ok(profiles) = std::fs::read_dir(hermes_profiles()) else { return };
    for p in profiles.flatten() {
        let soul = p.path().join("SOUL.md");
        let Some(text) = read_small(&soul) else { continue };
        let name = p.file_name().to_string_lossy().to_string();
        let description = text.lines().find(|l| l.trim_start().starts_with("You are")).map(|l| l.trim().chars().take(200).collect()).unwrap_or_else(|| first_line(&text));
        out.push(Template { path: soul.to_string_lossy().into(), name, description, source: "Hermes bot".into(), provider: "hermes".into() });
    }
}

fn load() -> Vec<Template> {
    if let Ok(cache) = CACHE.lock() {
        if let Some((at, list)) = cache.as_ref() {
            if at.elapsed() < CACHE_FOR {
                return list.clone();
            }
        }
    }
    let mut out = Vec::new();
    from_hermes(&mut out);
    from_opencompany(&mut out);
    from_catalog(&mut out);
    from_extras(&mut out);
    let mut seen = std::collections::HashSet::new();
    out.retain(|t| seen.insert(t.path.to_lowercase()));
    if let Ok(mut cache) = CACHE.lock() {
        *cache = Some((Instant::now(), out.clone()));
    }
    out
}

/// One template's full text, for filling the new-agent form.
pub(crate) fn text_of(path: &str) -> Result<TemplateText, String> {
    let p = Path::new(path);
    let known = load().into_iter().find(|t| t.path == path).ok_or("That template is no longer there.")?;
    let raw = read_small(p).ok_or("That template could not be read.")?;
    let prompt = if p.extension().and_then(|x| x.to_str()) == Some("toml") {
        // opencompany: the prompt lives in agents/prompts/<id>.md beside the .toml
        let id = p.file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
        let md = p.parent().map(|d| d.join("prompts").join(format!("{id}.md")));
        md.and_then(|m| read_small(&m)).unwrap_or(raw)
    } else {
        front(&raw).2
    };
    Ok(TemplateText { name: known.name, description: known.description, prompt: prompt.trim().to_string(), provider: known.provider })
}

#[tauri::command]
pub async fn hub_agent_templates() -> Result<Vec<Template>, String> {
    tokio::task::spawn_blocking(load).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hub_agent_template(path: String) -> Result<TemplateText, String> {
    tokio::task::spawn_blocking(move || text_of(&path)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_is_split_from_the_prompt() {
        let (n, d, body) = front("---\nname: writer\ndescription: \"Writes things\"\ntools: Read\n---\n\nYou write.\n");
        assert_eq!(n.as_deref(), Some("writer"));
        assert_eq!(d.as_deref(), Some("Writes things"));
        assert_eq!(body.trim(), "You write.");
        assert_eq!(front("no frontmatter").0, None);
    }

    #[test]
    fn first_line_skips_the_rules_pointer() {
        assert_eq!(first_line("MASTER RULES FILE: x\n\n# You are the Scout"), "You are the Scout");
    }

    /// Runs against his real folders; prints counts per source (cargo test real_templates -- --ignored --nocapture).
    #[test]
    #[ignore]
    fn real_templates() {
        let t0 = Instant::now();
        let list = load();
        let mut by: std::collections::BTreeMap<String, usize> = Default::default();
        for t in &list {
            *by.entry(t.source.split(" · ").next().unwrap_or("").to_string()).or_default() += 1;
        }
        println!("{} templates in {:?}: {by:?}", list.len(), t0.elapsed());
        let oc = list.iter().find(|t| t.source.starts_with("opencompany")).expect("opencompany");
        assert!(text_of(&oc.path).unwrap().prompt.len() > 50);
        let hb = list.iter().find(|t| t.source == "Hermes bot").expect("hermes");
        assert_eq!(text_of(&hb.path).unwrap().provider, "hermes");
    }
}
