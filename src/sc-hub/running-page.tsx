// The Hub's "Running now" page, where Sessions was (Jordan, 2026-11-24: "any llama-servers, local
// daemons or runtimes, and terminals - even if they are outside of the Hub itself. Any AI stuff
// running anywhere should show up"). Facts: hub_programs.rs, one card per program family.
// Click picks a card; Ctrl+click adds or removes one; Shift+click picks a range; Stop works on the
// whole selection and asks once more before it ends anything.
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';
import { gb, heatTone, usedTone, type Program, type RunningNowFacts, type Tone } from '../hub/facts';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TONE: Record<Tone, string> = { ok: '#4ade80', warn: '#fb923c', bad: '#f87171', off: '#9ca3af' };

const GROUPS: { kind: Program['kind']; icon: string; word: string; color: string; hint: string }[] = [
  { kind: 'model', icon: '🧠', word: 'AI models', color: '#c084fc', hint: 'Model servers: llama-server, LM Studio, Ollama. These use the most memory.' },
  { kind: 'agent', icon: '🤖', word: 'Agents and AI apps', color: '#60a5fa', hint: 'Claude Code, OpenCode, Kilo, Antigravity, Hermes... with every helper they started.' },
  { kind: 'job', icon: '⏱️', word: 'Background jobs', color: '#4ade80', hint: 'Jobs started by becky-bg. They stop by themselves when you use the PC.' },
  { kind: 'runtime', icon: '🐍', word: 'Scripts and helpers', color: '#facc15', hint: 'Python and Node programs running on their own.' },
  { kind: 'terminal', icon: '⌨️', word: 'Terminals', color: '#94a3b8', hint: 'Terminal windows, and what runs inside them.' },
];

