// What each SwarmClaw API path means on Jordan's PC. Every answer comes from a Hub Rust command.
import type { Agent, ProviderInfo, Skill } from '../sc/types';
import { work, type Ledger } from '../hub/usage-facts';
import { chatState, visibleChats, type Chat } from '../hub/chats-facts';

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
  const [sessions, now, chats] = await Promise.all([
    call<OrgSession[]>('hub_org'),
    call<{ processes: Proc[] }>('hub_running_now').catch(() => ({ processes: [] as Proc[] })),
    pcChats(call).catch(() => [] as Chat[]),
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
  const pinned = new Set(saved().pinned);
  for (const c of chats) out[`chat-${c.id}`] = { ...chatAgent(c), pinned: pinned.has(`chat-${c.id}`) };
  return out;
}

// ---- PandaCode chats as SwarmClaw agents (Agents page = chat with each one) ----
interface PcMessage { id: number; role: string; content: string; createdAt: number }

/** PandaCode chats, newest first; archived and draft chats left out. */
const pcChats = async (call: Call) => visibleChats(await call<Chat[]>('list_sessions'));

function chatSession(c: Chat) {
  return { id: c.id, name: c.title || 'New chat', cwd: '', user: 'Jordan', provider: c.provider, model: c.model, claudeSessionId: null,
    messages: [], agentId: `chat-${c.id}`, createdAt: c.createdAt, updatedAt: c.updatedAt,
    lastActiveAt: Math.max(c.lastResponseAt ?? 0, c.lastPromptAt ?? 0, c.updatedAt), active: chatState(c.status) === 'working' };
}

function chatAgent(c: Chat): Agent {
  const live = chatState(c.status) !== 'idle';
  return agent(`chat-${c.id}`, c.title || 'New chat', `${NAMES[c.provider] ?? c.provider} · ${c.model}`, {
    provider: c.provider as Agent['provider'], model: c.model, threadSessionId: c.id,
    // Only chats that are working or waiting go on the Org Chart; the rest stay on the Agents page.
    ...(live ? { orgChart: { parentId: 'jordan', teamLabel: 'PandaCode chats', teamColor: '#f59e0b' } } : {}),
    createdAt: c.createdAt, updatedAt: chatSession(c).lastActiveAt,
  });
}

/** PandaCode's message rows in SwarmClaw's shape. Errors show as the agent's reply with a warning sign. */
// ponytail: tool and system rows are left out; add them as SwarmClaw toolEvents if he wants to see them.
const toMessages = (rows: PcMessage[]) => rows.flatMap(m =>
  m.role === 'user' || m.role === 'assistant' ? [{ role: m.role, text: m.content, time: m.createdAt, kind: 'chat' }]
    : m.role === 'error' ? [{ role: 'assistant', text: `⚠️ ${m.content}`, time: m.createdAt, kind: 'chat' }] : []);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Sends one message to a PandaCode chat and streams the reply back in SwarmClaw's "data: {...}" format.
 *  PandaCode writes replies to its store, so this re-reads the chat every 1.5 s until it stops working. */
export function chatStream(call: Call, id: string, text: string, pollMs = 1500): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(out) {
      const send = (e: Record<string, unknown>) => out.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const before = (await call<{ messages: PcMessage[] }>('get_messages', { sessionId: id })).messages.at(-1)?.id ?? 0;
        await call('send_message', { sessionId: id, text });
        const started = Date.now();
        let shown = '', errors = 0, sawWork = false;
        while (Date.now() - started < 60 * 60_000) {
          await sleep(pollMs);
          const [page, chats] = await Promise.all([call<{ messages: PcMessage[] }>('get_messages', { sessionId: id }), call<Chat[]>('list_sessions')]);
          const fresh = page.messages.filter(m => m.id > before);
          const reply = fresh.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n');
          if (reply !== shown) { shown = reply; send({ t: 'r', text: reply }); }
          for (const e of fresh.filter(m => m.role === 'error').slice(errors)) send({ t: 'err', text: e.content });
          errors = fresh.filter(m => m.role === 'error').length;
          const state = chatState(chats.find(c => c.id === id)?.status ?? '');
          if (state === 'working') { sawWork = true; continue; }
          if (state === 'needs-you') { send({ t: 'err', text: 'This chat is waiting for you. Open it in PandaCode to answer.' }); break; }
          // Done once it has worked and stopped, or answered, or never started within 15 s.
          if (sawWork || reply || errors || Date.now() - started > 15_000) break;
        }
      } catch (e) {
        send({ t: 'err', text: String(e) });
      }
      send({ t: 'done' });
      out.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

async function chatMessages(call: Call, id: string, limit: string | null) {
  const messages = toMessages((await call<{ messages: PcMessage[] }>('get_messages', { sessionId: id })).messages);
  // ponytail: only PandaCode's newest page; older messages need paging with before_id.
  return limit ? { messages, total: messages.length, hasMore: false, startIndex: 0 } : messages;
}

async function oneChat(call: Call, id: string) {
  const c = (await call<Chat[]>('list_sessions')).find(x => x.id === id);
  if (!c) throw new Error('That chat no longer exists in PandaCode.');
  return chatSession(c);
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

interface HubTask { path: string; name: string; enabled: boolean; state: string; lastRun: string; lastResult: number; nextRun: string; action: string; mine: boolean }

/** SwarmClaw puts a schedule's id straight into its URLs, so a task's path becomes a URL-safe id. */
const taskId = (path: string) => 'task-' + path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const taskPaths = new Map<string, string>();
const when = (s: string) => { const t = Date.parse(s); return Number.isFinite(t) && t > Date.UTC(2000, 0, 1) ? t : undefined; };

/** Every non-Microsoft Windows scheduled task (J10), his own first, as SwarmClaw schedules. */
async function schedules(call: Call) {
  const facts = await call<{ tasks: HubTask[] }>('hub_running_now');
  const out: Record<string, unknown> = {};
  for (const t of [...facts.tasks].sort((a, b) => Number(b.mine) - Number(a.mine))) {
    const id = taskId(t.path);
    taskPaths.set(id, t.path);
    const ran = when(t.lastRun);
    out[id] = {
      id, name: t.name, agentId: '', taskPrompt: t.action || t.path, description: t.path,
      // ponytail: SwarmClaw prints an unknown type as-is; we don't read trigger details yet.
      scheduleType: 'Windows task', status: t.enabled ? 'active' : 'paused',
      lastRunAt: ran, nextRunAt: when(t.nextRun),
      lastDeliveryStatus: ran === undefined || t.lastResult === 0x41301 ? null : t.lastResult === 0 ? 'ok' : 'error',
      lastDeliveredAt: ran, lastDeliveryError: t.lastResult ? `Windows result 0x${t.lastResult.toString(16)}` : null,
      createdAt: 0,
    };
  }
  return out;
}

const pathOf = (id: string) => {
  const path = taskPaths.get(id);
  if (!path) throw new Error('That task is no longer listed. Refresh the page.');
  return path;
};

// ---- Small per-window choices (default chat, pinned chats): kept in this window's own storage ----
// ponytail: localStorage, fine for one person on one PC; move to a Rust file if the phone needs them.
const KEY = 'hub.swarmclaw.v1';
interface Saved { settings: Record<string, unknown>; pinned: string[] }
function saved(): Saved {
  try { return { settings: {}, pinned: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { settings: {}, pinned: [] }; }
}
function save(next: Saved) { try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* the choice just won't stick */ } }
const BASE_SETTINGS = { userName: 'Jordan', setupCompleted: true };

export const routes: Route[] = [
  { method: 'PUT', path: /^\/settings$/, run: async ({ body }) => {
    const s = saved();
    // Only choices that change what Jordan sees here; anything else SwarmClaw sends is ignored.
    const b = (body ?? {}) as { defaultAgentId?: string | null };
    if ('defaultAgentId' in b) s.settings.defaultAgentId = b.defaultAgentId ?? null;
    save(s);
    return { ...BASE_SETTINGS, ...s.settings };
  } },
  { method: 'PUT', path: /^\/agents\/([^/]+)$/, run: async ({ match, body }) => {
    const b = (body ?? {}) as { pinned?: boolean };
    if (typeof b.pinned !== 'boolean') throw new Error('Only pinning is supported here.');
    const s = saved();
    s.pinned = s.pinned.filter(id => id !== match[1]).concat(b.pinned ? [match[1]] : []);
    save(s);
    return { ok: true };
  } },
  { method: 'GET', path: /^\/chats$/, run: async ({ call }) => Object.fromEntries((await pcChats(call)).map(c => [c.id, chatSession(c)])) },
  { method: 'GET', path: /^\/chats\/([^/]+)$/, run: ({ call, match }) => oneChat(call, match[1]) },
  { method: 'GET', path: /^\/chats\/([^/]+)\/messages$/, run: ({ call, match, query }) => chatMessages(call, match[1], query.get('limit')) },
  { method: 'POST', path: /^\/chats\/([^/]+)\/chat$/, run: async ({ call, match, body }) => chatStream(call, match[1], String((body as { message?: string } | null)?.message ?? '')) },
  { method: 'POST', path: /^\/chats\/([^/]+)\/stop$/, run: async ({ call, match }) => { await call('stop_session', { sessionId: match[1] }); return { ok: true }; } },
  // "New chat" in SwarmClaw's chat header: a fresh PandaCode chat with the same agent and model.
  { method: 'POST', path: /^\/chats$/, run: async ({ call, body }) => {
    const b = (body ?? {}) as { provider?: string; model?: string };
    if (!b.provider) throw new Error('Pick an agent first.');
    return chatSession(await call<Chat>('chat_create', { provider: b.provider, model: b.model || 'default', mode: 'full' }));
  } },
  { method: 'GET', path: /^\/chats\/([^/]+)\/context-pack$/, run: async ({ call, match }) => {
    const c = await oneChat(call, match[1]);
    const rows = toMessages((await call<{ messages: PcMessage[] }>('get_messages', { sessionId: match[1] })).messages);
    return [`# ${c.name}`, ...rows.map(m => `**${m.role === 'user' ? 'Jordan' : c.name}:** ${m.text}`)].join('\n\n');
  } },
  // PandaCode has no message queue or context meter to show: an empty queue, and null hides the meter.
  { method: 'GET', path: /^\/chats\/([^/]+)\/queue$/, run: async ({ match }) => ({ sessionId: match[1], activeRunId: null, queueLength: 0, items: [] }) },
  { method: 'GET', path: /^\/chats\/([^/]+)\/context-status$/, run: async () => null },
  { method: 'POST', path: /^\/agents\/chat-([^/]+)\/thread$/, run: ({ call, match }) => oneChat(call, match[1]) },
  { method: 'GET', path: /^\/schedules$/, run: ({ call }) => schedules(call) },
  { method: 'POST', path: /^\/schedules\/([^/]+)\/run$/, run: async ({ call, match }) => { await call('hub_task_run_now', { path: pathOf(match[1]) }); return { ok: true, queued: true }; } },
  { method: 'PUT', path: /^\/schedules\/([^/]+)$/, run: async ({ call, match, body }) => {
    const status = (body as { status?: string } | null)?.status;
    if (status !== 'active' && status !== 'paused') throw new Error('Only turning a task on or off is supported here.');
    await call('hub_task_set_enabled', { path: pathOf(match[1]), enabled: status === 'active' });
    return { ok: true };
  } },
  { method: 'GET', path: /^\/auth$/, run: async () => ({ authenticated: true }) },
  { method: 'POST', path: /^\/auth$/, run: async () => ({ ok: true }) },
  { method: 'GET', path: /^\/settings$/, run: async () => ({ ...BASE_SETTINGS, ...saved().settings }) },
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
