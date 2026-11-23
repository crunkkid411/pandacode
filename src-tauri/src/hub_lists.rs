//! Jordan's own lists for the Hub: his job list (JOBS.md, the Task Board) and his link inbox
//! (inbox.txt, the Inbox). Read only, and only these two files: the window never names a path.

const JOBS_FILE: &str = r"X:\AI-2\JOBS.md";
const INBOX_FILE: &str = r"X:\AI-2\inbox.txt";
const MAX_BYTES: u64 = 4 * 1024 * 1024;

fn file_for(name: &str) -> Result<&'static str, String> {
    match name {
        "jobs" => Ok(JOBS_FILE),
        "inbox" => Ok(INBOX_FILE),
        _ => Err(format!("The Hub has no list called {name:?}.")),
    }
}

fn read_list(path: &str) -> Result<String, String> {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        // ponytail: a missing list is an empty list, so the page shows "nothing here yet".
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(e) => return Err(format!("Could not read {path}: {e}")),
    };
    if meta.len() > MAX_BYTES {
        return Err(format!("{path} is over 4 MB, too big to show."));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("Could not read {path}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).replace("\r\n", "\n"))
}

/// The text of one of Jordan's lists: "jobs" (JOBS.md) or "inbox" (inbox.txt).
#[tauri::command]
pub async fn hub_read_list(name: String) -> Result<String, String> {
    let path = file_for(&name)?;
    tauri::async_runtime::spawn_blocking(move || read_list(path))
        .await
        .map_err(|e| e.to_string())?
}

/// `inbox` with one more waiting line: added at the end of the waiting part (before "=== DONE ===").
fn with_link(inbox: &str, line: &str) -> String {
    let inbox = inbox.replace("\r\n", "\n");
    match inbox.find("\n=== DONE ===") {
        Some(at) => {
            let (waiting, done) = inbox.split_at(at);
            format!("{}\n{line}\n{done}", waiting.trim_end_matches('\n'))
        }
        None if inbox.trim().is_empty() => format!("{line}\n"),
        None => format!("{}\n{line}\n", inbox.trim_end_matches('\n')),
    }
}

/// One clean line for inbox.txt: "link" or "link - note".
fn inbox_line(link: &str, note: &str) -> Result<String, String> {
    let (link, note) = (link.trim(), note.trim());
    if link.is_empty() {
        return Err("Paste a link first.".into());
    }
    if link.contains(char::is_whitespace) || note.contains(['\n', '\r']) {
        return Err("Put one link on its own, and the note in the note box.".into());
    }
    if link.len() + note.len() > 1000 {
        return Err("That is too long for one inbox line.".into());
    }
    Ok(if note.is_empty() {
        link.to_string()
    } else {
        format!("{link} - {note}")
    })
}

/// Adds a link (and Jordan's note on it) to his inbox.txt, waiting to be installed.
#[tauri::command]
pub async fn hub_inbox_add(link: String, note: String) -> Result<(), String> {
    let line = inbox_line(&link, &note)?;
    tauri::async_runtime::spawn_blocking(move || {
        let text = read_list(INBOX_FILE)?;
        std::fs::write(INBOX_FILE, with_link(&text, &line).replace('\n', "\r\n"))
            .map_err(|e| format!("Could not save {INBOX_FILE}: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// "Install them now": the same thing as double-clicking "Install Inbox" on the desktop
/// (one Claude Code session works through inbox.txt), in its own window.
#[tauri::command]
pub async fn hub_inbox_install() -> Result<(), String> {
    let home = std::env::var("USERPROFILE")
        .map_err(|_| "Windows did not say where your desktop is.".to_string())?;
    let bat = std::path::Path::new(&home)
        .join("Desktop")
        .join("Install Inbox.bat");
    if !bat.exists() {
        return Err(format!("{} is missing.", bat.display()));
    }
    crate::hub::quiet("cmd")
        .args(["/c", "start", "Install Inbox"])
        .arg(&bat)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not start Install Inbox: {e}"))
}

/// Only plain web links: no files, no other programs, nothing the shell could read as an option.
fn web_link(url: &str) -> Option<&str> {
    let url = url.trim();
    let ok = (url.starts_with("https://") || url.starts_with("http://"))
        && !url.contains(|c: char| c.is_whitespace() || c == '"' || c.is_control());
    ok.then_some(url)
}

/// Opens an inbox link in Jordan's default browser.
#[tauri::command]
pub async fn hub_open_link(url: String) -> Result<(), String> {
    let url = web_link(&url).ok_or("Only web links (http or https) open from here.")?;
    crate::hub::quiet("explorer")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the link: {e}"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_web_links_open() {
        assert_eq!(
            web_link(" https://github.com/a/b "),
            Some("https://github.com/a/b")
        );
        assert_eq!(web_link(r"C:\Windows\notepad.exe"), None);
        assert_eq!(web_link("file:///C:/x"), None);
        assert_eq!(web_link("https://a\" /c calc"), None);
    }

    #[test]
    fn a_new_link_goes_above_done() {
        let inbox = "# comment\n\nhttps://a\n\n\n=== DONE ===\n2026 | x\n";
        assert_eq!(
            with_link(inbox, "https://b - for thumbnails"),
            "# comment\n\nhttps://a\nhttps://b - for thumbnails\n\n=== DONE ===\n2026 | x\n"
        );
        assert_eq!(with_link("", "https://b"), "https://b\n");
        assert_eq!(
            with_link("https://a", "https://b"),
            "https://a\nhttps://b\n"
        );
    }

    #[test]
    fn inbox_lines_are_one_clean_line() {
        assert_eq!(inbox_line(" https://a ", "").unwrap(), "https://a");
        assert_eq!(
            inbox_line("https://a", "for thumbnails").unwrap(),
            "https://a - for thumbnails"
        );
        assert!(inbox_line("", "x").is_err());
        assert!(inbox_line("https://a https://b", "").is_err());
        assert!(inbox_line("https://a", "two\nlines").is_err());
    }

    use super::*;

    #[test]
    fn only_the_two_lists_are_readable() {
        assert_eq!(file_for("jobs").unwrap(), JOBS_FILE);
        assert_eq!(file_for("inbox").unwrap(), INBOX_FILE);
        assert!(file_for(r"C:\Windows\win.ini").is_err());
        assert!(file_for("../jobs").is_err());
    }

    #[test]
    fn missing_file_is_empty_and_line_ends_are_unix() {
        assert_eq!(read_list(r"X:\no-such-folder-hub\x.md").unwrap(), "");
        let p = std::env::temp_dir().join("hub-lists-test.md");
        std::fs::write(&p, "a\r\nb\r\n").unwrap();
        assert_eq!(read_list(p.to_str().unwrap()).unwrap(), "a\nb\n");
        let _ = std::fs::remove_file(p);
    }
}
