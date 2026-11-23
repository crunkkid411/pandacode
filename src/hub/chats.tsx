import { AlertTriangle, Bot, Loader, MessageSquarePlus, Send, Sparkles, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { call } from '../bridge';
import { CHAT_TONE, chatState, routePool, speaker, visibleChats, type ProviderModel, type RouteResult, type Chat, type ChatMessage, type ChatState, type MessagePage, type Provider } from './chats-facts';
import type { Tone } from './facts';
import { startMode } from '../sc-hub/mode-facts';

// Chats panel: PandaCode's own chats (Claude Code, OpenCode...) with SwarmClaw's look.
// The backend owns every fact; this panel lists, sends and stops, then reads again (JOBS.md J10).
const LIST_MS = 3000;
const OPEN_BUSY_MS = 1500;

const TONE_TEXT: Record<Tone, string> = { ok: 'text-success', warn: 'text-warn', bad: 'text-danger', off: 'text-text-3' };
const STATE_WORD: Record<ChatState, string> = { working: 'Working', 'needs-you': 'Needs you in PandaCode', failed: 'Stopped or failed', idle: 'Idle' };

function whenVisible(ms: number, work: () => void) {
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') work(); }, ms);
  return () => window.clearInterval(timer);
}

function StateIcon({ state }: { state: ChatState }) {
  const cls = TONE_TEXT[CHAT_TONE[state]];
  if (state === 'working') return <Loader size={16} role="img" aria-label={STATE_WORD[state]} className={`${cls} animate-spin`} />;
  if (state === 'needs-you') return <AlertTriangle size={16} role="img" aria-label={STATE_WORD[state]} className={cls} />;
  if (state === 'failed') return <X size={16} role="img" aria-label={STATE_WORD[state]} className={cls} />;
  return <Bot size={16} role="img" aria-label={STATE_WORD[state]} className={cls} />;
}

export function Chats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);

  const readList = useCallback(async () => {
    try {
      setChats(visibleChats(await call<Chat[]>('list_sessions')));
      setError(null);
    } catch (e) { setError(String(e)); }
  }, []);

  useEffect(() => {
    void readList();
    call<Provider[]>('list_providers').then(p => setProviders(p.filter(x => x.installed))).catch(e => setError(String(e)));
    return whenVisible(LIST_MS, () => void readList());
  }, [readList]);

  const act = async (work: () => Promise<unknown>) => {
    try { await work(); setError(null); } catch (e) { setError(String(e)); }
    await readList();
  };

  const pick = (e: MouseEvent, id: string) => {
    if (e.shiftKey && anchor.current) {
      const a = chats.findIndex(c => c.id === anchor.current), b = chats.findIndex(c => c.id === id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(chats.slice(lo, hi + 1).map(c => c.id));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) { setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])); return; }
    setSelected([id]);
    setOpen(id);
  };

  const live = selected.filter(id => chats.some(c => c.id === id));
  const runningSelected = live.filter(id => chatState(chats.find(c => c.id === id)!.status) === 'working');
  const newChat = (provider: string) => act(async () => {
    const made = await call<Chat>('chat_create', { provider, model: 'default', mode: startMode(provider, 'full') });
    setOpen(made.id);
    setSelected([made.id]);
  });

  // Ask: the router (Panda Router, on this PC) picks the agent and model; the chat starts with the words.
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const submitAsk = async () => {
    const text = ask.trim();
    if (!text || asking) return;
    setAsking(true);
    await act(async () => {
      // Asked before the agent list loaded: load it now rather than doing nothing.
      const agents = providers.length ? providers : (await call<Provider[]>('list_providers')).filter(x => x.installed);
      if (agents.length === 0) throw new Error('No agent is installed');
      // An agent still discovering its models says so; ask it once more after a moment.
      const models = (provider: string) => call<ProviderModel[]>('list_provider_models', { provider })
        .catch(() => new Promise(r => setTimeout(r, 1500)).then(() => call<ProviderModel[]>('list_provider_models', { provider })))
        .catch(() => [] as ProviderModel[]);
      const lists = await Promise.all(agents.map(async p => ({ provider: p.id, models: await models(p.id) })));
      const route = await call<RouteResult>('model_routing_route', { text, pool: routePool(lists) }).catch(() => null);
      const pick = route?.pick ?? null;
      const provider = pick?.provider ?? agents[0].id;
      const made = await call<Chat>('chat_create', { provider, model: pick?.model ?? 'default', mode: startMode(provider, 'full') });
      await call('send_message', { sessionId: made.id, text });
      const agent = agents.find(p => p.id === provider)?.name ?? provider;
      setPicked(pick ? `${pick.name} in ${agent}` : `${agent} (no rated model fit)`);
      setAsk('');
      setOpen(made.id);
      setSelected([made.id]);
    });
    setAsking(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form aria-label="Ask" onSubmit={e => { e.preventDefault(); void submitAsk(); }} className="flex items-center gap-3 border-b border-border-hi px-6 py-4">
        <Sparkles size={22} className="shrink-0 text-accent-bright" />
        <input aria-label="What do you want done?" value={ask} onChange={e => setAsk(e.target.value)} disabled={asking}
          placeholder="Say what you want done. The best agent for it starts on it."
          className="min-w-0 flex-1 rounded-xl border border-border-hi bg-surface px-4 py-2.5 text-[17px] text-text outline-none focus:border-accent" />
        <button type="submit" disabled={asking || !ask.trim()}
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-accent px-5 py-2.5 text-[17px] font-semibold text-white disabled:cursor-default disabled:opacity-40">
          {asking ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}Ask
        </button>
        {picked && <span role="status" title="The agent and model the router picked" className="max-w-[30%] truncate text-[15px] text-text-2">{picked}</span>}
      </form>
      <div className="flex min-h-0 flex-1">
      <section aria-label="Chats list" className="flex w-[320px] shrink-0 flex-col border-r border-border-hi">
        <div className="flex flex-wrap gap-2 p-4">
          {providers.map(p => (
            <button key={p.id} type="button" onClick={() => void newChat(p.id)} title={`Start a new ${p.name} chat`}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-accent-soft px-3 py-1.5 text-[15px] text-accent-bright hover:bg-accent hover:text-white">
              <MessageSquarePlus size={16} />{p.name}
            </button>
          ))}
        </div>
        {live.length > 1 && (
          <div role="toolbar" aria-label="Selected chats" className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2">
            <span className="mr-auto tabular-nums text-accent-bright" title="Chats selected (Ctrl+click adds one, Shift+click selects a range)">{live.length}</span>
            <button type="button" disabled={runningSelected.length === 0} onClick={() => void act(async () => { for (const id of runningSelected) await call('stop_session', { sessionId: id }); })}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-danger-soft px-3 py-1.5 text-danger disabled:cursor-default disabled:opacity-40"><Square size={14} />Stop all</button>
          </div>
        )}
        {error && <p role="alert" title={error} className="mx-4 mb-2 flex items-center gap-2 text-danger"><AlertTriangle size={18} />That did not work</p>}
        <ul aria-label="Chats" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4">
          {chats.map(c => {
            const state = chatState(c.status);
            const isSel = live.includes(c.id);
            return (
              <li key={c.id} aria-selected={isSel} onClick={e => pick(e, c.id)} title={`${c.title}\n${c.provider} - ${c.model}\n${STATE_WORD[state]}`}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 ${isSel ? 'border-accent bg-accent-soft' : c.id === open ? 'border-border-hi bg-surface-2' : 'border-transparent hover:bg-surface'}`}>
                <StateIcon state={state} />
                <span className="min-w-0 flex-1 truncate text-[16px]">{c.title || 'New chat'}</span>
                <span className="shrink-0 text-[13px] text-text-3">{c.provider}</span>
              </li>
            );
          })}
        </ul>
      </section>
      {open && chats.some(c => c.id === open)
        ? <Conversation chat={chats.find(c => c.id === open)!} act={act} />
        : <p className="m-auto text-text-3">Pick a chat, or start one with a button on the left.</p>}
      </div>
    </div>
  );
}

function Conversation({ chat, act }: { chat: Chat; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const [page, setPage] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const state = chatState(chat.status);
  const end = useRef<HTMLDivElement>(null);

  const read = useCallback(async () => {
    try { setPage((await call<MessagePage>('get_messages', { sessionId: chat.id })).messages); } catch { /* the list's error line covers a lost backend */ }
  }, [chat.id]);
  useEffect(() => { setPage([]); void read(); }, [read]);
  // Read at once when the chat changes state (the answer shows the moment it finishes), then on a timer.
  useEffect(() => { void read(); return whenVisible(state === 'working' ? OPEN_BUSY_MS : LIST_MS, () => void read()); }, [read, state]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [page.length]);

  const send = () => {
    const text = draft.trim();
    if (!text || state === 'working') return;
    setDraft('');
    void act(async () => { await call('send_message', { sessionId: chat.id, text }); await read(); });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border-hi px-6 py-4">
        <StateIcon state={state} />
        <h2 className="min-w-0 flex-1 truncate text-[20px] font-semibold">{chat.title || 'New chat'}</h2>
        <span className="text-[14px] text-text-3" title={`${chat.provider} - ${chat.model}`}>{chat.provider}</span>
      </header>
      <ol aria-label="Messages" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        {page.map(m => {
          const who = speaker(m.role);
          if (who === 'note') return m.content ? <li key={m.id} className="self-center text-[13px] text-text-3" title={m.content}>{m.role}</li> : null;
          if (who === 'error') return <li key={m.id} role="alert" className="flex max-w-[80%] items-start gap-2 self-start rounded-2xl border border-danger bg-danger-soft px-4 py-3 text-[16px] text-danger"><AlertTriangle size={18} className="mt-1 shrink-0" />{m.content}</li>;
          return (
            <li key={m.id} className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[16px] leading-relaxed ${who === 'me' ? 'self-end bg-accent text-white' : 'self-start border border-border-hi bg-surface'}`}>
              {m.content}
            </li>
          );
        })}
        {state === 'needs-you' && <li role="alert" className="self-center rounded-xl bg-warn-soft px-4 py-2 text-warn">This chat is waiting for you. Open it in PandaCode to answer.</li>}
        <div ref={end} />
      </ol>
      <div className="flex items-end gap-3 border-t border-border-hi p-4">
        <textarea aria-label="Message" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} rows={2}
          placeholder={state === 'working' ? 'The agent is working...' : 'Write a message (Enter sends, Shift+Enter for a new line)'}
          className="min-h-[52px] flex-1 resize-y rounded-xl border border-border-hi bg-surface px-4 py-3 text-[16px] text-text outline-none focus:border-accent" />
        {state === 'working'
          ? <button type="button" onClick={() => void act(() => call('stop_session', { sessionId: chat.id }))} title="Stop the agent"
              className="flex h-[52px] cursor-pointer items-center gap-2 rounded-xl border-none bg-danger-soft px-5 text-danger"><Square size={18} />Stop</button>
          : <button type="button" onClick={send} disabled={!draft.trim()} title="Send"
              className="flex h-[52px] cursor-pointer items-center gap-2 rounded-xl border-none bg-accent px-5 text-white disabled:cursor-default disabled:opacity-40"><Send size={18} />Send</button>}
      </div>
    </section>
  );
}
