//! Hub window (docs/plans/2026-11-22-hub-window.md): one backend owns every fact and action
//! the Hub panels show (JOBS.md J10). Panels only display these facts and send these actions.
//! Facts: free memory, the graphics card, the AI programs running, and the scheduled tasks
//! that are not Microsoft's. Actions: run a task now, switch a task on or off.

use serde::Serialize;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub(crate) const LABEL: &str = "hub";
const GPU_TIMEOUT: Duration = Duration::from_secs(3);
/// `schtasks` is a child program, so tasks are re-read at most this often (J10 rule 5).
const TASKS_MAX_AGE: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub total_mb: u64,
    pub free_mb: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub total_mb: u64,
    pub free_mb: u64,
    pub temp_c: u32,
    pub util_pct: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Proc {
    pub pid: u32,
    pub name: String,
    pub command_line: String,
    pub started_ms: u64,
    pub mem_mb: u64,
    /// `llm-server` | `agent` | `helper`
    pub kind: String,
    /// What to show: the script a python runs (`route.py`), else the program name.
    pub label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    /// Full Task Scheduler path, e.g. `\Becky Stars Refresh`.
    pub path: String,
    /// Last part of the path, for display.
    pub name: String,
    pub enabled: bool,
    /// Windows' own word: Ready, Running, Disabled, Queued...
    pub state: String,
    pub last_run: String,
    pub last_result: i64,
    pub next_run: String,
    pub action: String,
    /// Made by this Windows user (Jordan or his agents), not by another app's installer.
    pub mine: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningNow {
    pub memory: Memory,
    pub gpu: Option<Gpu>,
    pub processes: Vec<Proc>,
    pub tasks: Vec<Task>,
    /// Set when the task list could not be read, so the panel can say so instead of
    /// showing an empty list as if there were no tasks (a GUI must never lie).
    pub tasks_error: Option<String>,
    pub read_at_ms: u64,
}

struct Cache {
    system: Option<sysinfo::System>,
    tasks: Option<(Instant, Result<Vec<Task>, String>)>,
}

static CACHE: Mutex<Cache> = Mutex::new(Cache { system: None, tasks: None });

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A console program started with no visible window (LESSONS.md section 2: no flashing boxes).
pub(crate) fn quiet(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command.stdin(Stdio::null());
    command
}

/// Runs a program and returns its stdout, killing it after `timeout`.
/// Output is read on its own threads while we wait: `schtasks /v` prints more than a pipe
/// holds, and a child blocked on a full pipe never exits (found 2026-11-22).
fn run_with_timeout(mut command: Command, timeout: Duration) -> Result<String, String> {
    use std::io::Read;
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            if let Some(mut pipe) = pipe {
                let _ = pipe.read_to_end(&mut bytes);
            }
            bytes
        })
    };
    let out = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let started = Instant::now();
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("no answer after {} s", timeout.as_secs()));
            }
            None => std::thread::sleep(Duration::from_millis(25)),
        }
    };
    let stdout = String::from_utf8_lossy(&out.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&err.join().unwrap_or_default()).trim().to_string();
    if !status.success() {
        return Err(if stderr.is_empty() { stdout.trim().to_string() } else { stderr });
    }
    Ok(stdout)
}

// ---------- graphics card ----------

fn parse_nvidia_line(line: &str) -> Option<Gpu> {
    let parts: Vec<&str> = line.split(',').map(str::trim).collect();
    if parts.len() < 5 {
        return None;
    }
    Some(Gpu {
        name: parts[0].to_string(),
        total_mb: parts[1].parse().ok()?,
        free_mb: parts[2].parse().ok()?,
        temp_c: parts[3].parse().ok()?,
        util_pct: parts[4].parse().ok()?,
    })
}

pub(crate) fn gpu_facts_from(program: &str) -> Option<Gpu> {
    let mut command = quiet(program);
    command.args([
        "--query-gpu=name,memory.total,memory.free,temperature.gpu,utilization.gpu",
        "--format=csv,noheader,nounits",
    ]);
    let out = run_with_timeout(command, GPU_TIMEOUT).ok()?;
    out.lines().find_map(parse_nvidia_line)
}

// ---------- memory and processes ----------

