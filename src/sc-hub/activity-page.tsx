// The Hub's Activity page: one feed of what every agent did and where every chat stands
// (activity-facts.ts). Each row: the agent's face, a colored word, the text, when. A chat row opens
// that chat in PandaCode. Filter chips pick one agent or one kind of event.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import type { FeedRow } from './activity-facts';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function Chip({ on, color, label, count, onClick }: { on: boolean; color: string; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="px-3 py-1.5 rounded-full text-[14px] font-600 cursor-pointer"
      style={{ color: on ? '#fff' : color, background: on ? `color-mix(in srgb, ${color} 30%, #2a2a2a)` : '#202020', border: `1px solid ${on ? color : 'rgba(255,255,255,0.12)'}` }}>
      {label} <span className="opacity-80">{count}</span>
    </button>
  );
}

export function HubActivity() {
  const [rows, setRows] = useState<FeedRow[] | null>(null);
  const [failed, setFailed] = useState('');
  const [who, setWho] = useState('');
  const [word, setWord] = useState('');
  useEffect(() => {
    const load = () => api<FeedRow[]>('GET', '/hub-activity').then(r => { setRows(r); setFailed(''); }).catch(e => setFailed(errorText(e)));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  if (failed && !rows) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read the activity: {failed}</p>;
  if (!rows) return null;
  const people = [...new Set(rows.map(r => r.who))];
  const words = [...new Map(rows.map(r => [r.word, r.color])).entries()];
  const shown = rows.filter(r => (!who || r.who === who) && (!word || r.word === word));
  const open = (id: string) => api('POST', `/tasks/${id}/open`).catch(e => toast.error(`Could not open it: ${errorText(e)}`));

  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-4 overflow-hidden">
      <div>
        <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Activity</h1>
        <p className="text-[14px] text-text-2 mt-1">What your agents did and where every chat stands, newest first. Click a chat to open it in PandaCode.</p>
      </div>
      <div role="group" aria-label="Who" className="flex flex-wrap gap-2">
        <Chip on={!who} color="#ffffff" label="Everyone" count={rows.length} onClick={() => setWho('')} />
        {people.map(p => <Chip key={p} on={who === p} color="#d4d4d4" label={p} count={rows.filter(r => r.who === p).length} onClick={() => setWho(who === p ? '' : p)} />)}
      </div>
      <div role="group" aria-label="Kind" className="flex flex-wrap gap-2">
        {words.map(([w, c]) => <Chip key={w} on={word === w} color={c} label={w} count={rows.filter(r => r.word === w).length} onClick={() => setWord(word === w ? '' : w)} />)}
      </div>
      <section aria-label="Feed" className="flex-1 min-h-0 overflow-y-auto rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-2">
        <ul className="flex flex-col gap-1.5">
          {shown.map(r => {
            const body = (
              <>
                <AgentAvatar seed={r.seed} name={r.who} size={38} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-700 text-text">{r.who}</span>
                    <span className="text-[13px] font-700 px-2 py-0.5 rounded-full" style={{ color: r.color, background: `color-mix(in srgb, ${r.color} 16%, transparent)` }}>{r.icon} {r.word}</span>
                  </div>
                  <div className="text-[14px] text-text-2 truncate mt-0.5">{r.text}</div>
                </div>
                <span className="text-[13px] text-text-2 shrink-0">{ago(r.at)}</span>
              </>
            );
            const cls = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[12px] text-left';
            const style = { background: '#1d1d1d', border: '1px solid rgba(255,255,255,0.07)', boxShadow: `inset 4px 0 0 ${r.color}` };
            return (
              <li key={r.id}>
                {r.sessionId
                  ? <button type="button" title="Open this chat in PandaCode" onClick={() => open(r.sessionId!)} className={`${cls} cursor-pointer hover:brightness-125`} style={style}>{body}</button>
                  : <div className={cls} style={style}>{body}</div>}
              </li>
            );
          })}
          {!shown.length ? <li className="px-3 py-10 text-[15px] text-text-2 text-center">Nothing here yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
