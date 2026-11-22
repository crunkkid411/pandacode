// Agents panel facts, as PandaCode's own commands send them (bots_list, schedules_list),
// and the pure rules that turn them into words. Tested by tests/hub-facts.test.mjs.

export interface HubBot { id: string; name: string; role: string; provider: string; model: string; paused: boolean; heartbeatMinutes: number; nextHeartbeatAt: number | null; lastMessage?: { role: string; text: string; at: number } | null }
export interface HubSchedule { id: string; title: string; sessionTitle: string; projectName: string; prompt: string; kind: string; intervalMinutes: number | null; timeOfDay: string | null; days: number[]; watchSessionTitle: string | null; nextRunAt: number | null; lastRunAt: number | null; enabled: boolean; runCount: number }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** How often a scheduled chat runs, in plain words. */
export function scheduleWhen(s: HubSchedule): string {
  const at = s.timeOfDay ? ` at ${s.timeOfDay}` : '';
  switch (s.kind) {
    case 'interval': {
      const m = s.intervalMinutes ?? 0;
      return m % 60 === 0 && m >= 60 ? `Every ${m / 60} h` : `Every ${m} min`;
    }
    case 'daily': return `Every day${at}`;
    case 'weekdays': return `Weekdays${at}`;
    case 'weekly': return `${s.days.map(d => DAY_NAMES[d] ?? '?').join(', ') || 'Weekly'}${at}`;
    case 'once': return 'Once';
    case 'after': return s.watchSessionTitle ? `After "${s.watchSessionTitle}"` : 'After another chat';
    default: return s.kind;
  }
}

/** "in 5 min", "in 3 h", "in 2 d", or "now" for a time (ms) at or before now. */
export function untilText(atMs: number | null, nowMs: number): string {
  if (atMs === null) return '';
  const min = Math.round((atMs - nowMs) / 60_000);
  if (min <= 0) return 'now';
  if (min < 60) return `in ${min} min`;
  if (min < 48 * 60) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / 1440)} d`;
}
