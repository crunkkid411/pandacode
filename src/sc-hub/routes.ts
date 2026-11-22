// What each SwarmClaw API path means on Jordan's PC. Every answer comes from a Hub Rust command.
import type { Agent, ProviderInfo, Skill } from '../sc/types';
import { work, type Ledger } from '../hub/usage-facts';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
interface Ctx { call: Call; match: RegExpMatchArray; query: URLSearchParams; body: unknown }
export interface Route { method: string; path: RegExp; run: (ctx: Ctx) => Promise<unknown> }

interface OrgHelper { id: string; description: string; agentType: string; model: string; state: string; lastWords: string; updatedMs: number; log: string }
interface OrgSession { pid: number; sessionId: string; title: string; cwd: string; status: string; startedMs: number; lastWords: string; log: string; helpers: OrgHelper[] }
interface Proc { pid: number; name: string; label: string; kind: string; startedMs: number }

const NAMES: Record<string, string> = { opencode: 'OpenCode', hermes: 'Hermes Agent', codex: 'Codex', vibe: 'Vibe', kilo: 'Kilo Code', qwen: 'Qwen Code', claude: 'Claude Code' };

function agent(id: string, name: string, description: string, extra: Partial<Agent>): Agent {
  return { id, name, description, systemPrompt: '', provider: 'claude-cli', model: '', createdAt: 0, updatedAt: 0, ...extra } as Agent;
}

/** Jordan on top, every Claude Code session running now under him, each session's helpers under it,
 *  and every other agent program that is running. */
export async function orgAgents(call: Call): Promise<Record<string, Agent>> {
  const [sessions, now] = await Promise.all([
    call<OrgSession[]>('hub_org'),
    call<{ processes: Proc[] }>('hub_running_now').catch(() => ({ processes: [] as Proc[] })),
  ]);
  const out: Record<string, Agent> = {
    jordan: agent('jordan', 'Jordan', 'You', { role: 'coordinator', emoji: '👑', orgChart: { parentId: null } }),
  };
  const sessionPids = new Set(sessions.map(s => s.pid));
  for (const s of sessions) {
    const id = `session-${s.sessionId}`;
    out[id] = agent(id, s.title, s.lastWords || s.cwd, {
      role: 'coordinator', model: 'Claude Code', emoji: s.status === 'busy' ? '🟢' : '💤',
      orgChart: { parentId: 'jordan', teamLabel: 'Claude Code', teamColor: '#818cf8' },
      updatedAt: s.startedMs, createdAt: s.startedMs,
    });
    for (const h of s.helpers) {
      out[`helper-${h.id}`] = agent(`helper-${h.id}`, h.description || h.agentType, h.lastWords || h.agentType, {
        model: h.model, emoji: h.state === 'working' ? '🟢' : h.state === 'done' ? '✅' : '⏸️',
        orgChart: { parentId: id }, updatedAt: h.updatedMs, createdAt: h.updatedMs,
      });
    }
  }
  for (const p of now.processes) {
    const stem = p.name.toLowerCase().replace(/\.exe$/, '');
    if (p.kind !== 'agent' || stem === 'pandacode' || sessionPids.has(p.pid)) continue;
    if (stem === 'claude') continue; // helper claude.exe processes belong to the sessions above
    const id = `proc-${p.pid}`;
    out[id] = agent(id, NAMES[stem] ?? p.label, `Running (process ${p.pid})`, {
      emoji: '🟢', orgChart: { parentId: 'jordan', teamLabel: 'Other agents', teamColor: '#34d399' }, createdAt: p.startedMs, updatedAt: p.startedMs,
    });
  }
  return out;
}

interface HubSkill { kind: string; name: string; description: string; places: string[]; path: string; ours: boolean }
interface HubProvider { id: string; name: string; installed: boolean; models: { id: string; name: string }[] }

