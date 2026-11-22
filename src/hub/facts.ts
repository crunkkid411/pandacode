// Facts as src-tauri/src/hub.rs sends them (serde camelCase), and the pure rules that turn a fact
// into a colour or a short label. Panels never keep their own copy of the truth: after every
// action they ask the backend again (JOBS.md J10 rule 2). Tested by tests/hub-facts.test.mjs.
export interface Memory { totalMb: number; freeMb: number }
export interface Gpu { name: string; totalMb: number; freeMb: number; tempC: number; utilPct: number }
export interface Proc { pid: number; name: string; commandLine: string; startedMs: number; memMb: number; kind: 'llm-server' | 'agent' | 'helper'; label: string }
export interface Task { path: string; name: string; enabled: boolean; state: string; lastRun: string; lastResult: number; nextRun: string; action: string; mine: boolean }
export interface RunningNowFacts { memory: Memory; gpu: Gpu | null; processes: Proc[]; tasks: Task[]; tasksError: string | null; readAtMs: number }

export type Tone = 'ok' | 'warn' | 'bad' | 'off';

/** How full a memory pool is, as a colour: green under 70% used, orange to 90%, red above. */
export function usedTone(freeMb: number, totalMb: number): Tone {
  if (totalMb <= 0) return 'bad';
  const used = 1 - freeMb / totalMb;
  return used < 0.7 ? 'ok' : used < 0.9 ? 'warn' : 'bad';
}

/** Graphics card heat: its own target is 87 C (LESSONS.md section 8). */
export function heatTone(tempC: number): Tone {
  return tempC < 75 ? 'ok' : tempC < 85 ? 'warn' : 'bad';
}

/** Windows' Last Result code as one of the five states a task row can show. */
export type TaskState = 'running' | 'ok' | 'failed' | 'never' | 'off';
export function taskState(task: Task): TaskState {
  if (task.state.toLowerCase() === 'running' || task.lastResult === 0x41301) return 'running';
  if (!task.enabled) return 'off';
  if (task.lastResult === 0x41303 || task.lastRun === 'N/A' || task.lastRun.startsWith('11/30/1999')) return 'never';
  return task.lastResult === 0 ? 'ok' : 'failed';
}

/** "11/23/2026 6:30:00 AM" as "6:30 AM" today, "Mon 6:30 AM" within a week, else "11/30". */
export function shortWhen(text: string, now = new Date()): string {
  const m = /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):\d+ (AM|PM)$/.exec(text.trim());
  if (!m) return '';
  const [, mo, d, y, h, mi, ap] = m;
  const when = new Date(Number(y), Number(mo) - 1, Number(d));
  const time = `${Number(h)}:${mi} ${ap}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((when.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return time;
  if (days > 0 && days < 7) return `${when.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${Number(mo)}/${Number(d)}`;
}

/** Megabytes as gigabytes: one decimal under 10 GB, whole numbers above. */
export const gb = (mb: number): string => (mb / 1024).toFixed(mb >= 10240 ? 0 : 1);
