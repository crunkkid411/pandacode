// Browser preview of the Hub's backend (src-tauri/src/hub.rs), for page tests only.
// Every call is recorded in `window.__hubCalls`; `window.__hubNoGpu = true` makes the
// graphics card "not answer", like a crashed driver.
import type { RunningNowFacts, Task } from './hub/facts';

const tasks: Task[] = [
  { path: '\\Becky Playlist Scout (idle)', name: 'Becky Playlist Scout (idle)', enabled: true, state: 'Ready', lastRun: '11/22/2026 3:10:00 AM', lastResult: 0, nextRun: '11/22/2026 7:10:00 AM', action: 'wscript run-hidden.vbs' },
  { path: '\\Becky Stars Refresh', name: 'Becky Stars Refresh', enabled: true, state: 'Ready', lastRun: '11/22/2026 6:30:01 AM', lastResult: 1, nextRun: '11/23/2026 6:30:00 AM', action: 'powershell -File daily-run.ps1' },
  { path: '\\Agent Branch Sweep', name: 'Agent Branch Sweep', enabled: false, state: 'Disabled', lastRun: '11/21/2026 9:00:00 PM', lastResult: 0, nextRun: 'N/A', action: 'bash agent-check.sh' },
  { path: '\\MelancholyMonitor', name: 'MelancholyMonitor', enabled: true, state: 'Running', lastRun: '11/22/2026 6:40:00 AM', lastResult: 0x41301, nextRun: '11/22/2026 6:50:00 AM', action: 'wscript run-hidden.vbs' },
];

export function invokeHub<T>(command: string, args: Record<string, any>): T {
  const w = window as any;
  (w.__hubCalls ??= []).push({ command, args });
  if (command === 'hub_running_now') {
    const facts: RunningNowFacts = {
      memory: { totalMb: 32604, freeMb: 14210 },
      gpu: w.__hubNoGpu ? null : { name: 'NVIDIA GeForce RTX 3070 Laptop GPU', totalMb: 8192, freeMb: 6011, tempC: 58, utilPct: 3 },
      processes: [
        { pid: 4120, name: 'llama-server.exe', commandLine: 'llama-server -m d1-2B.gguf --port 8092', startedMs: Date.now() - 28 * 60_000, memMb: 512, kind: 'llm-server' },
        { pid: 7311, name: 'claude.exe', commandLine: 'claude', startedMs: Date.now() - 90 * 60_000, memMb: 420, kind: 'agent' },
      ],
      // Sorted by name, like hub.rs parse_schtasks_csv.
      tasks: tasks.map(t => ({ ...t })).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
      tasksError: null,
      readAtMs: Date.now(),
    };
    return facts as T;
  }
  const task = tasks.find(t => t.path === args.path);
  if (!task) throw new Error(`No task ${args.path}`);
  if (command === 'hub_task_set_enabled') {
    task.enabled = Boolean(args.enabled);
    task.state = task.enabled ? 'Ready' : 'Disabled';
    return undefined as T;
  }
  if (command === 'hub_task_run_now') {
    task.lastRun = new Date().toLocaleString('en-US');
    return undefined as T;
  }
  throw new Error(`Unknown Hub command ${command}`);
}
