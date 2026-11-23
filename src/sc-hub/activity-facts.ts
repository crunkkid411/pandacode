// The Hub's Activity feed: what each agent did (bots.rs activity log) and where each chat stands,
// newest first, each with a color AND a word. Pure, so tests/hub-activity-facts.test.mjs can run it.

export interface BotActivity { id: number; kind: string; summary: string; at: number }
export interface FeedSession { id: string; title: string; agentName: string; seed: string | null; state: 'working' | 'needs-you' | 'failed' | 'idle'; at: number }
export interface FeedBot { id: string; name: string; seed: string | null }
export interface FeedRow { id: string; who: string; seed: string | null; word: string; color: string; icon: string; text: string; at: number; sessionId?: string }

/** Agent log kinds in plain words. Unknown kinds show as "Note". */
const KIND: Record<string, [string, string, string]> = {
  reply: ['Answered', '#34d399', '💬'],
  inbound: ['Message in', '#60a5fa', '📨'],
  created: ['Created', '#a3e635', '✨'],
  updated: ['Changed', '#c084fc', '✏️'],
  error: ['Failed', '#f87171', '⚠️'],
  approval: ['Asked you', '#fbbf24', '✋'],
  schedule: ['Schedule', '#22d3ee', '⏰'],
  scheduled: ['Scheduled run', '#22d3ee', '⏰'],
  memory: ['Remembered', '#f472b6', '🧠'],
  channel: ['Connection', '#fb923c', '🔌'],
  rule: ['Rule', '#e5e7eb', '📏'],
  reset: ['Started fresh', '#a3a3a3', '↺'],
  pairing: ['Paired', '#fb923c', '🔗'],
};
const STATE: Record<FeedSession['state'], [string, string, string]> = {
  working: ['Working', '#60a5fa', '⚙️'],
  'needs-you': ['Waiting for you', '#fbbf24', '✋'],
  failed: ['Failed', '#f87171', '⚠️'],
  idle: ['Done', '#a3a3a3', '✔'],
};

export function feedRows(bots: FeedBot[], activity: Record<string, BotActivity[]>, sessions: FeedSession[], limit = 200): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const b of bots) for (const a of activity[b.id] ?? []) {
    const [word, color, icon] = KIND[a.kind] ?? ['Note', '#c8c8c8', '•'];
    rows.push({ id: `a${b.id}-${a.id}`, who: b.name, seed: b.seed, word, color, icon, text: a.summary, at: a.at });
  }
  for (const s of sessions) {
    const [word, color, icon] = STATE[s.state];
    rows.push({ id: `s${s.id}`, who: s.agentName, seed: s.seed, word, color, icon, text: s.title, at: s.at, sessionId: s.id });
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, limit);
}
