// The chat box's pop-up list: "/" shows commands (and "/agent " shows agents), "@" shows agents to tag.
// Arrow keys move, Enter or Tab picks, Escape closes. Data: GET /chats/:id/commands and the agent list.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Agent } from '../sc/types';
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import type { ChatCommand } from './chat-commands';

type Item = { key: string; label: string; detail: string; agent?: Agent; insert: string };

interface Props {
  value: string;
  setValue: (v: string) => void;
  sessionId: string | null;
  agents: Agent[];
  /** "/agent Name" picked: open that agent's chat. */
  onAgent: (agent: Agent) => void;
}

const MAX_ROWS = 8;

export function useChatSuggest({ value, setValue, sessionId, agents, onAgent }: Props) {
  const [commands, setCommands] = useState<ChatCommand[]>([]);
  const [index, setIndex] = useState(0);
  const [closedFor, setClosedFor] = useState<string | null>(null);

  const wantsCommands = value.startsWith('/');
  useEffect(() => {
    if (!wantsCommands || !sessionId || commands.length) return;
    let live = true;
    fetch(`/api/chats/${sessionId}/commands`).then(r => r.ok ? r.json() : []).then(list => { if (live) setCommands(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { live = false; };
  }, [wantsCommands, sessionId, commands.length]);
  useEffect(() => { setCommands([]); }, [sessionId]);

  const items = useMemo<Item[]>(() => {
    const agentItem = (a: Agent, insert: string): Item => ({ key: a.id, label: a.name, detail: a.description || a.model || '', agent: a, insert });
    const agentAt = /^\/agent\s+(.*)$/i.exec(value);
    if (agentAt) {
      const want = agentAt[1].toLowerCase();
      return agents.filter(a => a.name.toLowerCase().includes(want)).map(a => agentItem(a, `/agent ${a.name}`));
    }
    const cmd = /^(\/\S*)$/.exec(value);
    if (cmd) {
      const want = cmd[1].toLowerCase();
      return commands.filter(c => c.name.toLowerCase().startsWith(want))
        .map(c => ({ key: c.name, label: c.name + (c.hint ? ` ${c.hint}` : ''), detail: `${c.description}${c.source ? ` · ${c.source}` : ''}`, insert: `${c.name} ` }));
    }
    const tag = /(^|\s)@([^@\n]*)$/.exec(value);
    if (tag) {
      const want = tag[2].toLowerCase();
      const head = value.slice(0, value.length - tag[2].length - 1);
      return agents.filter(a => a.name.toLowerCase().startsWith(want)).map(a => agentItem(a, `${head}@${a.name} `));
    }
    return [];
  }, [value, commands, agents]);

  const open = items.length > 0 && closedFor !== value;
  useEffect(() => { setIndex(0); }, [value]);

  const pick = (item: Item) => {
    if (item.agent && /^\/agent\s/i.test(item.insert)) { setValue(''); onAgent(item.agent); return; }
    setValue(item.insert);
  };

  /** Returns true when the key was used by the list. */
  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => (i + 1) % Math.min(items.length, MAX_ROWS)); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => (i - 1 + Math.min(items.length, MAX_ROWS)) % Math.min(items.length, MAX_ROWS)); return true; }
    if (e.key === 'Escape') { e.preventDefault(); setClosedFor(value); return true; }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      const item = items[index];
      // Enter on a finished command ("/rename Notes") sends it; only an unfinished one is completed.
      if (e.key === 'Enter' && !item.agent && value.trim() === item.insert.trim()) return false;
      e.preventDefault(); pick(item); return true;
    }
    return false;
  };

  const popup = open ? (
    <div role="listbox" aria-label={value.includes('@') && !value.startsWith('/') ? 'Agents to tag' : 'Commands'}
      className="absolute bottom-full left-0 right-0 mb-2 z-30 rounded-[14px] border border-white/[0.08] bg-raised/95 backdrop-blur shadow-[0_12px_40px_rgba(0,0,0,0.45)] p-1.5 max-h-[320px] overflow-y-auto">
      {items.slice(0, MAX_ROWS).map((item, i) => (
        <button key={item.key} type="button" role="option" aria-selected={i === index}
          onMouseDown={(e) => { e.preventDefault(); pick(item); }}
          onMouseEnter={() => setIndex(i)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-[10px] border-none text-left cursor-pointer ${i === index ? 'bg-white/[0.08]' : 'bg-transparent'}`}>
          {item.agent ? <AgentAvatar seed={item.agent.avatarSeed || item.agent.id} avatarUrl={item.agent.avatarUrl} name={item.agent.name} size={28} /> : null}
          <span className="flex flex-col min-w-0">
            <span className="text-[14px] text-text font-600 truncate">{item.label}</span>
            {item.detail ? <span className="text-[12px] text-text-3 truncate">{item.detail}</span> : null}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  return { popup, onKeyDown };
}
