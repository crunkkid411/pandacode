import { AlertTriangle, Bot, CalendarClock, Pause, Play, Power, PowerOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { call } from '../bridge';
import { scheduleWhen, untilText, type HubBot, type HubSchedule } from './agents-facts';
import { Switch } from './running-now';

// Agents panel: PandaCode's bots and scheduled chats. The backend owns every fact; this panel
// lists them, sends pause / on-off / run-now, then reads again (JOBS.md J10).
const REFRESH_MS = 3000;

/** Ctrl+click adds or removes one, Shift+click selects a range, plain click selects one. */
function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const live = selected.filter(id => ids.includes(id));
  const pick = (e: MouseEvent, id: string) => {
    if (e.shiftKey && anchor.current && ids.includes(anchor.current)) {
      const a = ids.indexOf(anchor.current), b = ids.indexOf(id);
      setSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
    else setSelected(s => (s.length === 1 && s[0] === id ? [] : [id]));
  };
  return { live, pick };
}

function Toolbar({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  if (count < 2) return null;
  return (
    <div role="toolbar" aria-label={label} className="mb-2 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2">
      <span className="mr-auto tabular-nums text-accent-bright" title="Selected (Ctrl+click adds one, Shift+click selects a range)">{count}</span>
      {children}
    </div>
  );
}

const BAR_BTN = 'flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-surface-2 px-3 py-1.5 text-[15px] text-text hover:bg-accent hover:text-white';

export function Agents() {
  const [bots, setBots] = useState<HubBot[]>([]);
  const [schedules, setSchedules] = useState<HubSchedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const read = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([call<HubBot[]>('bots_list'), call<HubSchedule[]>('schedules_list', { sessionId: null })]);
      setBots(b);
      setSchedules(s);
      setNow(Date.now());
      setError(null);
    } catch (e) { setError(String(e)); }
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

  const botSel = useSelection(bots.map(b => b.id));
  const schedSel = useSelection(schedules.map(s => s.id));
  const pauseBots = (paused: boolean) => act(async () => { for (const id of botSel.live) await call('bot_set_paused', { botId: id, paused }); });
  const enableScheds = (enabled: boolean) => act(async () => { for (const id of schedSel.live) await call('schedule_set_enabled', { scheduleId: id, enabled }); });
  const runScheds = () => act(async () => { for (const id of schedSel.live) await call('schedule_run_now', { scheduleId: id }); });

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-8 py-7">
      {error && <p role="alert" title={error} className="flex items-center gap-2 text-danger"><AlertTriangle size={20} />That did not work</p>}

      <section aria-label="Bots">
        <h2 className="mb-3 flex items-center gap-2 text-[20px] font-semibold"><Bot size={22} className="text-accent-bright" />Bots</h2>
        <Toolbar label="Selected bots" count={botSel.live.length}>
          <button type="button" className={BAR_BTN} onClick={() => void pauseBots(true)}><Pause size={16} />Pause all</button>
          <button type="button" className={BAR_BTN} onClick={() => void pauseBots(false)}><Play size={16} />Resume all</button>
        </Toolbar>
        {bots.length === 0
          ? <p className="text-text-3">No bots yet. Make one in PandaCode's main window.</p>
          : (
            <ul aria-label="Bots list" className="flex flex-col gap-2">
              {bots.map(b => {
                const sel = botSel.live.includes(b.id);
                return (
                  <li key={b.id} aria-selected={sel} onClick={e => botSel.pick(e, b.id)}
                    title={`${b.role}\n${b.provider} - ${b.model}${b.lastMessage ? `\nLast: ${b.lastMessage.text}` : ''}`}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-2.5 ${sel ? 'border-accent bg-accent-soft' : 'border-border-hi bg-surface hover:bg-surface-2'}`}>
                    <Switch on={!b.paused} label={`${b.name} working or paused`} onToggle={() => void act(() => call('bot_set_paused', { botId: b.id, paused: !b.paused }))} />
                    <span className={`min-w-0 flex-1 truncate text-[16px] ${b.paused ? 'text-text-3' : ''}`}>{b.name}</span>
                    <span className="hidden shrink-0 text-[15px] text-text-3 md:block" title="Next check-in">
                      {b.paused ? 'Paused' : untilText(b.nextHeartbeatAt, now)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
      </section>

      <section aria-label="Scheduled chats">
        <h2 className="mb-3 flex items-center gap-2 text-[20px] font-semibold"><CalendarClock size={22} className="text-accent-bright" />Scheduled chats</h2>
        <Toolbar label="Selected scheduled chats" count={schedSel.live.length}>
          <button type="button" className={BAR_BTN} onClick={() => void runScheds()}><Play size={16} />Run all now</button>
          <button type="button" className={BAR_BTN} onClick={() => void enableScheds(true)}><Power size={16} />Switch on</button>
          <button type="button" className={BAR_BTN} onClick={() => void enableScheds(false)}><PowerOff size={16} />Switch off</button>
        </Toolbar>
        {schedules.length === 0
          ? <p className="text-text-3">No scheduled chats yet. Ask any PandaCode chat to "do this every morning".</p>
          : (
            <ul aria-label="Scheduled chats list" className="flex flex-col gap-2">
              {schedules.map(s => {
                const sel = schedSel.live.includes(s.id);
                return (
                  <li key={s.id} aria-selected={sel} onClick={e => schedSel.pick(e, s.id)}
                    title={`${s.prompt}\nChat: ${s.sessionTitle}\nRan ${s.runCount} times`}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-2.5 ${sel ? 'border-accent bg-accent-soft' : 'border-border-hi bg-surface hover:bg-surface-2'}`}>
                    <Switch on={s.enabled} label={`${s.title} on or off`} onToggle={() => void act(() => call('schedule_set_enabled', { scheduleId: s.id, enabled: !s.enabled }))} />
                    <span className={`min-w-0 flex-1 truncate text-[16px] ${s.enabled ? '' : 'text-text-3'}`}>{s.title}</span>
                    <span className="hidden shrink-0 text-[15px] text-text-2 md:block">{scheduleWhen(s)}</span>
                    <span className="hidden w-20 shrink-0 text-right tabular-nums text-[15px] text-text-3 md:block" title="Next run">{s.enabled ? untilText(s.nextRunAt, now) : ''}</span>
                    <button type="button" aria-label={`Run ${s.title} now`} title="Run now"
                      onClick={e => { e.stopPropagation(); void act(() => call('schedule_run_now', { scheduleId: s.id })); }}
                      className="rail-btn !h-9 !w-9 text-text-2 hover:!text-accent-bright"><Play size={18} /></button>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}