fn classify_process(name: &str) -> Option<&'static str> {
    let stem = name.to_ascii_lowercase();
    let stem = stem.strip_suffix(".exe").unwrap_or(&stem);
    match stem {
        "llama-server" | "llama-cli" | "ollama" | "lms" => Some("llm-server"),
        "claude" | "opencode" | "vibe" | "kilo" | "hermes" | "qwen" | "codex" | "pandacode" => {
            Some("agent")
        }
        "python" | "pythonw" | "python3" | "uv" => Some("helper"),
        s if s.starts_with("becky-") => Some("helper"),
        _ => None,
    }
}

fn memory_and_processes(cache: &mut Cache) -> (Memory, Vec<Proc>) {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    if cache.system.is_none() {
        cache.system = System::new_with_specifics(sysinfo::RefreshKind::nothing()).ok();
    }
    let Some(system) = cache.system.as_mut() else {
        return (Memory { total_mb: 0, free_mb: 0 }, Vec::new());
    };
    system.refresh_memory();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_memory()
            .with_cmd(UpdateKind::OnlyIfNotSet),
    );
    let memory = Memory {
        total_mb: system.total_memory() / 1_048_576,
        free_mb: system.available_memory() / 1_048_576,
    };
    let mut processes: Vec<Proc> = system
        .processes()
        .values()
        .filter_map(|p| {
            let name = p.name().to_string_lossy().into_owned();
            let kind = classify_process(&name)?;
            let command_line = p
                .cmd()
                .iter()
                .map(|a| a.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" ");
            Some(Proc {
                pid: p.pid().as_u32(),
                label: process_label(&name, p.cmd()),
                name,
                command_line,
                started_ms: p.start_time() * 1000,
                mem_mb: p.memory() / 1_048_576,
                kind: kind.to_string(),
            })
        })
        .collect();
    processes.sort_by(|a, b| b.mem_mb.cmp(&a.mem_mb).then(a.pid.cmp(&b.pid)));
    (memory, processes)
}

// ---------- scheduled tasks ----------

/// Splits schtasks' CSV: every field quoted, `""` inside a field is one quote.
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            ('"', _) => quoted = !quoted,
            (',', false) => fields.push(std::mem::take(&mut field)),
            _ => field.push(c),
        }
    }
    fields.push(field);
    fields
}

/// Task Scheduler writes the author as `PC\user` or `user`.
fn is_mine(author: &str, user: &str) -> bool {
    let name = author.rsplit('\\').next().unwrap_or(author);
    !user.is_empty() && name.eq_ignore_ascii_case(user)
}

/// `python X:\...\route.py --serve` shows as `route.py`; `python -m http.server` as
/// `http.server`; anything else keeps its program name without `.exe`.
fn process_label(name: &str, cmd: &[std::ffi::OsString]) -> String {
    let program = name.strip_suffix(".exe").unwrap_or(name).to_string();
    let args: Vec<String> = cmd.iter().skip(1).map(|a| a.to_string_lossy().into_owned()).collect();
    let python = program.to_ascii_lowercase().starts_with("python");
    if !python {
        return program;
    }
    if let Some(i) = args.iter().position(|a| a == "-m") {
        if let Some(module) = args.get(i + 1) {
            return module.clone();
        }
    }
    args.iter()
        .find(|a| a.to_ascii_lowercase().ends_with(".py") || a.to_ascii_lowercase().ends_with(".pyw"))
        .and_then(|a| a.rsplit(['\\', '/']).next().map(str::to_string))
        .unwrap_or(program)
}

fn parse_schtasks_csv(text: &str) -> Vec<Task> {
    parse_schtasks_csv_for(text, &std::env::var("USERNAME").unwrap_or_default())
}

fn parse_schtasks_csv_for(text: &str, user: &str) -> Vec<Task> {
    let mut header: Vec<String> = Vec::new();
    let mut tasks: Vec<Task> = Vec::new();
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        let row = parse_csv_line(line);
        // The header repeats once per folder.
        if row.get(1).map(String::as_str) == Some("TaskName") {
            header = row;
            continue;
        }
        let col = |name: &str| -> String {
            header
                .iter()
                .position(|h| h == name)
                .and_then(|i| row.get(i))
                .cloned()
                .unwrap_or_default()
        };
        let path = col("TaskName");
        if path.is_empty()
            || path.to_ascii_lowercase().starts_with("\\microsoft\\")
            || tasks.iter().any(|t| t.path == path)
        {
            continue; // one row per trigger: keep the first
        }
        let state = col("Status");
        tasks.push(Task {
            name: path.rsplit('\\').next().unwrap_or(&path).to_string(),
            enabled: col("Scheduled Task State").eq_ignore_ascii_case("Enabled"),
            last_result: col("Last Result").trim().parse().unwrap_or(0),
            last_run: col("Last Run Time"),
            next_run: col("Next Run Time"),
            action: col("Task To Run"),
            mine: is_mine(&col("Author"), &user),
            state,
            path,
        });
    }
    // His own tasks first, then other apps' tasks; each group by name.
    tasks.sort_by_key(|t| (!t.mine, t.name.to_ascii_lowercase()));
    tasks
}