const size = (mb: number) => (mb >= 1024 ? `${gb(mb)} GB` : `${mb} MB`);
function upFor(startedMs: number) {
  const m = Math.max(0, Math.round((Date.now() - startedMs) / 60_000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}
const keyOf = (p: Program) => `${p.pid}:${p.startedMs}`;

function Gauge({ icon, label, value, unit, tone, fill, hover }: { icon: string; label: string; value: string; unit: string; tone: Tone; fill: number | null; hover: string }) {
  return (
    <div role="group" aria-label={label} title={hover} className="flex flex-1 min-w-[210px] items-center gap-4 rounded-[16px] border border-white/[0.08] bg-[#1d1d1d] px-5 py-4">
      <span aria-hidden className="text-[26px]">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-text-2">{label}</div>
        <div className="flex items-baseline gap-1.5"><span className="text-[28px] font-700 tabular-nums" style={{ color: TONE[tone] }}>{value}</span><span className="text-[14px] text-text-2">{unit}</span></div>
        {fill !== null && <div className="mt-2 h-2 rounded-full bg-white/[0.08] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`, background: TONE[tone] }} /></div>}
      </div>
    </div>
  );
}

function Badge({ color, children, hover }: { color: string; children: ReactNode; hover: string }) {
  return <span title={hover} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-700 whitespace-nowrap" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>{children}</span>;
}

export function HubRunning() {
  const [facts, setFacts] = useState<RunningNowFacts | null>(null);
  const [failed, setFailed] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const anchor = useRef<string | null>(null);
  const load = useCallback(() => api<RunningNowFacts>('GET', '/hub-running').then(f => { setFacts(f); setFailed(''); }).catch(e => setFailed(errorText(e))), []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 3000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (!confirming) return; const t = setTimeout(() => setConfirming(false), 5000); return () => clearTimeout(t); }, [confirming]);

  if (failed && !facts) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read this PC: {failed}</p>;
  if (!facts) return <p className="px-8 py-8 text-[15px] text-text-2">Reading this PC...</p>;

  // Cards in page order, so Shift+click picks what is between on screen.
  const ordered = GROUPS.flatMap(g => facts.programs.filter(p => p.kind === g.kind));
  const live = selected.filter(k => ordered.some(p => keyOf(p) === k && !p.isHub));
  const targets = ordered.filter(p => live.includes(keyOf(p)));
  const pick = (e: MouseEvent, p: Program) => {
    setConfirming(false);
    const k = keyOf(p);
    if (e.shiftKey && anchor.current) {
      const a = ordered.findIndex(x => keyOf(x) === anchor.current), b = ordered.findIndex(x => keyOf(x) === k);
      if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; setSelected(ordered.slice(lo, hi + 1).filter(x => !x.isHub).map(keyOf)); return; }
    }
    anchor.current = k;
    if (e.ctrlKey || e.metaKey) { setSelected(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k])); return; }
    setSelected(s => (s.length === 1 && s[0] === k ? [] : [k]));
  };
  const stop = async () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    try {
      const out = await api<{ failed: string[]; facts: RunningNowFacts }>('POST', '/hub-running/stop', { targets: targets.map(p => ({ pid: p.pid, startedMs: p.startedMs, title: p.title })) });
      setFacts(out.facts);
      setSelected([]);
      if (out.failed.length) toast.error(`Could not stop: ${out.failed.join('; ')}`);
      else toast.success(`Stopped ${targets.length}`);
    } catch (e) { toast.error(errorText(e)); }
  };
  const { memory, gpu } = facts;
  const leftovers = facts.programs.filter(p => p.leftover);

  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Running now</h1>
        <p className="text-[14px] text-text-2 mt-1">Every AI program, model server and terminal on this PC, in or out of the Hub. Each card includes the helpers it started.</p>
      </div>
      <section aria-label="This PC" className="flex flex-wrap gap-3">
        <Gauge icon="🧮" label="Memory free" value={gb(memory.freeMb)} unit={`of ${gb(memory.totalMb)} GB`} tone={usedTone(memory.freeMb, memory.totalMb)} fill={memory.freeMb / memory.totalMb} hover="Memory (RAM) free right now. The bar is the free part." />
        {gpu ? (
          <>
            <Gauge icon="🎮" label="Graphics memory free" value={gb(gpu.freeMb)} unit={`of ${gb(gpu.totalMb)} GB`} tone={usedTone(gpu.freeMb, gpu.totalMb)} fill={gpu.freeMb / gpu.totalMb} hover={`${gpu.name}. Busy: ${gpu.utilPct}%. AI models load here.`} />
            <Gauge icon="🌡️" label="Graphics card heat" value={`${gpu.tempC}`} unit="°C" tone={heatTone(gpu.tempC)} fill={null} hover="Green under 75, orange under 85, red at 85 and above (its limit is 87)." />
          </>
        ) : <Gauge icon="❓" label="Graphics card" value="?" unit="no answer" tone="bad" fill={null} hover="The graphics card did not answer within 3 seconds." />}
      </section>
      {leftovers.length > 0 && (
        <p role="alert" className="rounded-[14px] px-4 py-3 text-[15px] font-600" style={{ color: '#f87171', background: 'rgba(248,113,113,0.12)' }}>
          ⚠️ {leftovers.length === 1 ? '1 AI model is' : `${leftovers.length} AI models are`} left over: the program that started it has closed, so nothing is using it. Pick it and press Stop to free its memory.
        </p>
      )}
      <div role="toolbar" aria-label="Selected programs" className="sticky top-0 z-10 flex items-center gap-3 flex-wrap rounded-[14px] bg-[#161616] py-2">
        <span className="text-[14px] text-text-2">{live.length ? `${live.length} picked` : 'Click to pick. Ctrl+click adds one, Shift+click picks a range.'}</span>
        <span className="flex-1" />
        <button type="button" disabled={!live.length} onClick={stop}
          className="px-4 py-2.5 rounded-[12px] text-[14px] font-700 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          style={{ fontFamily: 'inherit', color: 'white', background: confirming ? '#dc2626' : 'rgba(248,113,113,0.35)' }}>
          {confirming ? `Click again to stop ${live.length}` : `⏹ Stop${live.length > 1 ? ` (${live.length})` : ''}`}
        </button>
      </div>
      {GROUPS.map(g => {
        const cards = facts.programs.filter(p => p.kind === g.kind);
        if (!cards.length) return null;
        return (
          <section key={g.kind} aria-label={g.word}>
            <h2 title={g.hint} className="mb-2.5 flex items-center gap-2 text-[17px] font-700" style={{ color: g.color }}>
              <span aria-hidden>{g.icon}</span>{g.word}<span className="text-text-3 text-[14px] font-600">{cards.length}</span>
            </h2>
            <ul aria-label={g.word} className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
              {cards.map(p => {
                const on = live.includes(keyOf(p));
                return (
                  <li key={keyOf(p)}>
                    <button type="button" aria-selected={on} onClick={e => pick(e, p)} disabled={p.isHub}
                      title={`${p.commandLine}\n\nProcess number ${p.pid}${p.count > 1 ? `, with ${p.count - 1} helper programs` : ''}`}
                      className="w-full text-left flex flex-col gap-1.5 px-4 py-3 rounded-[14px] cursor-pointer disabled:cursor-default transition-colors"
                      style={{ background: on ? '#2e2e36' : '#1d1d1d', border: `1px solid ${on ? '#8b8cf8' : p.leftover ? '#f87171' : 'rgba(255,255,255,0.08)'}`, boxShadow: `inset 4px 0 0 ${p.leftover ? '#f87171' : g.color}` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[16px] font-700 text-text truncate flex-1">{p.title}</span>
                        <span className="text-[15px] font-700 tabular-nums" style={{ color: p.memMb >= 4096 ? '#fb923c' : '#e5e7eb' }}>{size(p.memMb)}</span>
                      </div>
                      {p.detail && <div className="text-[13px] text-text-2 truncate">{p.detail}</div>}
                      {p.inside.length > 0 && <div className="text-[13px] text-text truncate">▶ Running {p.inside.join(', ')}</div>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 0 = Windows would not say when it started (LM Studio's service). */}
                        {p.startedMs > 0 && <span className="text-[12px] text-text-3 mr-1">⏳ {upFor(p.startedMs)}</span>}
                        {p.leftover && <Badge color="#f87171" hover="The program that started it has closed. Nothing is using it.">Leftover</Badge>}
                        {p.onGpu && <Badge color="#c084fc" hover="It loads onto the graphics card.">🎮 Graphics card</Badge>}
                        {p.selfStopping && <Badge color="#4ade80" hover="It turns itself off when idle, or when you use the PC.">Turns itself off</Badge>}
                        {p.isHub && <Badge color="#60a5fa" hover="This window. Close it to stop it.">This window</Badge>}
                        {p.count > 1 && <span className="text-[12px] text-text-3">+{p.count - 1} helpers</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!facts.programs.length && <p className="px-4 py-10 text-[15px] text-text-2 text-center">✅ No AI programs are running.</p>}
    </div>
  );
}
