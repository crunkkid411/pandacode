//! The Hub's "Running now" page (Jordan, 2026-11-24: "any llama-servers, local daemons or runtimes,
//! and terminals - even if they are outside of the Hub itself. Any AI stuff running anywhere should
//! show up"). Every AI program, model server, runtime and terminal on the PC becomes ONE card: the
//! helpers a program started (node MCP servers, cmd wrappers, python workers) fold into its card,
//! so "Stop" ends the whole family. A model server whose starter has closed is marked a leftover.

use serde::Serialize;
use std::collections::HashMap;

/// One process as read from Windows (filled by hub.rs from sysinfo).
#[derive(Debug, Clone)]
pub(crate) struct RawProc {
    pub pid: u32,
    pub parent: Option<u32>,
    pub name: String,
    pub cmd: Vec<String>,
    pub cwd: String,
    pub started_ms: u64,
    pub mem_mb: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    pub pid: u32,
    pub started_ms: u64,
    /// `model` | `agent` | `job` | `runtime` | `terminal`
    pub kind: String,
    pub title: String,
    /// Model file, script, or folder: whatever tells two cards of the same kind apart.
    pub detail: String,
    /// The cards started from inside this one (a terminal running Claude Code says so).
    pub inside: Vec<String>,
    /// Memory of the whole family, in MB.
    pub mem_mb: u64,
    /// Processes in the family, this one included.
    pub count: usize,
    /// A model server or helper whose starting program has closed: nothing is using it.
    pub leftover: bool,
    /// A model server that loads onto the graphics card (llama.cpp's -ngl is not 0).
    pub on_gpu: bool,
    /// It ends itself when idle (llama-server --sleep-idle-seconds, or managed by becky-bg).
    pub self_stopping: bool,
    /// This is the Hub itself (no Stop button).
    pub is_hub: bool,
    pub command_line: String,
}

fn stem(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

/// The kind of an AI-related or terminal process by program name; None = not shown.
pub(crate) fn kind_of(name: &str) -> Option<&'static str> {
    let s = stem(name);
    match s.as_str() {
        "llama-server" | "llama-cli" | "llama-mtmd-cli" | "ollama" | "ollama_llama_server" | "lms"
        | "lm studio" | "koboldcpp" | "whisper-server" | "whisper-cli" | "sd" | "sd-server" => Some("model"),
        "claude" | "opencode" | "codex" | "gemini" | "qwen" | "kilo" | "vibe" | "hermes" | "goose"
        | "aider" | "cursor" | "pandacode" | "pandacode-hub" | "antigravity" | "antigravity ide" | "handy" => {
            Some("agent")
        }
        "becky-bg" => Some("job"),
        "python" | "pythonw" | "python3" | "uv" | "uvx" | "node" | "bun" | "deno" => Some("runtime"),
        "windowsterminal" | "powershell" | "pwsh" | "cmd" | "bash" | "wsl" | "mintty" | "wezterm-gui"
        | "alacritty" => Some("terminal"),
        _ if s.starts_with("becky-") || s.starts_with("qwen-mm") => Some("runtime"),
        _ => None,
    }
}

fn rank(kind: &str) -> u8 {
    match kind {
        "model" => 4,
        "agent" => 3,
        "job" => 2,
        "runtime" => 1,
        _ => 0,
    }
}

fn agent_title(s: &str) -> &str {
    match s {
        "claude" => "Claude Code",
        "opencode" => "OpenCode",
        "codex" => "Codex",
        "gemini" => "Gemini CLI",
        "qwen" => "Qwen Code",
        "kilo" => "Kilo Code",
        "vibe" => "Vibe",
        "hermes" => "Hermes",
        "goose" => "Goose",
        "aider" => "Aider",
        "cursor" => "Cursor",
        "pandacode" => "PandaCode",
        "pandacode-hub" => "Hub",
        "antigravity" | "antigravity ide" => "Antigravity",
        "handy" => "Handy (speech to text)",
        _ => s,
    }
}

fn model_app_title(s: &str) -> &str {
    match s {
        "lms" | "lm studio" => "LM Studio",
        "ollama" | "ollama_llama_server" => "Ollama",
        "koboldcpp" => "KoboldCpp",
        _ => "AI model server",
    }
}

