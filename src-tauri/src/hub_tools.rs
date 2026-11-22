//! Hub "Tools" panel backend: becky tools as one-click jobs (docs/plans/2026-11-22-hub-window.md,
//! iteration 4). The Hub sends one action per button; this file owns every job fact.
//!
//! Rules that keep the PC usable (LESSONS.md):
//! - One job at a time; the rest wait in line. Six transcriptions at once once left the PC
//!   unusable for 2.5 h (2026-10-17).
//! - A job does not start while the graphics card is hot (2026-11-22: the card reached 92 C).
//! - No console window flashes (`hub::quiet`), and Stop ends the whole process tree.
//! - The list keeps at most `MAX_JOBS`; the oldest finished job is dropped first.

use crate::hub::{gpu_facts_from, quiet};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_JOBS: usize = 30;
/// A job waits (and says so) while the card is at or above this.
const HOT_C: u32 = 80;
const BIN: &str = r"C:\Users\only1\bin";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: u64,
    pub tool: String,
    pub file: String,
    /// waiting | running | done | failed | stopped
    pub state: String,
    /// Latest progress line, or why it is waiting / why it failed.
    pub note: String,
    pub output: String,
    pub queued_ms: u64,
    pub finished_ms: Option<u64>,
    #[serde(skip)]
    pid: Option<u32>,
}

struct Jobs {
    list: Vec<Job>,
    next_id: u64,
    worker: bool,
}

static JOBS: Mutex<Jobs> = Mutex::new(Jobs { list: Vec::new(), next_id: 1, worker: false });

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// The tools the Hub may start, and the arguments each gets. Nothing else can be run.
fn command_for(tool: &str, file: &Path, output: &Path, progress: &Path) -> Option<(PathBuf, Vec<String>)> {
    match tool {
        // One listen, no face naming (those are minutes of extra work nobody asked for here).
        "transcribe" => Some((
            Path::new(BIN).join("becky-transcribe.exe"),
            vec![
                "--format".into(), "srt".into(),
                "--forensic=false".into(),
                "--output".into(), output.display().to_string(),
                "--progress-file".into(), progress.display().to_string(),
                file.display().to_string(),
            ],
        )),
        _ => None,
    }
}

/// `video.mp4` -> `video.transcript.srt` beside it; never overwrites: `video.transcript (2).srt`.
pub(crate) fn output_path(file: &Path) -> PathBuf {
    let dir = file.parent().unwrap_or(Path::new("."));
    let stem = file.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    let mut path = dir.join(format!("{stem}.transcript.srt"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem}.transcript ({n}).srt"));
        n += 1;
    }
    path
}

fn trim(list: &mut Vec<Job>) {
    while list.len() > MAX_JOBS {
        match list.iter().position(|j| j.state != "waiting" && j.state != "running") {
            Some(i) => {
                list.remove(i);
            }
            None => break,
        }
    }
}

fn update(id: u64, f: impl FnOnce(&mut Job)) {
    if let Ok(mut jobs) = JOBS.lock() {
        if let Some(job) = jobs.list.iter_mut().find(|j| j.id == id) {
            f(job);
        }
    }
}

/// Runs waiting jobs one after another, then exits. Started by `add` when no worker runs.
fn worker() {
    loop {
        let next = {
            let mut jobs = match JOBS.lock() {
                Ok(j) => j,
                Err(_) => return,
            };
            match jobs.list.iter().find(|j| j.state == "waiting").cloned() {
                Some(job) => job,
                None => {
                    jobs.worker = false;
                    return;
                }
            }
        };
        // Wait for a cool card; a card that does not answer (no NVIDIA) does not block.
        loop {
            let hot = gpu_facts_from("nvidia-smi").filter(|g| g.temp_c >= HOT_C);
            let still_waiting = JOBS.lock().map(|j| j.list.iter().any(|x| x.id == next.id && x.state == "waiting")).unwrap_or(false);
            if !still_waiting {
                break;
            }
            match hot {
                Some(g) => update(next.id, |j| j.note = format!("Waiting: the graphics card is hot ({} C)", g.temp_c)),
                None => break,
            }
            std::thread::sleep(Duration::from_secs(15));
        }
        if JOBS.lock().map(|j| j.list.iter().any(|x| x.id == next.id && x.state == "waiting")).unwrap_or(false) {
            run(next);
        }
    }
}

fn run(job: Job) {
    let file = PathBuf::from(&job.file);
    let output = PathBuf::from(&job.output);
    let progress = std::env::temp_dir().join(format!("hub-job-{}.progress.txt", job.id));
    let log = std::env::temp_dir().join(format!("hub-job-{}.log", job.id));
    let Some((program, args)) = command_for(&job.tool, &file, &output, &progress) else {
        update(job.id, |j| { j.state = "failed".into(); j.note = "Unknown tool".into(); j.finished_ms = Some(now_ms()); });
        return;
    };
    let mut command = quiet(&program.display().to_string());
    command.args(&args);
    let log_file = std::fs::File::create(&log).ok();
    command.stdout(Stdio::null());
    command.stderr(log_file.map(Stdio::from).unwrap_or_else(Stdio::null));
    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            update(job.id, |j| { j.state = "failed".into(); j.note = format!("Could not start: {e}"); j.finished_ms = Some(now_ms()); });
            return;
        }
    };
    update(job.id, |j| { j.state = "running".into(); j.note = "Starting".into(); j.pid = Some(child.id()); });
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break Some(s),
            Ok(None) => {
                if let Ok(line) = std::fs::read_to_string(&progress) {
                    let line = line.trim().to_string();
                    if !line.is_empty() {
                        update(job.id, |j| j.note = line);
                    }
                }
                std::thread::sleep(Duration::from_millis(1000));
            }
            Err(_) => break None,
        }
    };
    let _ = std::fs::remove_file(&progress);
    let stopped = JOBS.lock().map(|j| j.list.iter().any(|x| x.id == job.id && x.state == "stopped")).unwrap_or(false);
    if stopped {
        return;
    }
    let ok = status.map(|s| s.success()).unwrap_or(false) && output.exists();
    let tail = std::fs::read_to_string(&log).ok().and_then(|t| t.lines().rev().find(|l| !l.trim().is_empty()).map(str::to_string)).unwrap_or_default();
    update(job.id, |j| {
        j.state = if ok { "done" } else { "failed" }.into();
        j.note = if ok { "Finished".into() } else if tail.is_empty() { "It stopped with an error".into() } else { tail };
        j.finished_ms = Some(now_ms());
        j.pid = None;
    });
}

