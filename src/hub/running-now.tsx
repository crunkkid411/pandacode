import { Bot, Check, CircleHelp, Clock, Cpu, Loader, MemoryStick, Package, Play, Thermometer, Wrench, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { call } from '../bridge';
import { gb, heatTone, shortWhen, taskState, usedTone, type Proc, type RunningNowFacts, type Task, type TaskState, type Tone } from './facts';

const REFRESH_MS = 3000;

const TONE_TEXT: Record<Tone, string> = { ok: 'text-success', warn: 'text-warn', bad: 'text-danger', off: 'text-text-3' };
const TONE_BAR: Record<Tone, string> = { ok: 'bg-success', warn: 'bg-warn', bad: 'bg-danger', off: 'bg-text-3' };

function useFacts() {
  const [facts, setFacts] = useState<RunningNowFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setFacts(await call<RunningNowFacts>('hub_running_now'));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    // Only while the window is on screen (J10 rule 5: idle = nothing to draw).
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_MS);
    const onShow = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [refresh]);
  return { facts, error, refresh };
}

function Gauge({ icon, tone, fill, value, unit, hover, label }: { icon: ReactNode; tone: Tone; fill: number | null; value: string; unit: string; hover: string; label: string }) {
  return (
    <div role="group" aria-label={label} title={hover} className="flex min-w-[220px] flex-1 items-center gap-4 rounded-2xl border border-border-hi bg-surface px-5 py-4">
      <span className={`${TONE_TEXT[tone]}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`font-display text-[30px] font-semibold leading-none tabular-nums ${TONE_TEXT[tone]}`}>{value}</span>
          <span className="text-[15px] text-text-2">{unit}</span>
        </div>
        {fill !== null && (
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-3">
            <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

const KIND_ICON = { 'llm-server': Cpu, agent: Bot, helper: Wrench } as const;
const KIND_WORD = { 'llm-server': 'AI model server', agent: 'Coding agent', helper: 'Helper program' } as const;

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} h`;
  return `${Math.round(s / 86400)} d`;
}

function Programs({ processes }: { processes: Proc[] }) {
  if (processes.length === 0) {
    return <p className="flex items-center gap-2 text-text-3"><Check size={18} className="text-success" />No AI programs running</p>;
  }
  return (
    <ul aria-label="AI programs" className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
      {processes.map(p => {
        const Icon = KIND_ICON[p.kind];
        return (
          <li key={p.pid} title={`${KIND_WORD[p.kind]} - running ${ago(p.startedMs)}\nPID ${p.pid}\n${p.commandLine}`}
            className="flex items-center gap-3 rounded-xl border border-border-hi bg-surface px-4 py-3">
            <Icon size={20} className={p.kind === 'llm-server' ? 'text-accent-bright' : 'text-text-2'} />
            <span className="min-w-0 flex-1 truncate text-[16px]">{p.label}</span>
            <span className="tabular-nums text-[15px] text-text-2">{p.memMb >= 1024 ? `${gb(p.memMb)} GB` : `${p.memMb} MB`}</span>
          </li>
        );
      })}
    </ul>
  );
}

const STATE_LOOK: Record<TaskState, { icon: ReactNode; tone: Tone; word: string }> = {
  running: { icon: <Loader size={20} className="animate-spin" />, tone: 'warn', word: 'Running now' },
  ok: { icon: <Check size={20} />, tone: 'ok', word: 'Last run worked' },
  failed: { icon: <X size={20} />, tone: 'bad', word: 'Last run failed' },
  never: { icon: <Clock size={20} />, tone: 'off', word: 'Has not run yet' },
  off: { icon: null, tone: 'off', word: 'Switched off' },
};

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={on ? 'On - click to switch off' : 'Off - click to switch on'}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full border-none transition-colors ${on ? 'bg-success' : 'bg-surface-3'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} style={{ left: 0 }} />
    </button>
  );
}

