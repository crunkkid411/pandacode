// SwarmClaw's Schedules page for agents: each schedule is a PandaCode bot schedule
// (src-tauri/src/bots/schedule.rs). Bots run once, every N minutes, daily or on weekdays at a time,
// so SwarmClaw's cron line is read only in those shapes; anything else is refused in plain words.
import type { Schedule } from '../sc/types';
import { listBots } from './bot-agents';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface BotSchedule {
  id: string; botId: string; title: string; prompt: string; kind: 'once' | 'interval' | 'daily' | 'weekdays';
  intervalMinutes: number | null; timeOfDay: string | null; nextRunAt: number | null; lastRunAt: number | null; enabled: boolean; createdBy: string;
}
interface ScheduleInput { title: string; prompt: string; kind: string; intervalMinutes?: number; timeOfDay?: string; runAt?: number }

export const PREFIX = 'bs-';
const UNSUPPORTED = 'Agents run on a schedule once, every so many minutes, every day, or on weekdays at a set time. Pick one of those.';
const pad = (n: number) => String(n).padStart(2, '0');

/** A SwarmClaw cron line in the shapes bots run; null for any other line. */
export function fromCron(cron: string): Pick<ScheduleInput, 'kind' | 'intervalMinutes' | 'timeOfDay'> | null {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5 || f[2] !== '*' || f[3] !== '*') return null;
  const [m, h, , , dow] = f;
  const num = (s: string, max: number) => /^\d{1,2}$/.test(s) && Number(s) <= max ? Number(s) : null;
  const every = (s: string) => /^\*\/\d{1,4}$/.test(s) ? Number(s.slice(2)) : null;
  if (dow === '*' && every(m) && h === '*') return { kind: 'interval', intervalMinutes: every(m)! };
  if (dow === '*' && m === '0' && every(h)) return { kind: 'interval', intervalMinutes: every(h)! * 60 };
  const mm = num(m, 59), hh = num(h, 23);
  if (mm === null || hh === null) return null;
  if (dow === '*') return { kind: 'daily', timeOfDay: `${pad(hh)}:${pad(mm)}` };
  if (dow === '1-5' || dow === 'MON-FRI') return { kind: 'weekdays', timeOfDay: `${pad(hh)}:${pad(mm)}` };
  return null;
}

/** SwarmClaw's schedule form data as a bot schedule, or an error he can act on. */
export function toInput(s: Partial<Schedule>): ScheduleInput {
  const prompt = (s.taskPrompt || s.message || '').trim();
  const base = { title: (s.name ?? '').trim(), prompt };
  if (s.scheduleType === 'interval') return { ...base, kind: 'interval', intervalMinutes: Math.round((s.intervalMs ?? 0) / 60_000) };
  if (s.scheduleType === 'once') return { ...base, kind: 'once', runAt: s.runAt ?? Date.now() };
  const cron = fromCron(s.cron ?? '');
  if (!cron) throw new Error(UNSUPPORTED);
  return { ...base, ...cron };
}

const toCron = (time: string | null, days: string) => { const [h, m] = (time ?? '00:00').split(':').map(Number); return `${m} ${h} * * ${days}`; };

export function scSchedule(b: BotSchedule): Schedule {
  const timing = b.kind === 'interval' ? { scheduleType: 'interval' as const, intervalMs: (b.intervalMinutes ?? 0) * 60_000 }
    : b.kind === 'once' ? { scheduleType: 'once' as const, runAt: b.nextRunAt ?? b.lastRunAt ?? undefined }
    : { scheduleType: 'cron' as const, cron: toCron(b.timeOfDay, b.kind === 'weekdays' ? '1-5' : '*') };
  return {
    id: PREFIX + b.id, name: b.title, agentId: b.botId, taskPrompt: b.prompt, ...timing,
    status: b.enabled ? 'active' : b.kind === 'once' && b.lastRunAt ? 'completed' : 'paused',
    lastRunAt: b.lastRunAt ?? undefined, nextRunAt: b.nextRunAt ?? undefined, createdBy: b.createdBy, createdAt: 0, updatedAt: 0,
  } as unknown as Schedule;
}

/** Every agent's schedules. */
export async function botSchedules(call: Call): Promise<BotSchedule[]> {
  const bots = await listBots(call);
  const details = await Promise.all(bots.map(b => call<{ schedules: BotSchedule[] }>('bot_detail', { botId: b.id })));
  return details.flatMap(d => d.schedules);
}

export async function createBotSchedule(call: Call, s: Partial<Schedule>) {
  if (!s.agentId) throw new Error('Pick the agent that should do this.');
  return scSchedule(await call<BotSchedule>('bot_schedule_create', { botId: s.agentId, input: toInput(s) }));
}

/** SwarmClaw's timing preview: the next run, or why bots cannot run that timing. */
export function preview(s: Partial<Schedule>) {
  try {
    const input = toInput(s);
    return { ok: true, scheduleType: s.scheduleType, cadence: input.kind === 'interval' ? `Every ${input.intervalMinutes} min` : input.kind === 'once' ? 'Once' : `${input.kind === 'daily' ? 'Every day' : 'Weekdays'} at ${input.timeOfDay}`,
      timezone: null, nextRunAt: null, nextRuns: [], warnings: [], normalized: {} };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function scheduleOwner(call: Call, id: string) {
  const own = (await botSchedules(call)).find(s => s.id === id);
  if (!own) throw new Error('That schedule no longer exists.');
  return own;
}
