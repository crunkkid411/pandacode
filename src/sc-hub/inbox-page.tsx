// The Hub's Inbox, in SwarmClaw's Inbox layout: sources on the left (here: the agents), their
// conversations in the middle, the chosen conversation on the right. It holds what agents left for
// Jordan (inbox-facts.ts). Click = open one; Ctrl+click adds or removes one, Shift+click selects a
// range; "Mark read" works on the whole selection.
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';
import { useRouter } from 'next/navigation';
import { getViewPath } from '@/lib/app/navigation';
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import { STATE_LOOK, type InboxItem } from './inbox-facts';

interface Message { id: number; role: string; content: string; createdAt: number }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function StateTag({ item }: { item: InboxItem }) {
  const look = STATE_LOOK[item.state];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-700" style={{ color: look.color }}>
      <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: look.color }} />{look.word}
    </span>
  );
}

export function HubInbox() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState('');
  const [agent, setAgent] = useState<string>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const anchor = useRef<string | null>(null);

  const load = useCallback(() => api<InboxItem[]>('GET', '/hub-inbox').then(setItems).catch(e => setFailed(errorText(e))), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    setMessages([]);
    if (open) api<Message[]>('GET', `/hub-inbox/${encodeURIComponent(open)}/messages`).then(setMessages).catch(e => toast.error(errorText(e)));
  }, [open]);

  if (failed) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read your inbox: {failed}</p>;
  if (!items) return null;

  const sources = [...new Map(items.map(i => [i.agentId ?? `h:${i.agentName}`, i])).entries()];
  const shown = items.filter(i => agent === 'all' || (i.agentId ?? `h:${i.agentName}`) === agent);
  const live = selected.filter(id => shown.some(i => i.id === id));
  const current = items.find(i => i.id === open) ?? null;

  const pick = (e: MouseEvent, id: string) => {
    if (e.shiftKey && anchor.current) {
      const a = shown.findIndex(i => i.id === anchor.current), b = shown.findIndex(i => i.id === id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(shown.slice(lo, hi + 1).map(i => i.id));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) { setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])); return; }
    setSelected([id]);
    setOpen(id);
  };
  const markRead = async (ids: string[]) => {
    try {
      setItems(await api<InboxItem[]>('POST', '/hub-inbox/read', { ids }));
      setSelected([]);
      if (open && ids.includes(open)) setOpen(null);
    } catch (e) { toast.error(errorText(e)); }
  };
  const openChat = async (item: InboxItem) => {
    await markRead([item.id]);
    if (item.agentId) router.push(getViewPath('agents', item.agentId));
    else api('POST', `/tasks/${encodeURIComponent(item.id)}/open`).catch(e => toast.error(errorText(e)));
  };

  const panel = 'rounded-[20px] border border-white/[0.08] bg-white/[0.02] overflow-hidden flex flex-col min-h-[260px]';
  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-y-auto">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Inbox</h1>
          <p className="text-[14px] text-text-2 mt-1">What your agents left for you: replies, questions and failures. Separate from your chats.</p>
        </div>
        <button type="button" disabled={!live.length} onClick={() => markRead(live)}
          className="px-4 py-2.5 rounded-[12px] bg-[#6d6cf0] text-white text-[14px] font-600 cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-default" style={{ fontFamily: 'inherit' }}>
          Mark read{live.length > 1 ? ` (${live.length})` : ''}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 flex-1 min-h-0">
        <section aria-label="Agents" className={panel} style={{ flex: "1 1 220px", maxWidth: 280 }}>
          <div className="px-4 py-3 border-b border-white/[0.06] text-[14px] font-700 text-text">Agents</div>
          <div className="flex-1 overflow-y-auto">
            {[['all', null] as const, ...sources].map(([key, first]) => {
              const count = key === 'all' ? items.length : items.filter(i => (i.agentId ?? `h:${i.agentName}`) === key).length;
              return (
                <button key={key} type="button" onClick={() => { setAgent(key); setSelected([]); }} aria-pressed={agent === key}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/[0.05] cursor-pointer ${agent === key ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}>
                  {first ? <AgentAvatar seed={first.seed} name={first.agentName} size={30} /> : <span aria-hidden className="w-[30px] h-[30px] rounded-[10px] bg-white/[0.06] flex items-center justify-center text-[15px]">✉</span>}
                  <span className="flex-1 min-w-0 truncate text-[15px] font-600 text-text">{first ? first.agentName : 'Everything'}</span>
                  <span className="text-[13px] text-text-2">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Conversations" className={panel} style={{ flex: "1 1 320px", maxWidth: 400 }}>
          <div className="px-4 py-3 border-b border-white/[0.06] text-[14px] font-700 text-text">Conversations</div>
          {shown.length ? (
            <ul className="flex-1 overflow-y-auto">
              {shown.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={e => pick(e, item.id)} aria-selected={live.includes(item.id)}
                    className={`w-full text-left px-4 py-3 border-b border-white/[0.05] cursor-pointer ${live.includes(item.id) ? 'bg-white/[0.08] shadow-[inset_3px_0_0_#7c7cf6]' : 'hover:bg-white/[0.03]'}`}>
                    <div className="flex items-start gap-3">
                      <AgentAvatar seed={item.seed} name={item.agentName} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[15px] font-700 text-text truncate">{item.title}</span>
                          <span className="text-[12px] text-text-3 whitespace-nowrap">{ago(item.at)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3"><StateTag item={item} /><span className="text-[13px] text-text-2 truncate">{item.agentName}</span></div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-8 text-[15px] text-text-2 text-center">Nothing new. You're all caught up.</p>}
        </section>

        <section aria-label="Conversation" className={panel} style={{ flex: "3 1 420px" }}>
          {current ? (
            <>
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
                <AgentAvatar seed={current.seed} name={current.agentName} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-700 text-text truncate">{current.title}</div>
                  <div className="flex items-center gap-3"><StateTag item={current} /><span className="text-[13px] text-text-2">{current.agentName}</span></div>
                </div>
                <button type="button" onClick={() => openChat(current)} className="px-3.5 py-2 rounded-[10px] bg-[#6d6cf0] text-white text-[14px] font-600 cursor-pointer hover:brightness-110" style={{ fontFamily: 'inherit' }}>Open chat</button>
                <button type="button" onClick={() => markRead([current.id])} className="px-3.5 py-2 rounded-[10px] bg-white/[0.08] text-text text-[14px] font-600 cursor-pointer hover:bg-white/[0.12]" style={{ fontFamily: 'inherit' }}>Mark read</button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
                {messages.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'error').map(m => (
                  <div key={m.id} className={`max-w-[85%] rounded-[14px] px-4 py-3 text-[15px] leading-[1.45] whitespace-pre-wrap break-words ${m.role === 'user' ? 'self-end bubble-user text-text' : m.role === 'error' ? 'bg-red-500/10 border border-red-400/30 text-red-200' : 'bubble-ai text-text'}`}>
                    <div className="text-[12px] text-text-3 mb-1">{m.role === 'user' ? 'You' : m.role === 'error' ? 'Error' : current.agentName}</div>
                    {m.content}
                  </div>
                ))}
              </div>
            </>
          ) : <p className="px-5 py-10 text-[15px] text-text-2 text-center">Pick a conversation to read it.</p>}
        </section>
      </div>
    </div>
  );
}
