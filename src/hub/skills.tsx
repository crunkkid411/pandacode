import { AlertTriangle, Bot, FileText, FolderOpen, Heart, Loader, RefreshCw, Search, Sparkles, Terminal, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { call } from '../bridge';
import { filterSkills, switchState, type KindFilter, type Skill } from './skills-facts';

// Skills panel (SwarmClaw's Skills page): Jordan's own catalog of every skill, command, agent and tool
// server on this PC, across all his harnesses. Made-for-you skills first.
const SHOW = 150;
const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'skill', label: 'Skills' }, { id: 'command', label: 'Commands' }, { id: 'agent', label: 'Agents' }, { id: 'tools', label: 'Tool servers' },
];
const KIND_ICON = { skill: Sparkles, command: Terminal, agent: Bot, tools: Wrench } as Record<string, typeof Sparkles>;
const CHIP = 'cursor-pointer rounded-lg border-none px-3 py-1.5 text-[15px]';

export function Skills() {
  const [all, setAll] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [oursOnly, setOursOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);

  const load = useCallback(async (command: 'hub_skills_list' | 'hub_skills_rebuild') => {
    setBusy(true);
    try { setAll(await call<Skill[]>(command)); setError(null); } catch (e) { setError(String(e)); }
    setBusy(false);
  }, []);
  useEffect(() => { void load('hub_skills_list'); }, [load]);

  const matches = useMemo(() => (all ? filterSkills(all, query, kind, oursOnly) : []), [all, query, kind, oursOnly]);
  const shown = matches.slice(0, SHOW);
  const keys = shown.map(s => s.path || s.name);
  const live = selected.filter(k => keys.includes(k));
  const ours = all?.filter(s => s.ours).length ?? 0;

  const pick = (e: MouseEvent, key: string) => {
    if (e.shiftKey && anchor.current && keys.includes(anchor.current)) {
      const a = keys.indexOf(anchor.current), b = keys.indexOf(key);
      setSelected(keys.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    anchor.current = key;
    if (e.ctrlKey || e.metaKey) setSelected(s => (s.includes(key) ? s.filter(x => x !== key) : [...s, key]));
    else setSelected(s => (s.length === 1 && s[0] === key ? [] : [key]));
  };
  const open = async (paths: string[], folder: boolean) => {
    try { for (const path of paths.slice(0, 10)) await call('hub_open_path', { path, folder }); setError(null); } catch (e) { setError(String(e)); }
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[280px] flex-1 items-center gap-2 rounded-xl border border-border-hi bg-surface px-4 py-2.5 focus-within:border-accent">
          <Search size={18} className="text-text-3" />
          <input aria-label="Search skills" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, what it does, or where it lives"
            className="min-w-0 flex-1 border-none bg-transparent text-[17px] text-text outline-none" />
        </label>
        <button type="button" disabled={busy} onClick={() => void load('hub_skills_rebuild')} title="Look through every agent's skill folders again (about 15 seconds)"
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-accent-soft px-4 py-2.5 text-[16px] text-accent-bright hover:bg-accent hover:text-white disabled:opacity-40">
          {busy ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}Rebuild
        </button>
      </div>

      <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={oursOnly} onClick={() => setOursOnly(v => !v)}
          className={`${CHIP} flex items-center gap-1.5 ${oursOnly ? 'bg-success text-black' : 'bg-success-soft text-success'}`}><Heart size={15} />Made for you ({ours})</button>
        {KINDS.map(k => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
            className={`${CHIP} ${kind === k.id ? 'bg-accent text-white' : 'bg-surface text-text-2 hover:bg-surface-2'}`}>{k.label}</button>
        ))}
        <span className="ml-auto text-[15px] tabular-nums text-text-3">{all ? `${matches.length} of ${all.length}` : ''}</span>
      </div>

      {error && <p role="alert" title={error} className="flex items-center gap-2 text-danger"><AlertTriangle size={20} />{error.length < 120 ? error : 'That did not work'}</p>}
      {!all && !error && <p role="status" className="flex items-center gap-2 text-text-2"><Loader size={18} className="animate-spin text-warn" />Reading your skill catalog...</p>}

      {live.length > 1 && (
        <div role="toolbar" aria-label="Selected skills" className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2">
          <span className="mr-auto tabular-nums text-accent-bright">{live.length}</span>
          <button type="button" onClick={() => void open(live, false)} className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-accent px-3 py-1.5 text-white"><FileText size={14} />Open {Math.min(live.length, 10)}</button>
        </div>
      )}

      <ul aria-label="Skills list" className="flex flex-col gap-2">
        {shown.map(s => {
          const key = s.path || s.name;
          const Icon = KIND_ICON[s.kind] ?? Sparkles;
          const sel = live.includes(key);
          const state = switchState(s);
          return (
            <li key={key} aria-label={s.name} aria-selected={sel} onClick={e => pick(e, key)} title={`${s.description}\n\n${s.places.join('\n')}\n${s.path}`}
              className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 ${sel ? 'border-accent bg-accent-soft' : s.ours ? 'border-success/40 bg-surface hover:bg-surface-2' : 'border-border-hi bg-surface hover:bg-surface-2'}`}>
              <Icon size={20} className={s.ours ? 'shrink-0 text-success' : 'shrink-0 text-accent-bright'} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[17px] font-semibold">
                  {s.name}
                  {s.ours && <span role="img" aria-label="Made for you" className="text-success"><Heart size={14} /></span>}
                  {state && <span className={`rounded px-1.5 text-[12px] font-normal ${state === 'on' ? 'bg-success-soft text-success' : 'bg-surface-2 text-text-3'}`}>{state === 'on' ? 'ON' : 'OFF'}</span>}
                </p>
                <p className="truncate text-[14px] text-text-3">{s.description || 'No description'}</p>
              </div>
              <span className="hidden max-w-[28%] shrink truncate text-[13px] text-text-3 md:block">{s.places.map(p => p.replace(/ \(.*\)$/, '')).join(', ')}</span>
              {s.path && <>
                <button type="button" aria-label={`Open ${s.name}`} title="Open the file" onClick={e => { e.stopPropagation(); void open([s.path], false); }}
                  className="rail-btn !h-9 !w-9 shrink-0 text-text-2 hover:!text-accent-bright"><FileText size={17} /></button>
                <button type="button" aria-label={`Show ${s.name} in its folder`} title="Show in folder" onClick={e => { e.stopPropagation(); void open([s.path], true); }}
                  className="rail-btn !h-9 !w-9 shrink-0 text-text-2 hover:!text-accent-bright"><FolderOpen size={17} /></button>
              </>}
            </li>
          );
        })}
      </ul>
      {matches.length > SHOW && <p className="text-center text-[15px] text-text-3">{matches.length - SHOW} more. Type a word to narrow it down.</p>}
    </div>
  );
}
