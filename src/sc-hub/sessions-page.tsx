// The Hub's Projects page, in SwarmClaw's list + detail layout. (Its Sessions page, a list of past
// chats, was replaced by Running now on 2026-11-24: src/sc-hub/running-page.tsx.)
// Facts: sessions-facts.ts. Every row: the agent's face, the chat title, its project, its harness logo,
// and its state as a color AND a word. Click = pick one; Ctrl+click adds or removes one; Shift+click
// picks a range; "Open in PandaCode" and "Stop" work on the whole selection.
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import { HarnessLogo } from './harness-logo';
import { chooseFolder } from '../bridge';
import { SESSION_LOOK, type ProjectRow, type SessionRow, type SessionState } from './sessions-facts';

interface Facts { rows: SessionRow[]; projects: ProjectRow[] }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const panel = 'rounded-[20px] border border-white/[0.08] bg-white/[0.03] overflow-hidden flex flex-col min-h-[260px]';
const btn = 'px-4 py-2.5 rounded-[12px] text-[14px] font-600 cursor-pointer disabled:opacity-40 disabled:cursor-default';

function useFacts() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [failed, setFailed] = useState('');
  const load = useCallback(() => api<Facts>('GET', '/hub-sessions').then(f => { setFacts(f); setFailed(''); }).catch(e => setFailed(errorText(e))), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  return { facts, setFacts, failed };
}

export function StateTag({ state }: { state: SessionState }) {
  const look = SESSION_LOOK[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-700 whitespace-nowrap" style={{ color: look.color }}>
      <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: look.color, boxShadow: state === 'working' ? `0 0 8px ${look.color}` : undefined }} />{look.word}
    </span>
  );
}