pub(crate) fn add(tool: &str, file: &str) -> Result<Job, String> {
    let path = Path::new(file);
    if !path.is_file() {
        return Err(format!("File not found: {file}"));
    }
    if command_for(tool, path, path, path).is_none() {
        return Err(format!("Unknown tool: {tool}"));
    }
    let output = output_path(path);
    let (job, start_worker) = {
        let mut jobs = JOBS.lock().map_err(|e| e.to_string())?;
        // Two waiting jobs for one file would write two copies; the second click is ignored.
        if let Some(j) = jobs.list.iter().find(|j| j.file == file && j.tool == tool && (j.state == "waiting" || j.state == "running")) {
            return Ok(j.clone());
        }
        let job = Job { id: jobs.next_id, tool: tool.into(), file: file.into(), state: "waiting".into(), note: "In line".into(), output: output.display().to_string(), queued_ms: now_ms(), finished_ms: None, pid: None };
        jobs.next_id += 1;
        jobs.list.push(job.clone());
        trim(&mut jobs.list);
        let start = !jobs.worker;
        jobs.worker = true;
        (job, start)
    };
    if start_worker {
        std::thread::spawn(worker);
    }
    Ok(job)
}

pub(crate) fn stop(id: u64) -> Result<(), String> {
    let pid = {
        let mut jobs = JOBS.lock().map_err(|e| e.to_string())?;
        let job = jobs.list.iter_mut().find(|j| j.id == id).ok_or("No such job")?;
        if job.state != "waiting" && job.state != "running" {
            return Ok(());
        }
        job.state = "stopped".into();
        job.note = "Stopped".into();
        job.finished_ms = Some(now_ms());
        job.pid.take()
    };
    if let Some(pid) = pid {
        // taskkill /T ends the tool and every helper it started (python, llama-server).
        let mut kill = quiet("taskkill");
        kill.args(["/PID", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null());
        let _ = kill.status();
    }
    Ok(())
}

pub(crate) fn list() -> Vec<Job> {
    let mut jobs = JOBS.lock().map(|j| j.list.clone()).unwrap_or_default();
    jobs.reverse(); // newest first
    jobs
}

#[tauri::command]
pub async fn hub_tool_run(tool: String, file: String) -> Result<Job, String> {
    add(&tool, &file)
}

#[tauri::command]
pub async fn hub_tool_jobs() -> Result<Vec<Job>, String> {
    Ok(list())
}

#[tauri::command]
pub async fn hub_tool_stop(id: u64) -> Result<(), String> {
    stop(id)
}

/// Opens a finished job's file (or the folder holding it) in Windows' own program for it.
#[tauri::command]
pub async fn hub_open_path(path: String, folder: bool) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("Not found: {path}"));
    }
    let mut command = quiet("explorer");
    if folder {
        command.arg(format!("/select,{path}"));
    } else {
        command.arg(&path);
    }
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_never_overwrites_an_existing_transcript() {
        let dir = std::env::temp_dir().join(format!("hub-tools-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("clip.mp4");
        std::fs::write(&video, b"x").unwrap();
        assert_eq!(output_path(&video), dir.join("clip.transcript.srt"));
        std::fs::write(dir.join("clip.transcript.srt"), b"old").unwrap();
        assert_eq!(output_path(&video), dir.join("clip.transcript (2).srt"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_known_tools_can_start_and_the_file_must_exist() {
        assert!(add("transcribe", r"X:\no\such\file.mp4").unwrap_err().contains("File not found"));
        let file = std::env::temp_dir().join(format!("hub-tools-{}.mp4", now_ms()));
        std::fs::write(&file, b"x").unwrap();
        assert!(add("format-c-drive", &file.display().to_string()).unwrap_err().contains("Unknown tool"));
        std::fs::remove_file(&file).unwrap();
    }

    #[test]
    fn transcribe_runs_one_listen_without_face_naming_and_writes_srt() {
        let (program, args) = command_for("transcribe", Path::new("a.mp4"), Path::new("a.transcript.srt"), Path::new("p.txt")).unwrap();
        assert!(program.ends_with("becky-transcribe.exe"));
        assert_eq!(args, ["--format", "srt", "--forensic=false", "--output", "a.transcript.srt", "--progress-file", "p.txt", "a.mp4"]);
    }

    #[test]
    fn the_job_list_drops_the_oldest_finished_job_first() {
        let job = |id, state: &str| Job { id, tool: "t".into(), file: "f".into(), state: state.into(), note: String::new(), output: String::new(), queued_ms: 0, finished_ms: None, pid: None };
        let mut list: Vec<Job> = (0..MAX_JOBS as u64).map(|i| job(i, "done")).collect();
        list.insert(0, job(99, "running"));
        trim(&mut list);
        assert_eq!(list.len(), MAX_JOBS);
        assert_eq!(list[0].id, 99, "a running job is never dropped");
        assert_eq!(list[1].id, 1, "job 0, the oldest finished one, went");
    }
}
