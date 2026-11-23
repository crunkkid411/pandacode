// The Hub's Sessions and Projects pages (SwarmClaw's "Runs" and "Projects"): every PandaCode chat, with
// which agent or harness runs it, which project it is in, and its state as a color AND a word (J10).
// Pure rules; the facts come from list_sessions, list_projects and the bots (routes.ts).
import type { InboxBot, InboxSession } from './inbox-facts';

export type SessionState = 'working' | 'needs-you' | 'failed' | 'idle';
export interface SessionRow {
  id: string; title: string; provider: string; model: string; projectId: string; projectName: string;
  agentId: string | null; agentName: string; seed: string | null; state: SessionState; at: number;
}
export interface ProjectRow { id: string; name: string; path: string; sessions: number; working: number; needsYou: number; failed: number; agents: { id: string; name: string; seed: string | null }[]; at: number }
export interface PcProject { id: string; name: string; path: string }

export const SESSION_LOOK: Record<SessionState, { word: string; color: string }> = {
  working: { word: 'Working', color: '#60a5fa' },
  'needs-you': { word: 'Waiting for you', color: '#fbbf24' },
  failed: { word: 'Failed', color: '#f87171' },
  idle: { word: 'Done', color: '#a3a3a3' },
};
const ORDER: Record<SessionState, number> = { 'needs-you': 0, working: 1, failed: 2, idle: 3 };

interface Rules {
  stateOf: (status: string) => SessionState;
  seedFor: (s: InboxSession) => string | null;
  nameFor: (provider: string) => string;
}

const lastAt = (s: InboxSession) => Math.max(s.lastResponseAt ?? 0, s.updatedAt);

/** Every live chat (not archived, not a draft): waiting on Jordan first, then working, failed, done; newest first within each. */
export function sessionRows(sessions: InboxSession[], projects: PcProject[], bots: InboxBot[], links: Record<string, string>, rules: Rules): SessionRow[] {
  const names = new Map(projects.map(p => [p.id, p.name]));
  return sessions.filter(s => !s.archived && !s.draft).map(s => {
    const bot = bots.find(b => b.desktopSession === s.id) ?? bots.find(b => b.id === links[s.id]) ?? null;
    return {
      id: s.id, title: s.title || 'Untitled chat', provider: s.provider, model: s.model, projectId: s.projectId,
      projectName: names.get(s.projectId) ?? '', agentId: bot?.id ?? null, agentName: bot?.name ?? rules.nameFor(s.provider),
      seed: bot ? bot.seed : rules.seedFor(s), state: rules.stateOf(s.status), at: lastAt(s),
    };
  }).sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.at - a.at);
}

/** Each project folder with how many chats it has, how many need Jordan or failed, and the agents working in it. Busiest first. */
export function projectRows(projects: PcProject[], rows: SessionRow[], bots: InboxBot[]): ProjectRow[] {
  return projects.map(p => {
    const mine = rows.filter(r => r.projectId === p.id);
    const agents = new Map<string, { id: string; name: string; seed: string | null }>();
    for (const b of bots) if (b.projectId === p.id) agents.set(b.id, { id: b.id, name: b.name, seed: b.seed });
    for (const r of mine) if (r.agentId) agents.set(r.agentId, { id: r.agentId, name: r.agentName, seed: r.seed });
    return {
      id: p.id, name: p.name, path: p.path, sessions: mine.length,
      working: mine.filter(r => r.state === 'working').length, needsYou: mine.filter(r => r.state === 'needs-you').length,
      failed: mine.filter(r => r.state === 'failed').length, agents: [...agents.values()], at: Math.max(0, ...mine.map(r => r.at)),
    };
  }).sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
}