/** A selectable list of sessions with Open and Stop for the selection. */
function SessionList({ rows, onFacts, empty }: { rows: SessionRow[]; onFacts: (f: Facts) => void; empty: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const live = selected.filter(id => rows.some(r => r.id === id));
  const pick = (e: MouseEvent, id: string) => {
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex(r => r.id === anchor.current), b = rows.findIndex(r => r.id === id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(rows.slice(lo, hi + 1).map(r => r.id));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) { setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])); return; }
    setSelected([id]);
  };
  const open = async () => {
    for (const id of live) await api('POST', `/tasks/${encodeURIComponent(id)}/open`).catch(e => toast.error(errorText(e)));
  };
  const stoppable = live.filter(id => rows.find(r => r.id === id)?.state === 'working');
  const stop = async () => {
    try { onFacts(await api<Facts>('POST', '/hub-sessions/stop', { ids: stoppable })); toast.success(`Stopped ${stoppable.length}`); }
    catch (e) { toast.error(errorText(e)); }
  };
  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[14px] text-text-2">{live.length ? `${live.length} picked` : 'Click to pick. Ctrl+click adds one, Shift+click picks a range.'}</span>
        <span className="flex-1" />
        <button type="button" disabled={!live.length} onClick={open} className={`${btn} bg-[#6d6cf0] text-white hover:brightness-110`} style={{ fontFamily: 'inherit' }}>
          Open in PandaCode{live.length > 1 ? ` (${live.length})` : ''}
        </button>
        <button type="button" disabled={!stoppable.length} onClick={stop} className={`${btn} bg-white/[0.08] text-text hover:bg-white/[0.12]`} style={{ fontFamily: 'inherit' }}>
          Stop{stoppable.length > 1 ? ` (${stoppable.length})` : ''}
        </button>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2 overflow-y-auto" aria-label="Sessions">
          {rows.map(r => {
            const on = live.includes(r.id);
            return (
              <li key={r.id}>
                <button type="button" onClick={e => pick(e, r.id)} onDoubleClick={() => api('POST', `/tasks/${encodeURIComponent(r.id)}/open`)} aria-selected={on}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-[14px] cursor-pointer transition-colors"
                  style={{ background: on ? '#2e2e36' : '#1d1d1d', border: `1px solid ${on ? '#8b8cf8' : 'rgba(255,255,255,0.08)'}`, boxShadow: `inset 4px 0 0 ${SESSION_LOOK[r.state].color}` }}>
                  <AgentAvatar seed={r.seed} name={r.agentName} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-700 text-text truncate">{r.title}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[13px] text-text-2 min-w-0">
                      <HarnessLogo provider={r.provider} size={14} />
                      <span className="truncate">{r.agentName}</span>
                      {r.projectName ? <><span aria-hidden className="text-text-3">in</span><span className="truncate text-text">{r.projectName}</span></> : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StateTag state={r.state} />
                    <span className="text-[12px] text-text-3">{ago(r.at)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 py-10 text-[15px] text-text-2 text-center">{empty}</p>}
    </div>
  );
}

export function HubProjects() {
  const { facts, setFacts, failed } = useFacts();
  const [chosen, setChosen] = useState<string | null>(null);
  if (failed && !facts) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read your projects: {failed}</p>;
  if (!facts) return null;
  const current = facts.projects.find(p => p.id === chosen) ?? facts.projects[0] ?? null;
  const addFolder = async () => {
    const path = await chooseFolder('Add a project folder to PandaCode');
    if (!path) return;
    try { setFacts(await api<Facts>('POST', '/hub-projects/add', { path })); toast.success('Project added.'); }
    catch (e) { toast.error(`Could not add that folder: ${errorText(e)}`); }
  };
  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-hidden">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Projects</h1>
          <p className="text-[14px] text-text-2 mt-1">Your project folders and each agent's own folder, with who works in each and their chats. Pick a project for an agent in its Config tab.</p>
        </div>
        <button type="button" onClick={addFolder} className={`${btn} bg-[#4ade80] text-black`}>📁 Add a project folder</button>
      </div>
      <div className="flex flex-wrap gap-4 flex-1 min-h-0">
        <section aria-label="Projects" className={panel} style={{ flex: '1 1 260px', maxWidth: 340 }}>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {facts.projects.map(p => {
              const on = current?.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setChosen(p.id)} aria-pressed={on}
                  className="w-full text-left px-4 py-3 rounded-[14px] cursor-pointer"
                  style={{ background: on ? '#2e2e36' : '#1d1d1d', border: `1px solid ${on ? '#8b8cf8' : 'rgba(255,255,255,0.08)'}` }}>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-[18px]">{p.owner ? '🤖' : '📁'}</span>
                    <span className="text-[15px] font-700 text-text truncate flex-1">{p.owner ? `${p.owner}'s own folder` : p.name}</span>
                    <span className="text-[13px] text-text-2">{p.sessions}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-text-3 truncate">{p.path}</div>
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    {p.needsYou ? <StateCount state="needs-you" n={p.needsYou} /> : null}
                    {p.working ? <StateCount state="working" n={p.working} /> : null}
                    {p.failed ? <StateCount state="failed" n={p.failed} /> : null}
                    <span className="flex -space-x-2">{p.agents.slice(0, 5).map(a => <AgentAvatar key={a.id} seed={a.seed} name={a.name} size={24} />)}</span>
                  </div>
                </button>
              );
            })}
            {!facts.projects.length ? <p className="px-3 py-8 text-[15px] text-text-2 text-center">No project folders yet. Use "Add a project folder" above.</p> : null}
          </div>
        </section>
        <section aria-label="Project" className={`${panel} p-4 gap-4`} style={{ flex: '3 1 480px' }}>
          {current ? (
            <>
              <div>
                <div className="text-[20px] font-700 text-text">{current.owner ? `${current.owner}'s own folder` : current.name}</div>
                <div className="text-[13px] text-text-3">{current.path}</div>
              </div>
              {current.agents.length ? (
                <div className="flex gap-3 flex-wrap" aria-label="Agents working here">
                  {current.agents.map(a => (
                    <span key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06]">
                      <AgentAvatar seed={a.seed} name={a.name} size={24} /><span className="text-[14px] font-600 text-text">{a.name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <SessionList key={current.id} rows={facts.rows.filter(r => r.projectId === current.id)} onFacts={setFacts} empty="No chats in this project yet." />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function StateCount({ state, n }: { state: SessionState; n: number }) {
  const look = SESSION_LOOK[state];
  return <span className="text-[12px] font-700" style={{ color: look.color }}>{n} {look.word.toLowerCase()}</span>;
}