fn read_tasks() -> Result<Vec<Task>, String> {
    let mut command = quiet("schtasks");
    command.args(["/query", "/fo", "csv", "/v"]);
    run_with_timeout(command, Duration::from_secs(20)).map(|out| parse_schtasks_csv(&out))
}

static TASKS_REFRESHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Reads the task list on its own thread (schtasks takes about 2 s here) and stores it.
pub(crate) fn refresh_tasks_in_background() {
    use std::sync::atomic::Ordering;
    if TASKS_REFRESHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        let read = read_tasks();
        if let Ok(mut cache) = CACHE.lock() {
            cache.tasks = Some((Instant::now(), read));
        }
        TASKS_REFRESHING.store(false, Ordering::SeqCst);
    });
}

fn tasks_cached(cache: &mut Cache, force: bool) -> Result<Vec<Task>, String> {
    let fresh = matches!(&cache.tasks, Some((at, _)) if at.elapsed() < TASKS_MAX_AGE);
    if force || cache.tasks.is_none() {
        cache.tasks = Some((Instant::now(), read_tasks()));
    } else if !fresh {
        // A stale list shows at once; the new one is there on the next look (every few seconds).
        refresh_tasks_in_background();
    }
    cache.tasks.as_ref().map(|(_, r)| r.clone()).unwrap_or_else(|| Ok(Vec::new()))
}

fn check_task_path(path: &str) -> Result<(), String> {
    if !path.starts_with('\\') || path.contains('"') {
        return Err("Not a Task Scheduler path.".into());
    }
    if path.to_ascii_lowercase().starts_with("\\microsoft\\") {
        return Err("Windows' own tasks are not changed from Hub.".into());
    }
    Ok(())
}

fn schtasks(args: &[&str]) -> Result<(), String> {
    let mut command = quiet("schtasks");
    command.args(args);
    run_with_timeout(command, Duration::from_secs(20)).map(|_| ())
}

pub(crate) fn task_run_now(path: &str) -> Result<(), String> {
    check_task_path(path)?;
    schtasks(&["/run", "/tn", path])?;
    CACHE.lock().map_err(|e| e.to_string())?.tasks = None;
    Ok(())
}

pub(crate) fn task_set_enabled(path: &str, enabled: bool) -> Result<(), String> {
    check_task_path(path)?;
    let flag = if enabled { "/enable" } else { "/disable" };
    schtasks(&["/change", "/tn", path, flag])?;
    CACHE.lock().map_err(|e| e.to_string())?.tasks = None;
    Ok(())
}

pub(crate) fn running_now(force_tasks: bool) -> Result<RunningNow, String> {
    // The graphics card is asked outside the lock: it can take up to GPU_TIMEOUT.
    let gpu = gpu_facts_from("nvidia-smi");
    let mut cache = CACHE.lock().map_err(|e| e.to_string())?;
    let (memory, processes) = memory_and_processes(&mut cache);
    let (tasks, tasks_error) = match tasks_cached(&mut cache, force_tasks) {
        Ok(tasks) => (tasks, None),
        Err(error) => (Vec::new(), Some(error)),
    };
    Ok(RunningNow {
        memory,
        gpu,
        processes,
        tasks,
        tasks_error,
        read_at_ms: now_ms(),
    })
}

// ---------- Tauri commands (Hub window only) ----------

