# Hub Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jordan gets one desktop window, "Hub", inside our PandaCode fork. It uses SwarmClaw's screens and starts with one panel, "Running now", where every fact is real and every button does exactly one real thing.

**Architecture:** The PandaCode fork (Tauri 2 + Rust) is the engine. Hub is a second Tauri window (`hub.html`). It follows the existing `agents-dock.html` pattern: its own Vite entry, opened by `WebviewWindowBuilder`. Hub's front end is React. It copies SwarmClaw's look (theme tokens, `components/ui` primitives, sidebar rail) from `X:\AI-2\swarmclaw` (MIT). Every fact and action lives in a new Rust module, `src-tauri/src/hub.rs`, which exposes Tauri commands. Panels call those commands through `src/bridge.ts` `call()`, so the browser preview mock keeps working for page tests.

**Tech Stack:** Rust 1.96, Tauri 2, `windows` 0.62 (already a dependency), React 19 + `@vitejs/plugin-react`, Tailwind 4 (SwarmClaw's tokens), Playwright.

**Spec:** "X:\AI-2\JOBS.md" J10 (wiring standard + the three lists), J78 (one window), and this chat (2026-11-22): PandaCode engine fork + SwarmClaw screens; skip tinycomputer; System One router and Antigravity's Gemini realtime come later.

## Global Constraints

- J10 rule 1: "One backend owns every fact and every action." Panels never run programs and never keep their own copy of the truth. After an action they read the facts again.
- J10 rule 3: "Every button maps to exactly one backend action, and every action has a test that really runs it". "A button with no action is not drawn." SwarmClaw nav items with no backend yet are NOT shown.
- J10 rule 5: draw nothing when nothing changes. Facts refresh every 3 s while the window is visible, and not at all while it is hidden or minimized.
- LESSONS 2: every console program started from Rust passes `CREATE_NO_WINDOW` (0x08000000). No flashing boxes.
- LESSONS 4: no wall of text. Counts are a symbol plus a number, explanations go in a hover, and every state (running / waiting / done / failed / off) has its own colour and icon. Colours come from SwarmClaw's tokens and keep one meaning each.
- LESSONS 4: Ctrl+click and Shift+click selection on every list.
- File names: kebab-case. Branch, commit, `git merge --ff-only`, push.
- Never kill a process from Hub in iteration 1 (another agent may own it). Stop buttons come in a later iteration with an owner check.

## Review Focus

1. `nvidia-smi` missing or hung (driver crash, as on 2026-11-20): the RAM facts still show, the graphics row shows a red "?" state, and the call returns within 3 s. Test: `gpu_facts_times_out_cleanly`.
2. A scheduled task name with spaces or a folder (`\Becky\Scout`): run-now and on/off still target that exact task. Test: `task_actions_handle_spaces_and_folders`.
3. Microsoft's own tasks (hundreds) must not flood the list: only tasks outside `\Microsoft\`. Test: `tasks_list_excludes_microsoft`.
4. Hub opened twice: the second open focuses the existing window instead of creating one. Test: `open_hub_twice_focuses_one_window` (page-level: one `hub` label).
5. A process that exits between listing and reading its memory: it is skipped, with no error row. Test: `processes_skip_vanished_pid`.

---

### Task 1: Fork builds and runs on this PC

**Files:** none changed. Branch `hub-window`.

- [ ] Step 1: `git checkout -b hub-window` in "X:\AI-2\pandacode" (leave the untracked `.ua/`, `VIBE-HANDOFF.md` and `dispatch_batches.js` alone).
- [ ] Step 2: `npm ci`, then `npm run build`. Expected: exit 0.
- [ ] Step 3: `cargo build --manifest-path src-tauri/Cargo.toml` through `becky-bg run`. Expected: exit 0, `src-tauri/target/debug/pandacode.exe` exists.

### Task 2: Facts backend (`hub.rs`)

**Files:** Create `src-tauri/src/hub.rs`. Modify `src-tauri/src/lib.rs` (add `mod hub;` and register the commands in `invoke_handler`).

**Interfaces (produces):**
- `#[tauri::command] async fn hub_running_now() -> Result<RunningNow, String>`
- `RunningNow { memory: Memory, gpu: Option<Gpu>, processes: Vec<Proc>, tasks: Vec<Task>, read_at_ms: u64 }`
- `Memory { total_mb: u64, free_mb: u64 }` (`GlobalMemoryStatusEx`)
- `Gpu { name: String, total_mb: u64, free_mb: u64, temp_c: u32, util_pct: u32 }` (from `nvidia-smi --query-gpu=name,memory.total,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits`, killed after 3 s)
- `Proc { pid: u32, name: String, command_line: String, started_ms: u64, mem_mb: u64, kind: String }`, where `kind` is one of `llm-server | agent | helper`. It matches the names listed in J10: llama-server, claude, opencode, vibe, kilo, hermes, python, plus becky-* tools.
- `Task { path: String, name: String, enabled: bool, state: String, last_run: String, last_result: i64, next_run: String, action: String }`. All fields are serialized as camelCase. Source: `schtasks /query /fo csv /v` (CREATE_NO_WINDOW), rows whose TaskName does not start with `\Microsoft\`, de-duplicated by path.

- [ ] Step 1: Write the unit tests in `hub.rs` `#[cfg(test)]`: `parse_nvidia_line` ("NVIDIA GeForce RTX 3070 Laptop GPU, 8192, 6011, 58, 3" → 8192/6011/58/3), `parse_schtasks_csv_quotes_and_commas`, `tasks_list_excludes_microsoft`, `classify_process` (llama-server.exe → llm-server; claude.exe → agent; python.exe → helper; notepad.exe → None), `gpu_facts_times_out_cleanly` (a missing exe gives `None` within 3 s).
- [ ] Step 2: Run `cargo test --manifest-path src-tauri/Cargo.toml hub::`. Expected: FAIL (not defined).
- [ ] Step 3: Implement. Processes come from the `sysinfo` crate, in-process with no child program (spawning PowerShell every 3 s would cost CPU), filtered by `classify_process`. Scheduled tasks are re-read every 15 s, not every 3 s, because `schtasks` is a child program.
- [ ] Step 4: Tests pass, plus one live test `#[ignore] live_running_now_reads_this_pc` run by hand: memory total ≈ 32 GB, and at least one task.
- [ ] Step 5: Commit.

### Task 3: Task actions

**Files:** Modify `src-tauri/src/hub.rs`.

**Interfaces (produces):** `hub_task_run_now(path: String) -> Result<(), String>` (`schtasks /run /tn <path>`); `hub_task_set_enabled(path: String, enabled: bool) -> Result<(), String>` (`schtasks /change /tn <path> /enable|/disable`).

- [ ] Step 1: Write `#[ignore]` live test `task_actions_handle_spaces_and_folders`. It creates `\HubTest\Hub Test Task` (runs `cmd /c exit 0`, no trigger), disables it, checks `enabled == false` through `hub_running_now`, enables it, runs it, checks `last_run` changed, then deletes the task.
- [ ] Step 2: Run it. Expected: FAIL.
- [ ] Step 3: Implement it. Refuse any path that starts with `\Microsoft\`.
- [ ] Step 4: Run it. Expected: PASS. Commit.

### Task 4: Hub window shell (SwarmClaw look)

**Files:** Create `hub.html`, `src/hub/main.tsx`, `src/hub/app.tsx`, `src/hub/theme.css` (copied from SwarmClaw `src/app/globals.css` tokens), `src/hub/ui/*` (copied SwarmClaw `components/ui` primitives the panel uses), `src/hub/sidebar.tsx` (from SwarmClaw `sidebar-rail.tsx` + `nav-item.tsx`, stripped of next/stores). Modify `vite.config.ts` (add `hub` input + react plugin), `package.json` (react, react-dom, @vitejs/plugin-react, tailwind), `src-tauri/src/hub.rs` (`open_hub` command + `--hub` launch argument), `src-tauri/src/lib.rs`, and the tray menu ("Hub").

- [ ] Step 1: Write `tests/hub.spec.ts`: `/hub.html` shows the sidebar with exactly one item ("Running now"), and the "Running now" panel is selected.
- [ ] Step 2: Run it. Expected: FAIL.
- [ ] Step 3: Implement. Add `hub.spec.ts` to `playwright.config.ts` testMatch.
- [ ] Step 4: Run it. Expected: PASS. Commit.

### Task 5: "Running now" panel

**Files:** Create `src/hub/running-now.tsx`. Modify `src/preview.ts` (sample `hub_running_now` data + record the `hub_task_*` calls).

Layout: a top strip with RAM and graphics memory as filled bars, and temperature as a coloured dot (green under 75 C, orange 75-84 C, red 85 C and up), with numbers on hover. Below it, two lists. "Models and agents": one row per process, with a kind icon, name, memory and age. "Scheduled tasks": a row with an on/off switch, name, last-result icon (✓ green / ✗ red / … running), next run, and a ▶ Run-now button. Full paths and command lines go in hover only. A row selected with Ctrl/Shift lets one button act on all selected tasks.

- [ ] Step 1: Write the page tests: `run now button sends hub_task_run_now with that task path`, `switch sends hub_task_set_enabled and the list re-reads`, `shift-click selects a range and Run all runs each`, `gpu missing shows red ? not a number`.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them. Expected: PASS. Commit.

### Task 6: Ship iteration 1

- [ ] Step 1: Release build (`npm run tauri build` through becky-bg). Expected: exe built.
- [ ] Step 2: Cold start with `--hub`, take one screenshot (no clicks), measure Hub's RAM and idle CPU over 30 s, and count console windows over 30 s (must be 0).
- [ ] Step 3: Desktop shortcut "Hub" → `pandacode.exe --hub`.
- [ ] Step 4: Update "X:\AI-2\JOBS.md" (J10, J78) and "X:\AI-2\LESSONS.md" section 4. Merge ff-only to main, push.

## Later iterations (one plan each, not started)

2. Chat panel: SwarmClaw's chat screens on PandaCode's existing sessions (Claude Code / OpenCode / Hermes).
3. Agents and schedules panels on PandaCode's `schedules` + `bots`.
4. becky tools as one-click actions (`becky-transcribe` first).
5. System One router (fix why PandaCode's router fails on x64: `src-tauri/build.rs:27`).
6. Gemini realtime voice (Antigravity's built-in, if it can be reached; otherwise "X:\AI-2\becky-voice-agent").
