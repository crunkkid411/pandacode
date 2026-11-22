import { AlertTriangle, Check, Clock, FileText, FolderOpen, Loader, Mic, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { call, chooseMedia } from '../bridge';

// Tools panel: becky tools as one-click jobs. The backend (src-tauri/src/hub_tools.rs) owns the
// job list, runs one job at a time and waits for a cool graphics card; this panel only shows the
// list and sends add / stop / open (JOBS.md J10).
const REFRESH_MS = 1500;

export interface HubJob { id: number; tool: string; file: string; state: 'waiting' | 'running' | 'done' | 'failed' | 'stopped'; note: string; output: string; queuedMs: number; finishedMs: number | null }

const TOOLS = [{ id: 'transcribe', label: 'Transcribe', hint: 'Pick videos or recordings. Each gets a subtitle file (.srt) next to it.', icon: Mic }] as const;

const LOOK: Record<HubJob['state'], { icon: ReactNode; cls: string; word: string }> = {
  waiting: { icon: <Clock size={20} />, cls: 'text-text-3', word: 'Waiting its turn' },
  running: { icon: <Loader size={20} className="animate-spin" />, cls: 'text-warn', word: 'Working' },
  done: { icon: <Check size={20} />, cls: 'text-success', word: 'Done' },
  failed: { icon: <X size={20} />, cls: 'text-danger', word: 'Failed' },
  stopped: { icon: <Square size={18} />, cls: 'text-text-3', word: 'Stopped' },
};

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const ICON_BTN = 'rail-btn !h-9 !w-9 text-text-2 hover:!text-accent-bright';

export function Tools() {
  const [jobs, setJobs] = useState<HubJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const anchor = useRef<number | null>(null);

  const read = useCallback(async () => {
    try { setJobs(await call<HubJob[]>('hub_tool_jobs')); } catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => {
    void read();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void read(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [read]);
  const act = async (work: () => Promise<unknown>) => {
    try { await work(); setError(null); } catch (e) { setError(String(e)); }
    await read();
  };

  const start = (tool: string, title: string) => act(async () => {
    for (const file of await chooseMedia(title)) await call('hub_tool_run', { tool, file });
  });

  const ids = jobs.map(j => j.id);
  const live = selected.filter(id => ids.includes(id));
  const pick = (e: MouseEvent, id: number) => {
    if (e.shiftKey && anchor.current !== null && ids.includes(anchor.current)) {
      const a = ids.indexOf(anchor.current), b = ids.indexOf(id);
      setSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
    else setSelected(s => (s.length === 1 && s[0] === id ? [] : [id]));
  };
  const stoppable = live.filter(id => { const j = jobs.find(x => x.id === id); return j && (j.state === 'waiting' || j.state === 'running'); });

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-7 px-8 py-7">
      <section aria-label="Tools" className="flex flex-wrap gap-3">
        {TOOLS.map(t => (
          <button key={t.id} type="button" title={t.hint} onClick={() => void start(t.id, `${t.label}: pick files`)}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border-hi bg-surface px-6 py-4 text-[18px] font-semibold text-text hover:border-accent hover:bg-accent-soft">
            <t.icon size={24} className="text-accent-bright" />{t.label}
          </button>
        ))}
      </section>

      {error && <p role="alert" title={error} className="flex items-center gap-2 text-danger"><AlertTriangle size={20} />{error.length < 120 ? error : 'That did not work'}</p>}

      <section aria-label="Jobs">
        {stoppable.length > 1 && (
          <div role="toolbar" aria-label="Selected jobs" className="mb-2 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2">
            <span className="mr-auto tabular-nums text-accent-bright">{live.length}</span>
            <button type="button" onClick={() => void act(async () => { for (const id of stoppable) await call('hub_tool_stop', { id }); })}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-danger-soft px-3 py-1.5 text-danger"><Square size={14} />Stop all</button>
          </div>
        )}
        {jobs.length === 0
          ? <p className="text-text-3">Nothing yet. Click a tool above and pick a file.</p>
          : (
            <ul aria-label="Jobs list" className="flex flex-col gap-2">
              {jobs.map(j => {
                const look = LOOK[j.state];
                const sel = live.includes(j.id);
                const busy = j.state === 'waiting' || j.state === 'running';
                return (
                  <li key={j.id} aria-selected={sel} onClick={e => pick(e, j.id)} title={`${j.file}\n${j.note}`}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-2.5 ${sel ? 'border-accent bg-accent-soft' : 'border-border-hi bg-surface hover:bg-surface-2'}`}>
                    <span role="img" aria-label={look.word} className={look.cls}>{look.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[16px]">{fileName(j.file)}</span>
                    <span className={`hidden max-w-[40%] shrink truncate text-[15px] md:block ${j.state === 'failed' ? 'text-danger' : 'text-text-3'}`}>{j.note}</span>
                    {busy && <button type="button" aria-label={`Stop ${fileName(j.file)}`} title="Stop"
                      onClick={e => { e.stopPropagation(); void act(() => call('hub_tool_stop', { id: j.id })); }} className={ICON_BTN}><Square size={18} /></button>}
                    {j.state === 'done' && <>
                      <button type="button" aria-label={`Open ${fileName(j.output)}`} title="Open the result"
                        onClick={e => { e.stopPropagation(); void act(() => call('hub_open_path', { path: j.output, folder: false })); }} className={ICON_BTN}><FileText size={18} /></button>
                      <button type="button" aria-label={`Show ${fileName(j.output)} in its folder`} title="Show in folder"
                        onClick={e => { e.stopPropagation(); void act(() => call('hub_open_path', { path: j.output, folder: true })); }} className={ICON_BTN}><FolderOpen size={18} /></button>
                    </>}
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}
