// The Hub's Inbox (SwarmClaw's idea: conversations that come in, kept apart from the chats you're in).
// Here: what Jordan's agents left for him. A conversation is in the Inbox when an agent waits for him,
// stopped with a failure, or replied since he last read it. Read state is the engine's (hub_inbox.rs):
// anything older than the Inbox's first day counts as read.

export interface InboxSession {
  id: string; title: string; provider: string; model: string; status: string; archived: boolean; draft?: boolean;
  projectId: string; updatedAt: number; lastResponseAt?: number | null;
}
export interface InboxBot { id: string; name: string; seed: string | null; desktopSession?: string | null; projectId?: string }
export interface Seen { since: number; seen: Record<string, number> }
export type InboxState = 'needs-you' | 'failed' | 'new';
export interface InboxItem { id: string; title: string; agentId: string | null; agentName: string; seed: string | null; state: InboxState; at: number }

interface Rules {
  /** PandaCode's status as one of the Hub's chat states (chats-facts.ts chatState). */
  stateOf: (status: string) => string;
  /** The face for a conversation no agent owns (its harness mascot). */
  seedFor: (s: InboxSession) => string | null;
  /** Harness name for a conversation no agent owns. */
  nameFor: (provider: string) => string;
}

const ORDER: Record<InboxState, number> = { 'needs-you': 0, failed: 1, new: 2 };
/** Color AND a word for each state (J10: status is never color alone). */
export const STATE_LOOK: Record<InboxState, { word: string; color: string }> = {
  'needs-you': { word: 'Waiting for you', color: '#fbbf24' },
  failed: { word: 'Failed', color: '#f87171' },
  new: { word: 'New reply', color: '#34d399' },
};

export function inboxItems(sessions: InboxSession[], bots: InboxBot[], links: Record<string, string>, seen: Seen, rules: Rules): InboxItem[] {
  const items: InboxItem[] = [];
  for (const s of sessions) {
    if (s.archived || s.draft) continue;
    // An agent's own conversation lives in the Agents tab, not here (Jordan, 2026-11-23: "they should not
    // appear there when I'm actively chatting with them in the Agents workspace").
    if (bots.some(b => b.desktopSession === s.id)) continue;
    const st = rules.stateOf(s.status);
    if (st === 'working') continue;
    const at = Math.max(s.lastResponseAt ?? 0, s.updatedAt);
    if (at <= (seen.seen[s.id] ?? seen.since)) continue;
    const state: InboxState | null = st === 'needs-you' ? 'needs-you' : st === 'failed' ? 'failed' : s.lastResponseAt ? 'new' : null;
    if (!state) continue;
    const bot = bots.find(b => b.desktopSession === s.id) ?? bots.find(b => b.id === links[s.id]) ?? bots.find(b => b.projectId && b.projectId === s.projectId);
    items.push({
      id: s.id, title: s.title || 'Untitled chat', agentId: bot?.id ?? null, agentName: bot?.name ?? rules.nameFor(s.provider),
      seed: bot ? bot.seed : rules.seedFor(s), state, at,
    });
  }
  return items.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.at - a.at);
}