/** Jordan's own skill catalog (every harness on this PC), made-for-you ones tagged first. */
async function skills(call: Call, command = 'hub_skills_list'): Promise<Record<string, Skill>> {
  const list = await call<HubSkill[]>(command);
  const out: Record<string, Skill> = {};
  for (const s of list) {
    const id = s.path || `${s.kind}-${s.name}`;
    out[id] = { id, name: s.name, filename: s.path, content: '', description: s.description, author: s.places.join(', '),
      tags: [...(s.ours ? ['made for you'] : []), s.kind, ...s.places.map(p => p.replace(/ \(.*\)$/, ''))], scope: 'global', createdAt: 0, updatedAt: 0 } as Skill;
  }
  return out;
}

/** Agents installed on this PC, with the models each one offers. */
async function providers(call: Call): Promise<ProviderInfo[]> {
  const list = await call<HubProvider[]>('list_providers');
  return list.filter(p => p.installed).map(p => ({ id: p.id, name: p.name, models: (p.models ?? []).map(m => m.name || m.id), requiresApiKey: false, requiresEndpoint: false }));
}

const RANGE_HOURS: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
const pad = (n: number) => String(n).padStart(2, '0');

/** Claude Code and Codex work from PandaCode's usage ledger, in SwarmClaw's usage shape. */
async function usage(call: Call, range: string) {
  const ledger = await call<Ledger & { rows: number[][] }>('usage_ledger', { refresh: false });
  const hours = RANGE_HOURS[range] ?? 168;
  const since = Date.now() / 3600_000 - hours;
  const byAgent: Record<string, { name: string; cost: number; tokens: number; count: number }> = {};
  const byProvider: Record<string, { tokens: number; cost: number }> = {};
  const series = new Map<string, { bucket: string; tokens: number; cost: number }>();
  let totalTokens = 0, totalCost = 0;
  for (const r of ledger.rows as Ledger['rows']) {
    if (r[0] < since) continue;
    const model = ledger.models[r[1]];
    if (!model) continue;
    const tokens = work(r), cost = r[6];
    totalTokens += tokens; totalCost += cost;
    const a = (byAgent[model.name] ??= { name: model.name, cost: 0, tokens: 0, count: 0 });
    a.cost += cost; a.tokens += tokens; a.count += 1;
    const p = (byProvider[model.provider] ??= { tokens: 0, cost: 0 });
    p.tokens += tokens; p.cost += cost;
    const d = new Date(r[0] * 3600_000);
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const bucket = range === '24h' ? `${day}T${pad(d.getHours())}` : day;
    const point = series.get(bucket) ?? { bucket, tokens: 0, cost: 0 };
    point.tokens += tokens; point.cost += cost; series.set(bucket, point);
  }
  return { records: [], totalTokens, totalCost, byAgent, byProvider, timeSeries: [...series.values()].sort((x, y) => x.bucket.localeCompare(y.bucket)) };
}

export const routes: Route[] = [
  { method: 'GET', path: /^\/auth$/, run: async () => ({ authenticated: true }) },
  { method: 'POST', path: /^\/auth$/, run: async () => ({ ok: true }) },
  { method: 'GET', path: /^\/settings$/, run: async () => ({ userName: 'Jordan', setupCompleted: true }) },
  { method: 'GET', path: /^\/credentials$/, run: async () => ({}) },
  { method: 'GET', path: /^\/agents$/, run: ({ call }) => orgAgents(call) },
  { method: 'GET', path: /^\/skills$/, run: ({ call }) => skills(call) },
  { method: 'GET', path: /^\/providers$/, run: ({ call }) => providers(call) },
  { method: 'GET', path: /^\/providers\/configs$/, run: async () => [] },
  { method: 'GET', path: /^\/usage$/, run: ({ call, query }) => usage(call, query.get('range') ?? '7d') },
  // SwarmClaw's own task board is not ours (J32 store still undecided): null hides its section.
  { method: 'GET', path: /^\/tasks\/metrics$/, run: async () => null },
  { method: 'GET', path: /^\/tasks$/, run: async () => ({}) },
];
