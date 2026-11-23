//! The Hub chat box's speaker: an agent's reply read aloud with becky-tts (his local voice,
//! C:\Users\only1\bin\becky-tts.exe). One reading at a time; the WAV goes back to the window.

use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// becky-tts reloads its model every call (about 40 s here), so a long reply gets a long wait.
const TIMEOUT: Duration = Duration::from_secs(300);
/// The window sends at most 2000 characters (src/sc/lib/tts.ts); this guards the command too.
const MAX_CHARS: usize = 2000;
static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

fn speak_to_wav(text: &str) -> Result<Vec<u8>, String> {
    let text: String = text.chars().take(MAX_CHARS).collect();
    if text.trim().is_empty() {
        return Err("There is nothing to read aloud.".into());
    }
    let _one = ONE_AT_A_TIME.lock().map_err(|e| e.to_string())?;
    let dir = std::env::temp_dir().join(format!("hub-tts-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (input, output) = (dir.join("text.txt"), dir.join("speech.wav"));
    let result = (|| {
        std::fs::write(&input, &text).map_err(|e| e.to_string())?;
        let mut command = crate::hub::quiet("becky-tts");
        // The voice files are on this PC; online lookups hit a gated download and fail.
        command.env("HF_HUB_OFFLINE", "1").arg("--in").arg(&input).arg("--out").arg(&output).arg("--json");
        let mut child = command.stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| format!("becky-tts could not start: {e}"))?;
        let started = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            if started.elapsed() >= TIMEOUT {
                // becky-tts runs a Python helper; end the whole tree.
                let _ = crate::hub::quiet("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"]).status();
                let _ = child.wait();
                return Err("The voice took more than 5 minutes and was stopped.".to_string());
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        let mut report = String::new();
        if let Some(mut out) = child.stdout.take() {
            use std::io::Read;
            let _ = out.read_to_string(&mut report);
        }
        let wav = std::fs::read(&output).unwrap_or_default();
        if !status.success() || wav.len() < 100 {
            return Err(format!("The voice could not read this reply. {}", reason(&report)));
        }
        Ok(wav)
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

/// The last line of becky-tts's reason, which names the real problem.
fn reason(report: &str) -> String {
    let start = report.find('{').unwrap_or(report.len());
    serde_json::from_str::<serde_json::Value>(&report[start..])
        .ok()
        .and_then(|v| v["reason"].as_str().map(|r| r.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("").chars().take(300).collect()))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn hub_speak(text: String) -> Result<tauri::ipc::Response, String> {
    let wav = tauri::async_runtime::spawn_blocking(move || speak_to_wav(&text)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(wav))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reason_keeps_the_last_real_line() {
        let report = "noise\n{\"degraded\":true,\"reason\":\"W warn line\\nreal problem here\\n\"}";
        assert_eq!(reason(report), "real problem here");
        assert_eq!(reason("no json"), "");
    }

    #[test]
    fn empty_text_is_refused_without_starting_the_voice() {
        assert!(speak_to_wav("   ").is_err());
    }

    #[test]
    #[ignore = "runs becky-tts (about 40 s)"]
    fn becky_tts_reads_a_sentence() {
        let wav = speak_to_wav("Hello Jordan.").expect("becky-tts should speak");
        assert_eq!(&wav[..4], b"RIFF");
    }
}