/// llama.cpp loads onto the graphics card unless told `-ngl 0` (only llama.cpp servers are judged).
fn uses_gpu(cmd: &[String]) -> bool {
    let llama = cmd.first().is_some_and(|c| file_name(c).to_ascii_lowercase().starts_with("llama-"));
    llama && flag(cmd, &["-ngl", "--n-gpu-layers", "--gpu-layers"]) != Some("0")
}

fn terminal_title(s: &str) -> &str {
    match s {
        "windowsterminal" => "Windows Terminal",
        "powershell" | "pwsh" => "PowerShell",
        "cmd" => "Command Prompt",
        "bash" => "Bash",
        "wsl" => "Linux (WSL)",
        _ => s,
    }
}

/// The value after a flag: `--name "Skill picker model"` -> `Skill picker model`.
fn flag<'a>(cmd: &'a [String], names: &[&str]) -> Option<&'a str> {
    cmd.iter().position(|a| names.contains(&a.as_str())).and_then(|i| cmd.get(i + 1)).map(String::as_str)
}

fn file_name(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or(path).to_string()
}

/// `X:\models\Fara1.5-4B-Q4_K_M.gguf` -> `Fara1.5-4B-Q4_K_M`
fn model_name(cmd: &[String]) -> Option<String> {
    let path = flag(cmd, &["-m", "--model", "-hf"])?;
    let name = file_name(path);
    Some(name.strip_suffix(".gguf").unwrap_or(&name).to_string())
}

/// The script a runtime runs: `route.py`, `-m http.server`, `server.mjs`; else the program name.
fn script(p: &RawProc) -> String {
    let args = p.cmd.get(1..).unwrap_or(&[]);
    if let Some(module) = flag(args, &["-m"]) {
        return module.to_string();
    }
    const ENDS: [&str; 6] = [".py", ".pyw", ".js", ".mjs", ".cjs", ".ts"];
    args.iter()
        .filter(|a| !a.starts_with('-'))
        .find(|a| ENDS.iter().any(|e| a.to_ascii_lowercase().ends_with(e)))
        .map(|a| file_name(a))
        .or_else(|| args.iter().find(|a| !a.starts_with('-')).map(|a| file_name(a)))
        .unwrap_or_else(|| stem(&p.name))
}

fn short_folder(cwd: &str) -> String {
    let trimmed = cwd.trim_end_matches(['\\', '/']);
    if trimmed.is_empty() { String::new() } else { trimmed.to_string() }
}

