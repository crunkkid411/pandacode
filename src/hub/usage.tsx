import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { call } from '../bridge';
import { dailyWork, modelShare, short, type Ledger } from './usage-facts';

// Usage panel (SwarmClaw's Usage page): how much work Claude Code and Codex did each day, read from
// their own logs by PandaCode's usage ledger. Bars only; exact numbers on hover.
const DAYS = 14;
const COLOR = { claude: 'bg-accent', codex: 'bg-success' } as const;

export function Usage() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true);
    try { setLedger(await call<Ledger>('usage_ledger', { refresh })); setError(null); } catch (e) { setError(String(e)); }
    setBusy(false);
  }, []);
  useEffect(() => { void load(false); }, [load]);

  const now = Date.now();
  const days = ledger ? dailyWork(ledger, DAYS, now) : [];
  const top = Math.max(1, ...days.map(d => d.claude + d.codex));
  const share = ledger ? modelShare(ledger, 7, now).slice(0, 8) : [];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-7 px-8 py-7">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-[15px]"><span className={`h-3 w-3 rounded ${COLOR.claude}`} />Claude Code</span>
        <span className="flex items-center gap-2 text-[15px]"><span className={`h-3 w-3 rounded ${COLOR.codex}`} />Codex</span>
        <span className="flex-1" />
        <button type="button" disabled={busy} onClick={() => void load(true)}
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-accent-soft px-4 py-2 text-[16px] text-accent-bright hover:bg-accent hover:text-white disabled:opacity-40"><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />Read again</button>
      </div>
      {error && <p role="alert" title={error} className="flex items-center gap-2 text-danger"><AlertTriangle size={20} />{error.length < 120 ? error : 'That did not work'}</p>}

      <section aria-label="Work per day" className="rounded-2xl border border-border-hi bg-surface p-5">
        <ol className="flex h-[220px] items-end gap-2">
          {days.map(d => {
            const total = d.claude + d.codex;
            return (
              <li key={d.label} aria-label={`${d.label}: Claude ${short(d.claude)}, Codex ${short(d.codex)}`} title={`${d.label}\nClaude Code ${short(d.claude)}\nCodex ${short(d.codex)}`}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex w-full flex-col justify-end overflow-hidden rounded-md" style={{ height: `${(total / top) * 100}%`, minHeight: total ? 3 : 0 }}>
                  <div className={COLOR.codex} style={{ flexGrow: d.codex }} />
                  <div className={COLOR.claude} style={{ flexGrow: d.claude }} />
                </div>
              </li>
            );
          })}
        </ol>
        <ol aria-hidden className="mt-2 flex gap-2">
          {days.map((d, i) => <li key={d.label} className="min-w-0 flex-1 truncate text-center text-[12px] text-text-3">{i % 2 === days.length % 2 ? '' : d.label}</li>)}
        </ol>
      </section>

      <section aria-label="Models this week">
        <p className="mb-3 text-[15px] text-text-3">Which models did the work, last 7 days</p>
        {ledger && share.length === 0 && <p className="text-text-3">No Claude Code or Codex work in the last 7 days.</p>}
        <ul className="flex flex-col gap-2">
          {share.map(m => (
            <li key={`${m.provider}-${m.name}`} title={`${Math.round(m.share * 100)}%`} className="flex items-center gap-3">
              <span className="w-[260px] shrink-0 truncate text-[16px]">{m.name}</span>
              <span className="h-4 flex-1 overflow-hidden rounded bg-surface-2">
                <span className={`block h-full ${COLOR[m.provider as 'claude' | 'codex'] ?? 'bg-text-3'}`} style={{ width: `${Math.max(1, m.share * 100)}%` }} />
              </span>
              <span className="w-12 text-right tabular-nums text-[15px] text-text-2">{Math.round(m.share * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
