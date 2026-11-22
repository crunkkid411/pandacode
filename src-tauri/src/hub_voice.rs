//! Hub Voice panel: starts and stops Jordan's existing voice agent ("X:\AI-2\becky-voice-agent").
//! Gemini Live (voice Zephyr) talks in its own console window, where the conversation shows and he can
//! type instead of talk; the Groq one opens its page in the browser. One voice runs at a time.

use serde::Serialize;
use std::process::Child;
use std::sync::Mutex;

const DIR: &str = r"X:\AI-2\becky-voice-agent";
const PYTHON: &str = r"C:\ProgramData\anaconda3\envs\mark-xxxv\python.exe";

static VOICE: Mutex<Option<(String, Child)>> = Mutex::new(None);

fn script(kind: &str) -> Option<&'static str> {
    match kind {
        "gemini" => Some("voice-agent.py"),
        "groq" => Some("voice-agent-fastrtc.py"),
        _ => None,
    }
}

/// The running voice, after dropping one that ended by itself (window closed, crash).
fn running(slot: &mut Option<(String, Child)>) -> Option<String> {
    if let Some((_, child)) = slot {
        if !matches!(child.try_wait(), Ok(None)) {
            *slot = None;
        }
    }
    slot.as_ref().map(|(kind, _)| kind.clone())
}

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct VoiceStatus {
    pub running: Option<String>,
}

#[tauri::command]
pub async fn hub_voice_status() -> Result<VoiceStatus, String> {
    let mut slot = VOICE.lock().map_err(|e| e.to_string())?;
    Ok(VoiceStatus { running: running(&mut slot) })
}

#[tauri::command]
pub async fn hub_voice_start(kind: String) -> Result<VoiceStatus, String> {
    let file = script(&kind).ok_or_else(|| format!("Unknown voice {kind:?}."))?;
    let mut slot = VOICE.lock().map_err(|e| e.to_string())?;
    if let Some(now) = running(&mut slot) {
        if now == kind {
            return Ok(VoiceStatus { running: Some(now) });
        }
        return Err("Another voice is already on. Stop it first.".into());
    }
    let mut command = std::process::Command::new(PYTHON);
    command.args(["-u", file]).current_dir(DIR).env("PYTHONIOENCODING", "utf-8");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0000_0010); // CREATE_NEW_CONSOLE: the conversation window
    }
    let child = command.spawn().map_err(|e| format!("The voice agent did not start: {e}"))?;
    *slot = Some((kind.clone(), child));
    Ok(VoiceStatus { running: Some(kind) })
}

#[tauri::command]
pub async fn hub_voice_stop() -> Result<VoiceStatus, String> {
    let taken = VOICE.lock().map_err(|e| e.to_string())?.take();
    if let Some((_, mut child)) = taken {
        // Only the voice itself: jobs it handed to Claude Code or Hermes are its children and keep
        // working; the voice reads their results next time it starts (becky-voice-agent lessons.md).
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(VoiceStatus { running: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_two_known_voices_start() {
        assert_eq!(script("gemini"), Some("voice-agent.py"));
        assert_eq!(script("groq"), Some("voice-agent-fastrtc.py"));
        assert_eq!(script("calc.exe"), None);
    }
}