/// Groups every process into cards. `hub_pid` is this app's own process.
pub(crate) fn group(procs: &[RawProc], hub_pid: u32) -> Vec<Program> {
    let by_pid: HashMap<u32, &RawProc> = procs.iter().map(|p| (p.pid, p)).collect();
    // A parent that started after its child is a reused number, not the real parent.
    let parent_of = |p: &RawProc| -> Option<&RawProc> {
        let parent = by_pid.get(&p.parent?)?;
        (parent.started_ms <= p.started_ms && parent.pid != p.pid).then_some(*parent)
    };
    let shown: HashMap<u32, &'static str> =
        procs.iter().filter_map(|p| kind_of(&p.name).map(|k| (p.pid, k))).collect();
    let nearest_shown = |p: &RawProc| -> Option<&RawProc> {
        let mut current = parent_of(p);
        for _ in 0..64 {
            let c = current?;
            if shown.contains_key(&c.pid) {
                return Some(c);
            }
            current = parent_of(c);
        }
        None
    };
    // Which card each shown process belongs to (its own pid when it is a card).
    // Inside another copy of the same app (Antigravity's many helpers, even behind a node).
    let inside_itself = |p: &RawProc| -> bool {
        let me = agent_title(&stem(&p.name)).to_string();
        let mut current = parent_of(p);
        for _ in 0..64 {
            match current {
                Some(c) if agent_title(&stem(&c.name)) == me => return true,
                Some(c) => current = parent_of(c),
                None => return false,
            }
        }
        false
    };
    let own_card = |p: &RawProc| -> bool {
        let kind = shown[&p.pid];
        match nearest_shown(p) {
            None => true,
            // A model or agent gets its own card, except inside a becky-bg job (the job's card
            // names it) or inside another copy of itself.
            Some(up) => (kind == "model" || kind == "agent") && shown[&up.pid] != "job" && !inside_itself(p),
        }
    };
    let mut card_of: HashMap<u32, u32> = HashMap::new();
    for p in procs.iter().filter(|p| shown.contains_key(&p.pid)) {
        let mut current = p;
        for _ in 0..64 {
            if own_card(current) {
                card_of.insert(p.pid, current.pid);
                break;
            }
            match nearest_shown(current) {
                Some(up) => current = up,
                None => break,
            }
        }
    }

    let mut cards: Vec<Program> = Vec::new();
    for p in procs.iter().filter(|p| card_of.get(&p.pid) == Some(&p.pid)) {
        let members: Vec<&RawProc> = procs
            .iter()
            .filter(|m| {
                card_of.get(&m.pid) == Some(&p.pid)
                    // conhost, a model's helper exe: belongs where its nearest shown ancestor belongs.
                    || (!shown.contains_key(&m.pid)
                        && nearest_shown(m).and_then(|a| card_of.get(&a.pid)) == Some(&p.pid))
            })
            .collect();
        let kind = shown[&p.pid];
        let s = stem(&p.name);
        let models: Vec<&RawProc> = members.iter().copied().filter(|m| shown.get(&m.pid) == Some(&"model")).collect();
        let (kind, title, detail) = match kind {
            "model" => match model_name(&p.cmd) {
                Some(model) => ("model", "AI model server".to_string(), model),
                None => ("model", model_app_title(&s).to_string(), String::new()),
            },
            "agent" => ("agent", agent_title(&s).to_string(), short_folder(&p.cwd)),
            "job" if p.cmd.get(1).map(String::as_str) == Some("tray") => {
                ("job", "Background jobs icon".to_string(), "becky-bg, by the clock".to_string())
            }
            "job" => {
                let name = flag(&p.cmd, &["--name"]).unwrap_or("Background job").to_string();
                match models.first() {
                    Some(m) => ("model", name, model_name(&m.cmd).unwrap_or_else(|| stem(&m.name))),
                    None => {
                        let program = p.cmd.iter().position(|a| a == "--").and_then(|i| p.cmd.get(i + 1));
                        ("job", name, program.map(|a| file_name(a)).unwrap_or_default())
                    }
                }
            }
            "runtime" => ("runtime", script(p), short_folder(&p.cwd)),
            _ => ("terminal", terminal_title(&s).to_string(), short_folder(&p.cwd)),
        };
        let starter_gone = p.parent.is_some() && parent_of(p).is_none();
        let self_stopping = (stem(&p.name) == "becky-bg" && p.cmd.get(1).map(String::as_str) != Some("tray"))
            || members.iter().any(|m| m.cmd.iter().any(|a| a == "--sleep-idle-seconds"));
        cards.push(Program {
            pid: p.pid,
            started_ms: p.started_ms,
            kind: kind.to_string(),
            title,
            detail,
            inside: Vec::new(),
            mem_mb: members.iter().map(|m| m.mem_mb).sum(),
            count: members.len(),
            // Only a model server: Python apps are started in the background on purpose
            // (run-hidden.vbs closes right after), so a closed starter means nothing for them.
            leftover: starter_gone && kind == "model" && !self_stopping,
            on_gpu: models.iter().any(|m| uses_gpu(&m.cmd)) || (shown[&p.pid] == "model" && uses_gpu(&p.cmd)),
            self_stopping,
            is_hub: members.iter().any(|m| m.pid == hub_pid),
            command_line: p.cmd.join(" "),
        });
    }
    // A card started from inside another card is listed on that card ("running Claude Code").
    let titles: HashMap<u32, String> = cards.iter().map(|c| (c.pid, c.title.clone())).collect();
    for p in procs.iter().filter(|p| card_of.get(&p.pid) == Some(&p.pid)) {
        if let Some(up) = nearest_shown(p).and_then(|u| card_of.get(&u.pid)) {
            if let (Some(name), Some(card)) = (titles.get(&p.pid), cards.iter_mut().find(|c| c.pid == *up)) {
                card.inside.push(name.clone());
            }
        }
    }
    cards.sort_by(|a, b| rank(&b.kind).cmp(&rank(&a.kind)).then(b.mem_mb.cmp(&a.mem_mb)).then(a.pid.cmp(&b.pid)));
    cards
}