#[tauri::command]
pub async fn hub_running_now() -> Result<RunningNow, String> {
    tauri::async_runtime::spawn_blocking(|| running_now(false))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn hub_task_run_now(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || task_run_now(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn hub_task_set_enabled(path: String, enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || task_set_enabled(&path, enabled))
        .await
        .map_err(|e| e.to_string())?
}

/// Opens the Hub window, or shows and focuses it when it is already open.
pub(crate) fn open(app: &AppHandle) -> Result<(), String> {
    // The Schedules and Running-now pages need the task list; start the ~2 s read now.
    if CACHE.lock().map(|c| c.tasks.is_none()).unwrap_or(false) {
        refresh_tasks_in_background();
    }
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(app, LABEL, tauri::WebviewUrl::App("hub.html".into()))
        .title("Hub")
        .inner_size(1280.0, 860.0)
        .min_inner_size(720.0, 520.0)
        .background_color(tauri::window::Color(14, 14, 20, 255))
        .on_navigation(|url| {
            let local = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                || (cfg!(debug_assertions)
                    && url.scheme() == "http"
                    && url.host_str() == Some("127.0.0.1")
                    && url.port() == Some(1420));
            local && matches!(url.path(), "/hub.html" | "/")
        })
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_hub(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = open(&handle) {
            eprintln!("Hub window failed to open: {error}");
        }
    })
    .map_err(|e| e.to_string())
}

/// The name a Remote Control session shows on claude.ai and the Claude app: the agent's name
/// from its chat title ("Chief of Staff · You" -> "Chief of Staff").
pub(crate) fn remote_control_name(title: &str) -> String {
    let name = title.split(" · ").next().unwrap_or("").trim();
    if name.is_empty() { "Hub chat".into() } else { name.chars().take(60).collect() }
}

/// "/remote-control" in a Hub chat. Claude Code offers /remote-control only in its own terminal
/// window, not in the background mode the Hub runs it in, so this starts Claude Code's own
/// `claude remote-control` in the chat's folder, in its own window (close the window to stop it).
/// It starts in Auto (Jordan, 2026-11-23: "all Claude Code agents should start with "auto" by default").
#[tauri::command]
pub async fn hub_remote_control(state: tauri::State<'_, crate::AppState>, session_id: String) -> Result<String, String> {
    let (cwd, title) = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        let task = store.session(&session_id)?;
        (store.workspace_root(&task.project_id, Some(&session_id))?, task.title.clone())
    };
    let claude = crate::providers::executable("claude").ok_or("Claude Code is not installed.")?;
    let name = remote_control_name(&title);
    // `start` gives it its own console window, so he can see it running and close it.
    let mut command = Command::new("cmd");
    command
        .args(["/c", "start", &format!("Remote Control - {name}")])
        .arg(&claude)
        .args(["remote-control", "--name", &name, "--permission-mode", "auto"])
        .current_dir(&cwd)
        .env_remove("CLAUDECODE")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW for cmd itself; `start` opens the real window
    }
    command.spawn().map_err(|e| format!("Could not start Remote Control: {e}"))?;
    Ok(name)
}

