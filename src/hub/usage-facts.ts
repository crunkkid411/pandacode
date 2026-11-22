// Usage page facts, from PandaCode's usage ledger (src-tauri/src/usage_ledger.rs).

/** `[unixHour, modelIndex, input, cacheRead, cacheWrite, output, costUsd, savingsUsd]` */
export type LedgerRow = [number, number, number, number, number, number, number, number];
export interface LedgerModel { provider: 'claude' | 'codex'; name: string }
export interface Ledger { scannedAt: number; models: LedgerModel[]; rows: LedgerRow[] }

/** Work in one row: what was read new plus what was written. Cache reads are left out: they are
 * the same context re-read every turn and would drown everything else. */
export const work = (r: LedgerRow) => r[2] + r[4] + r[5];

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export interface Day { label: string; claude: number; codex: number }

/** The last `days` local calendar days, oldest first, with each agent's work that day. */
export function dailyWork(ledger: Ledger, days: number, nowMs: number): Day[] {
  const out: Day[] = [];
  const index = new Map<string, Day>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowMs); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const day = { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), claude: 0, codex: 0 };
    out.push(day); index.set(dayKey(d.getTime()), day);
  }
  for (const r of ledger.rows) {
    const day = index.get(dayKey(r[0] * 3600_000));
    const model = ledger.models[r[1]];
    if (day && model) day[model.provider] += work(r);
  }
  return out;
}

/** Share of the last `days` days' work per model, biggest first. */
export function modelShare(ledger: Ledger, days: number, nowMs: number): { name: string; provider: string; share: number }[] {
  const since = nowMs / 3600_000 - days * 24;
  const sums = new Map<number, number>();
  for (const r of ledger.rows) if (r[0] >= since) sums.set(r[1], (sums.get(r[1]) ?? 0) + work(r));
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...sums].map(([i, n]) => ({ name: ledger.models[i]?.name ?? '?', provider: ledger.models[i]?.provider ?? '?', share: n / total }))
    .sort((a, b) => b.share - a.share);
}

/** 1234567 -> "1.2M", for hover text only. */
export function short(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