/// Ends a card's whole family. Checks the number still names the same program (same start time)
/// and that it is a shown kind, so a stale page can never stop something else.
pub(crate) fn stop(pid: u32, started_ms: u64, procs: &[RawProc], hub_pid: u32) -> Result<(), String> {
    let card = group(procs, hub_pid)
        .into_iter()
        .find(|c| c.pid == pid && c.started_ms == started_ms)
        .ok_or("That program has already ended.")?;
    if card.is_hub {
        return Err("The Hub can't stop itself. Close its window instead.".into());
    }
    let mut command = crate::hub::quiet("taskkill");
    command.args(["/PID", &pid.to_string(), "/T", "/F"]);
    let out = command.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(pid: u32, parent: u32, name: &str, cmd: &str, started: u64, mem: u64) -> RawProc {
        RawProc {
            pid,
            parent: Some(parent),
            name: name.into(),
            cmd: cmd.split(' ').map(String::from).collect(),
            cwd: String::new(),
            started_ms: started,
            mem_mb: mem,
        }
    }

    /// The PC as it was on 2026-11-24 when Jordan asked "what is this llama-server?".
    fn sample() -> Vec<RawProc> {
        vec![
            p(4, 0, "explorer.exe", "explorer", 1, 100),
            // Orphaned Fara server: its starter (28272) is gone.
            p(7896, 28272, "llama-server.exe", r"llama-server.exe -m X:\m\Fara1.5-4B-Q4_K_M.gguf -ngl 99", 10, 6763),
            // becky-bg model job running the skill picker.
            p(46624, 4, "becky-bg.exe", r#"becky-bg.exe model --name Skill-picker -- llama-server.exe"#, 20, 5),
            p(46784, 46624, "llama-server.exe", r"llama-server.exe -m X:\m\d1-2B-Q4_K_M.gguf -ngl 0 --sleep-idle-seconds 600", 21, 1182),
            // LM Studio's background service (no model flag).
            p(6000, 4, "LMS.exe", "LMS.exe", 22, 40),
            p(6001, 4, "becky-bg.exe", "becky-bg.exe tray", 23, 20),
            // A terminal running Claude Code, which runs two node MCP servers and a shell.
            p(1476, 4, "WindowsTerminal.exe", "WindowsTerminal", 30, 80),
            p(1500, 1476, "OpenConsole.exe", "OpenConsole", 31, 5),
            p(1501, 1500, "pwsh.exe", "pwsh", 32, 60),
            p(1600, 1501, "claude.exe", "claude", 33, 400),
            p(1601, 1600, "node.exe", r"node C:\mcp\server.mjs", 34, 90),
            p(1602, 1600, "node.exe", r"node C:\mcp\other.js", 35, 70),
            p(1603, 1600, "bash.exe", "bash -c ls", 36, 10),
            // Antigravity and two of its own helpers.
            p(2000, 4, "Antigravity.exe", "Antigravity", 40, 300),
            p(2001, 2000, "Antigravity.exe", "Antigravity --type=gpu", 41, 200),
            // ...and one more copy behind a node helper (its swarm sidecar).
            p(2002, 2000, "node.exe", "node sidecar.js", 42, 30),
            p(2003, 2002, "Antigravity IDE.exe", "Antigravity", 43, 90),
            // The Hub itself.
            p(3000, 4, "pandacode-hub.exe", "pandacode-hub", 50, 150),
            // An orphan python worker.
            p(3100, 99999, "pythonw.exe", r"pythonw X:\a\rest-area-watch.pyw", 60, 500),
            p(5000, 4, "notepad.exe", "notepad", 70, 10),
        ]
    }

    fn find<'a>(cards: &'a [Program], pid: u32) -> &'a Program {
        cards.iter().find(|c| c.pid == pid).unwrap_or_else(|| panic!("no card {pid}: {cards:#?}"))
    }

    #[test]
    fn orphan_model_server_is_a_leftover_with_its_model_name() {
        let cards = group(&sample(), 3000);
        let fara = find(&cards, 7896);
        assert_eq!((fara.kind.as_str(), fara.detail.as_str()), ("model", "Fara1.5-4B-Q4_K_M"));
        assert!(fara.leftover && !fara.self_stopping && fara.on_gpu);
        assert_eq!(fara.mem_mb, 6763);
    }

    #[test]
    fn named_apps_get_plain_names() {
        let cards = group(&sample(), 3000);
        assert_eq!(find(&cards, 6000).title, "LM Studio");
        assert!(!find(&cards, 6000).on_gpu, "only llama.cpp flags are judged");
        let tray = find(&cards, 6001);
        assert_eq!((tray.kind.as_str(), tray.title.as_str(), tray.self_stopping), ("job", "Background jobs icon", false));
    }

    #[test]
    fn becky_bg_job_and_its_server_are_one_card_named_by_the_job() {
        let cards = group(&sample(), 3000);
        assert!(cards.iter().all(|c| c.pid != 46784), "server folded into its job");
        let job = find(&cards, 46624);
        assert_eq!((job.kind.as_str(), job.title.as_str(), job.detail.as_str()), ("model", "Skill-picker", "d1-2B-Q4_K_M"));
        assert_eq!((job.count, job.mem_mb), (2, 1187));
        assert!(job.self_stopping && !job.leftover && !job.on_gpu, "-ngl 0 = processor only");
    }

    #[test]
    fn claude_gets_its_own_card_with_its_helpers_and_the_terminal_says_so() {
        let cards = group(&sample(), 3000);
        let claude = find(&cards, 1600);
        assert_eq!(claude.title, "Claude Code");
        assert_eq!((claude.count, claude.mem_mb), (4, 570));
        let term = find(&cards, 1476);
        assert_eq!(term.kind, "terminal");
        assert_eq!(term.inside, vec!["Claude Code"]);
        assert_eq!(term.count, 3, "terminal + OpenConsole + pwsh");
        assert!(cards.iter().all(|c| c.pid != 1501 && c.pid != 1601 && c.pid != 1603));
    }

    #[test]
    fn copies_of_one_app_fold_together_and_unrelated_programs_are_hidden() {
        let cards = group(&sample(), 3000);
        assert_eq!(find(&cards, 2000).count, 4);
        assert!(cards.iter().all(|c| ![2001, 2002, 2003, 5000, 4].contains(&c.pid)));
        assert!(find(&cards, 3000).is_hub);
        // Python apps are started in the background on purpose: not a leftover.
        let py = find(&cards, 3100);
        assert_eq!((py.title.as_str(), py.leftover), ("rest-area-watch.pyw", false));
    }

    #[test]
    fn models_come_first() {
        let cards = group(&sample(), 3000);
        assert_eq!(cards[0].pid, 7896);
        assert_eq!(cards[1].pid, 46624);
    }

    #[test]
    fn a_reused_parent_number_is_not_a_parent() {
        // Parent 4 started AFTER the child: Windows reused the number.
        let procs = vec![p(4, 0, "cmd.exe", "cmd", 100, 5), p(10, 4, "llama-server.exe", "llama-server -m a.gguf", 50, 900)];
        let cards = group(&procs, 0);
        assert!(find(&cards, 10).leftover);
        assert_eq!(cards.len(), 2);
    }

    /// Prints the cards for this PC. Run by hand: `cargo test hub_programs::tests::live -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_cards_on_this_pc() {
        let now = crate::hub::running_now(false).unwrap();
        for c in &now.programs {
            eprintln!("{:8} {:>6} MB x{:<3} {}{}  [{}] {}{}", c.kind, c.mem_mb, c.count, c.title,
                if c.inside.is_empty() { String::new() } else { format!(" (running {})", c.inside.join(", ")) },
                c.detail, if c.leftover { "LEFTOVER " } else { "" }, if c.self_stopping { "self-stopping" } else { "" });
        }
        assert!(!now.programs.is_empty());
    }

    #[test]
    fn stop_refuses_stale_numbers_and_the_hub() {
        let procs = sample();
        assert!(stop(7896, 999, &procs, 3000).is_err(), "start time changed = different program");
        assert!(stop(3000, 50, &procs, 3000).unwrap_err().contains("Hub"));
        assert!(stop(5000, 70, &procs, 3000).is_err(), "notepad is not shown, never stopped");
    }
}