/// True when this launch asked for the Hub (`pandacode.exe --hub`).
pub(crate) fn wants_hub<I: IntoIterator<Item = S>, S: AsRef<str>>(args: I) -> bool {
    args.into_iter().any(|a| a.as_ref() == "--hub")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_nvidia_line_reads_all_five_numbers() {
        let gpu = parse_nvidia_line("NVIDIA GeForce RTX 3070 Laptop GPU, 8192, 6011, 58, 3").unwrap();
        assert_eq!(gpu.name, "NVIDIA GeForce RTX 3070 Laptop GPU");
        assert_eq!((gpu.total_mb, gpu.free_mb, gpu.temp_c, gpu.util_pct), (8192, 6011, 58, 3));
        assert!(parse_nvidia_line("NVIDIA, [N/A], 1, 2, 3").is_none());
    }

    #[test]
    fn gpu_facts_times_out_cleanly() {
        let started = Instant::now();
        assert!(gpu_facts_from("no-such-program-hub-test").is_none());
        assert!(started.elapsed() < GPU_TIMEOUT + Duration::from_secs(1));
    }

    #[cfg(windows)]
    #[test]
    fn hung_program_is_killed_at_the_timeout() {
        let mut command = quiet("ping");
        command.args(["-n", "30", "127.0.0.1"]);
        let started = Instant::now();
        assert!(run_with_timeout(command, Duration::from_secs(1)).is_err());
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn parse_schtasks_csv_quotes_and_commas() {
        let row = parse_csv_line(r#""a","b, c","say ""hi""","""#);
        assert_eq!(row, vec!["a", "b, c", "say \"hi\"", ""]);
    }

    const SAMPLE: &str = concat!(
        "\"HostName\",\"TaskName\",\"Next Run Time\",\"Status\",\"Logon Mode\",\"Last Run Time\",\"Last Result\",\"Author\",\"Task To Run\",\"Start In\",\"Comment\",\"Scheduled Task State\"\r\n",
        "\"PC\",\"\\Becky Stars Refresh\",\"11/23/2026 6:30:00 AM\",\"Ready\",\"Interactive only\",\"11/22/2026 6:30:01 AM\",\"0\",\"only1\",\"powershell -File X:\\AI-2\\bots-dots\\daily-run.ps1\",\"N/A\",\"N/A\",\"Enabled\"\r\n",
        "\"PC\",\"\\Becky Stars Refresh\",\"11/23/2026 6:30:00 AM\",\"Ready\",\"Interactive only\",\"11/22/2026 6:30:01 AM\",\"0\",\"only1\",\"second trigger row\",\"N/A\",\"N/A\",\"Enabled\"\r\n",
        "\"HostName\",\"TaskName\",\"Next Run Time\",\"Status\",\"Logon Mode\",\"Last Run Time\",\"Last Result\",\"Author\",\"Task To Run\",\"Start In\",\"Comment\",\"Scheduled Task State\"\r\n",
        "\"PC\",\"\\Microsoft\\Windows\\Defrag\\ScheduledDefrag\",\"N/A\",\"Ready\",\"x\",\"N/A\",\"0\",\"MS\",\"defrag\",\"N/A\",\"N/A\",\"Enabled\"\r\n",
        "\"PC\",\"\\HubTest\\Agent Branch Sweep\",\"N/A\",\"Disabled\",\"x\",\"11/21/2026 9:00:00 PM\",\"-2147943467\",\"only1\",\"bash agent-check.sh\",\"N/A\",\"N/A\",\"Disabled\"\r\n",
    );

    #[test]
    fn tasks_list_excludes_microsoft() {
        let tasks = parse_schtasks_csv_for(SAMPLE, "only1");
        assert_eq!(tasks.len(), 2, "{tasks:?}");
        assert!(tasks.iter().all(|t| !t.path.starts_with("\\Microsoft\\")));
    }

    #[test]
    fn tasks_keep_first_trigger_row_and_read_fields() {
        let tasks = parse_schtasks_csv_for(SAMPLE, "only1");
        let stars = tasks.iter().find(|t| t.name == "Becky Stars Refresh").unwrap();
        assert!(stars.enabled);
        assert_eq!(stars.action, "powershell -File X:\\AI-2\\bots-dots\\daily-run.ps1");
        let sweep = tasks.iter().find(|t| t.name == "Agent Branch Sweep").unwrap();
        assert_eq!(sweep.path, "\\HubTest\\Agent Branch Sweep");
        assert!(!sweep.enabled);
        assert_eq!(sweep.last_result, -2147943467);
    }

    #[test]
    fn his_tasks_come_first_and_other_apps_after() {
        let csv = SAMPLE.replace(
            "\"\\HubTest\\Agent Branch Sweep\",\"N/A\",\"Disabled\",\"x\",\"11/21/2026 9:00:00 PM\",\"-2147943467\",\"only1\"",
            "\"\\HubTest\\Agent Branch Sweep\",\"N/A\",\"Disabled\",\"x\",\"11/21/2026 9:00:00 PM\",\"-2147943467\",\"Apple Inc.\"",
        );
        let tasks = parse_schtasks_csv_for(&csv, "only1");
        assert_eq!(tasks.iter().map(|t| (t.name.as_str(), t.mine)).collect::<Vec<_>>(),
            vec![("Becky Stars Refresh", true), ("Agent Branch Sweep", false)]);
        assert!(is_mine("LAPTOP-1\\Only1", "only1"));
        assert!(!is_mine("Microsoft Corporation", "only1"));
        assert!(!is_mine("only1", ""));
    }

    #[test]
    fn python_shows_the_script_it_runs() {
        let cmd = |args: &[&str]| args.iter().map(std::ffi::OsString::from).collect::<Vec<_>>();
        assert_eq!(process_label("python.exe", &cmd(&["python", "-I", "C:\\Users\\x\\route.py", "--serve"])), "route.py");
        assert_eq!(process_label("pythonw.exe", &cmd(&["pythonw", "X:/a/b/bark-stt.pyw"])), "bark-stt.pyw");
        assert_eq!(process_label("python.exe", &cmd(&["python", "-m", "http.server"])), "http.server");
        assert_eq!(process_label("python.exe", &cmd(&["python"])), "python");
        assert_eq!(process_label("llama-server.exe", &cmd(&["llama-server", "-m", "x.gguf"])), "llama-server");
    }

    #[test]
    fn classify_process_by_name() {
        assert_eq!(classify_process("llama-server.exe"), Some("llm-server"));
        assert_eq!(classify_process("claude.exe"), Some("agent"));
        assert_eq!(classify_process("python.exe"), Some("helper"));
        assert_eq!(classify_process("becky-transcribe.exe"), Some("helper"));
        assert_eq!(classify_process("notepad.exe"), None);
    }

    #[test]
    fn microsoft_and_odd_paths_are_refused() {
        assert!(check_task_path("\\Microsoft\\Windows\\Defrag\\ScheduledDefrag").is_err());
        assert!(check_task_path("Becky Stars Refresh").is_err());
        assert!(check_task_path("\\x\" /delete").is_err());
        assert!(check_task_path("\\HubTest\\Hub Test Task").is_ok());
    }

    #[test]
    fn wants_hub_only_with_the_flag() {
        assert!(wants_hub(["pandacode.exe", "--hub"]));
        assert_eq!(remote_control_name("Chief of Staff · You"), "Chief of Staff");
        assert_eq!(remote_control_name("Fix the scout"), "Fix the scout");
        assert_eq!(remote_control_name(""), "Hub chat");
        assert!(!wants_hub(["pandacode.exe"]));
    }

    /// Reads this PC for real. Run by hand: `cargo test hub::tests::live -- --ignored`.
    #[test]
    #[ignore]
    fn live_running_now_reads_this_pc() {
        let now = running_now(true).unwrap();
        assert!(now.memory.total_mb > 30_000, "{:?}", now.memory);
        assert!(now.tasks_error.is_none(), "{:?}", now.tasks_error);
        assert!(!now.tasks.is_empty());
        eprintln!("gpu={:?} processes={} tasks={}", now.gpu, now.processes.len(), now.tasks.len());
    }

    /// Creates, switches, runs and deletes a real test task. Run by hand with `--ignored`.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn live_task_actions_handle_spaces_and_folders() {
        let path = "\\HubTest\\Hub Test Task";
        let _ = schtasks(&["/delete", "/tn", path, "/f"]);
        schtasks(&[
            "/create", "/tn", path, "/tr", "cmd /c exit 0", "/sc", "once", "/st", "23:59", "/sd",
            "12/31/2099", "/f",
        ])
        .unwrap();
        let find = || {
            running_now(true)
                .unwrap()
                .tasks
                .into_iter()
                .find(|t| t.path == path)
                .expect("test task listed")
        };
        task_set_enabled(path, false).unwrap();
        assert!(!find().enabled);
        task_set_enabled(path, true).unwrap();
        assert!(find().enabled);
        let before = find().last_run;
        task_run_now(path).unwrap();
        std::thread::sleep(Duration::from_secs(3));
        let after = find().last_run;
        schtasks(&["/delete", "/tn", path, "/f"]).unwrap();
        let _ = schtasks(&["/delete", "/tn", "\\HubTest", "/f"]);
        assert_ne!(before, after, "run-now should change Last Run Time");
    }
}

/// Jordan's visual style guide, made by an earlier agent as one self-contained HTML page (2026-11-17).
const STYLE_GUIDE_FILE: &str = r"X:\AI-2\visual-style-menu\visual-style-menu.html";
/// The app's own address for Hub pages that are files on disk; the Hub shows them in a frame.
/// On Windows the page is reached as http://hubpage.localhost/<name>. tauri.conf.json allows
/// framing only this address.
pub(crate) const PAGE_SCHEME: &str = "hubpage";

/// Answers one request to the hubpage address. Only the named pages are served, never a path
/// from the request, so nothing else on disk can be read through it.
pub(crate) fn page(path: &str) -> tauri::http::Response<Vec<u8>> {
    let file = match path {
        "/style-guide" => STYLE_GUIDE_FILE,
        _ => return tauri::http::Response::builder().status(404).body(b"Not a Hub page".to_vec()).unwrap_or_default(),
    };
    match std::fs::read(file) {
        Ok(body) => tauri::http::Response::builder()
            .header("Content-Type", "text/html; charset=utf-8")
            .body(body)
            .unwrap_or_default(),
        Err(error) => tauri::http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(format!("The style guide file could not be read: {STYLE_GUIDE_FILE} ({error})").into_bytes())
            .unwrap_or_default(),
    }
}

#[cfg(test)]
mod page_tests {
    use super::*;

    #[test]
    fn serves_the_style_guide_and_nothing_else() {
        let guide = page("/style-guide");
        assert_eq!(guide.status(), 200);
        assert!(String::from_utf8_lossy(&guide.body()[..2000]).to_lowercase().contains("<html"));
        assert_eq!(page("/../../Windows/win.ini").status(), 404);
        assert_eq!(page("/style-guide/../x").status(), 404);
    }
}
