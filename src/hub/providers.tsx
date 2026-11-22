import { AlertTriangle, Check, CircleSlash, Loader, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { call } from '../bridge';
import { askUse, type ProviderModel } from './chats-facts';

// Providers panel (SwarmClaw's Providers page): every agent PandaCode knows, and whether it really
// works right now. "Works" means it answered with its model list; the backend owns both facts.

interface ProviderRow { id: string; name: string; installed: boolean; version: string }
type Health = { state: 'checking' } | { state: 'ready'; models: ProviderModel[] } | { state: 'broken'; why: string };

const USE_TEXT = { 'sign-in': 'Ask uses it (your sign-in)', free: 'Ask uses its free models', skipped: 'Ask skips it (may cost money)', fails: 'Ask skips it (its chats fail here)' } as const;
const USE_CLS = { 'sign-in': 'text-success', free: 'text-success', skipped: 'text-text-3', fails: 'text-warn' } as const;

export function Providers() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const check = useCallback(async (id: string, force: boolean) => {
    setHealth(h => ({ ...h, [id]: { state: 'checking' } }));
    try {
      const models = await call<ProviderModel[]>('list_provider_models', { provider: id, force });
      setHealth(h => ({ ...h, [id]: { state: 'ready', models } }));
    } catch (e) {
      setHealth(h => ({ ...h, [id]: { state: 'broken', why: String(e).replace(/^Error:\s*/, '') } }));
    }
  }, []);

  const load = useCallback(async (force: boolean) => {
    try {
      const all = await call<ProviderRow[]>('list_providers', { force });
      setRows(all);
      setLoaded(true);
      setError(null);
      await Promise.all(all.filter(p => p.installed).map(p => check(p.id, force)));
    } catch (e) { setError(String(e)); setLoaded(true); }
  }, [check]);
  useEffect(() => { void load(false); }, [load]);

  const installed = rows.filter(r => r.installed);
  const missing = rows.filter(r => !r.installed);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-8 py-7">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-[15px] text-text-3">Green means the agent answered just now. Red means it did not; hover for the reason.</p>
        <button type="button" onClick={() => void load(true)}
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-accent-soft px-4 py-2 text-[16px] text-accent-bright hover:bg-accent hover:text-white"><RefreshCw size={16} />Check all again</button>
      </div>
      {error && <p role="alert" title={error} className="flex items-center gap-2 text-danger"><AlertTriangle size={20} />That did not work</p>}

      {!loaded && <p role="status" className="flex items-center gap-2 text-[16px] text-text-2"><Loader size={18} className="animate-spin text-warn" />Looking for your agents (takes about 5 seconds)...</p>}
      <ul aria-label="Installed agents" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {installed.map(p => {
          const h = health[p.id] ?? { state: 'checking' as const };
          const use = h.state === 'ready' ? askUse(p.id, h.models) : null;
          return (
            <li key={p.id} aria-label={p.name} title={h.state === 'broken' ? h.why : p.version}
              className={`flex items-center gap-4 rounded-2xl border px-5 py-4 ${h.state === 'broken' ? 'border-danger bg-danger-soft' : h.state === 'ready' ? 'border-border-hi bg-surface' : 'border-border-hi bg-surface opacity-80'}`}>
              {h.state === 'checking' && <Loader size={22} role="img" aria-label="Checking" className="shrink-0 animate-spin text-warn" />}
              {h.state === 'ready' && <Check size={22} role="img" aria-label="Works" className="shrink-0 text-success" />}
              {h.state === 'broken' && <X size={22} role="img" aria-label="Not working" className="shrink-0 text-danger" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] font-semibold">{p.name}</p>
                <p className={`truncate text-[14px] ${h.state === 'broken' ? 'text-danger' : 'text-text-3'}`}>
                  {h.state === 'broken' ? h.why.split('\n')[0] : h.state === 'ready' ? `${h.models.filter(m => m.id !== 'default').length} models` : 'Checking...'}
                  {use && <span className={`ml-2 ${USE_CLS[use.kind]}`}>{use.kind === 'free' ? `Ask uses its ${use.free} free models` : USE_TEXT[use.kind]}</span>}
                </p>
              </div>
              <button type="button" aria-label={`Check ${p.name} again`} title="Check again" disabled={h.state === 'checking'} onClick={() => void check(p.id, true)}
                className="rail-btn !h-9 !w-9 shrink-0 text-text-2 hover:!text-accent-bright disabled:opacity-40"><RefreshCw size={16} /></button>
            </li>
          );
        })}
      </ul>

      {missing.length > 0 && (
        <section aria-label="Not installed">
          <p className="mb-2 text-[15px] text-text-3">Not installed on this PC</p>
          <ul className="flex flex-wrap gap-2">
            {missing.map(p => <li key={p.id} className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[15px] text-text-3"><CircleSlash size={14} />{p.name}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