function Tasks({ tasks, tasksError, act }: { tasks: Task[]; tasksError: string | null; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  // Drop selections whose task disappeared.
  const live = selected.filter(p => tasks.some(t => t.path === p));

  const pick = (e: MouseEvent, path: string) => {
    if (e.shiftKey && anchor.current) {
      const a = tasks.findIndex(t => t.path === anchor.current);
      const b = tasks.findIndex(t => t.path === path);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(tasks.slice(lo, hi + 1).map(t => t.path));
      return;
    }
    anchor.current = path;
    if (e.ctrlKey || e.metaKey) setSelected(s => (s.includes(path) ? s.filter(p => p !== path) : [...s, path]));
    else setSelected(s => (s.length === 1 && s[0] === path ? [] : [path]));
  };

  if (tasksError) {
    return <p role="alert" title={tasksError} className="flex items-center gap-2 text-danger"><CircleHelp size={20} />Task list could not be read</p>;
  }
  const runSelected = () => act(async () => { for (const path of live) await call('hub_task_run_now', { path }); });
  const setSelectedEnabled = (enabled: boolean) => act(async () => { for (const path of live) await call('hub_task_set_enabled', { path, enabled }); });
  const others = tasks.filter(t => !t.mine);
  const row = (t: Task) => {
    const look = STATE_LOOK[taskState(t)];
    const isSelected = live.includes(t.path);
    return (
      <li key={t.path} aria-selected={isSelected} onClick={e => pick(e, t.path)}
        className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-2.5 ${isSelected ? 'border-accent bg-accent-soft' : 'border-border-hi bg-surface hover:bg-surface-2'}`}>
        <Switch on={t.enabled} label={`${t.name} on or off`} onToggle={() => act(() => call('hub_task_set_enabled', { path: t.path, enabled: !t.enabled }))} />
        <span role="img" aria-label={look.word} style={{ width: 20 }} title={`${look.word}\nLast run: ${t.lastRun}\nResult code: ${t.lastResult}`} className={TONE_TEXT[look.tone]}>{look.icon}</span>
        <span title={`${t.path}\nRuns: ${t.action}`} className={`min-w-0 flex-1 truncate text-[16px] ${t.enabled ? '' : 'text-text-3'}`}>{t.name}</span>
        <span title={`Next run: ${t.nextRun}`} className="hidden shrink-0 tabular-nums text-[15px] text-text-3 md:block">{shortWhen(t.nextRun)}</span>
        <button type="button" aria-label={`Run ${t.name} now`} title="Run now"
          onClick={e => { e.stopPropagation(); void act(() => call('hub_task_run_now', { path: t.path })); }}
          className="rail-btn !h-9 !w-9 text-text-2 hover:!text-accent-bright"><Play size={18} /></button>
      </li>
    );
  };

  return (
    <>
      {live.length > 1 && (
        <div role="toolbar" aria-label="Selected tasks" className="mb-2.5 flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-2.5">
          <span className="mr-auto tabular-nums text-accent-bright" title="Tasks selected (Ctrl+click adds one, Shift+click selects a range)">{live.length}</span>
          <button type="button" onClick={runSelected} className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-accent px-3 py-1.5 text-white"><Play size={16} />Run all</button>
          <button type="button" onClick={() => setSelectedEnabled(true)} className="cursor-pointer rounded-lg border-none bg-success-soft px-3 py-1.5 text-success">All on</button>
          <button type="button" onClick={() => setSelectedEnabled(false)} className="cursor-pointer rounded-lg border-none bg-surface-3 px-3 py-1.5 text-text-2">All off</button>
        </div>
      )}
      <ul aria-label="Scheduled tasks" className="flex flex-col gap-1.5">
        {tasks.filter(t => t.mine).map(row)}
      </ul>
      {others.length > 0 && (
        // Other apps' tasks (Apple, Google, NVIDIA...) are rarely touched: folded (LESSONS.md section 4).
        <details className="mt-3">
          <summary title="Tasks other apps installed" className="flex cursor-pointer list-none items-center gap-2 py-2 text-text-3 hover:text-text-2">
            <Package size={18} />Other apps <span className="tabular-nums">{others.length}</span>
          </summary>
          <ul aria-label="Other apps' tasks" className="mt-1.5 flex flex-col gap-1.5">{others.map(row)}</ul>
        </details>
      )}
    </>
  );
}

export function RunningNow() {
  const { facts, error, refresh } = useFacts();
  const [actionError, setActionError] = useState<string | null>(null);
  const act = useCallback(async (work: () => Promise<unknown>) => {
    try { await work(); setActionError(null); } catch (e) { setActionError(String(e)); }
    await refresh();
  }, [refresh]);

  if (!facts) {
    return error
      ? <p role="alert" title={error} className="m-8 flex items-center gap-2 text-danger"><CircleHelp size={20} />Hub could not read this PC</p>
      : <p className="m-8 flex items-center gap-2 text-text-3"><Loader size={20} className="animate-spin" />Reading this PC</p>;
  }
  const { memory, gpu } = facts;
  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <h1 className="mb-5 font-display text-[26px] font-semibold">Running now</h1>
      <section aria-label="This PC" className="mb-8 flex flex-wrap gap-3">
        <Gauge label="Memory" icon={<MemoryStick size={28} />} tone={usedTone(memory.freeMb, memory.totalMb)}
          fill={memory.freeMb / memory.totalMb} value={gb(memory.freeMb)} unit="GB free"
          hover={`Memory (RAM) free right now, of ${gb(memory.totalMb)} GB. The bar is the free part.`} />
        {gpu ? (
          <>
            <Gauge label="Graphics memory" icon={<Cpu size={28} />} tone={usedTone(gpu.freeMb, gpu.totalMb)}
              fill={gpu.freeMb / gpu.totalMb} value={gb(gpu.freeMb)} unit="GB free"
              hover={`${gpu.name}: graphics memory free right now, of ${gb(gpu.totalMb)} GB. The bar is the free part. Busy: ${gpu.utilPct}%.`} />
            <Gauge label="Graphics card heat" icon={<Thermometer size={28} />} tone={heatTone(gpu.tempC)} fill={null}
              value={`${gpu.tempC}`} unit="°C" hover="Graphics card temperature. Green under 75, orange under 85, red at 85 and above (its limit is 87)." />
          </>
        ) : (
          <Gauge label="Graphics card" icon={<CircleHelp size={28} />} tone="bad" fill={null} value="?" unit=""
            hover="The graphics card did not answer within 3 seconds. Its driver may have crashed." />
        )}
      </section>
      {(error || actionError) && (
        <p role="alert" title={actionError ?? error ?? ''} className="mb-4 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2.5 text-danger">
          <X size={18} />{actionError ? 'That did not work' : 'Lost touch with this PC'}
        </p>
      )}
      <section aria-labelledby="programs-h" className="mb-8">
        <h2 id="programs-h" className="mb-3 flex items-center gap-2 text-[18px] font-semibold text-text-2"><Bot size={20} />AI programs</h2>
        <Programs processes={facts.processes} />
      </section>
      <section aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="mb-3 flex items-center gap-2 text-[18px] font-semibold text-text-2"><Clock size={20} />Scheduled tasks</h2>
        <Tasks tasks={facts.tasks} tasksError={facts.tasksError} act={act} />
      </section>
    </div>
  );
}
