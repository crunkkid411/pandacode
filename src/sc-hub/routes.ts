// What each SwarmClaw API path means on Jordan's PC. Every answer comes from a Hub Rust command.
import type { Agent, BoardTask, ProviderInfo, Schedule, Skill } from '../sc/types';
import { botSchedules, createBotSchedule, preview, PREFIX, scheduleOwner, scSchedule } from './bot-schedules';
import { loadLibrary } from './bot-skills';
import { isChatProject } from '../chats';
import { boardTasks, createBoardTask, settleDone, updateBoardTask } from './board-tasks';
import { JOB_PREFIX, jobBoardTasks, startJob } from './jobs-md';
import { parseInbox } from './inbox';
import { forSend, spoken, uploadPicture } from './attachments';
import { chatCommands, forwardMentions, slashParts } from './chat-commands';

/** PandaCode projects an agent can work in (bots' own workspaces left out). */
async function projects(call: Call) {
  const [list, botFolders] = await Promise.all([call<{ id: string; name: string; path: string }[]>('list_projects'), call<string[]>('bot_project_ids')]);
  const own = new Set(botFolders);
  return Object.fromEntries(list.filter(p => !own.has(p.id) && !isChatProject(p)).map(p => [p.id, { id: p.id, name: p.name, description: p.path, createdAt: 0, updatedAt: 0 }]));
}

/** MCP servers already set up in his harnesses; a bot names the ones it may use. */
async function mcpServers(call: Call) {
  const inv = await call<{ entries: { kind: string; name: string; harness: string; source: string }[] }>('capabilities_inventory', { taskId: null });
  const out: Record<string, unknown> = {};
  for (const e of inv.entries.filter(x => x.kind === 'mcp server')) {
    out[e.name] ??= { id: e.name, name: e.name, transport: 'stdio', command: '', description: `From ${e.source}`, createdAt: 0, updatedAt: 0 };
  }
  return out;
}
import { work, type Ledger } from '../hub/usage-facts';
import { chatState, visibleChats, type Chat } from '../hub/chats-facts';
import { botAgent, botThread, createBotAgent, deleteBotAgent, listBots, pcProvider, scProvider, updateBotAgent } from './bot-agents';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
interface Ctx { call: Call; match: RegExpMatchArray; query: URLSearchParams; body: unknown }
export interface Route { method: string; path: RegExp; run: (ctx: Ctx) => Promise<unknown> }

const NAMES: Record<string, string> = { opencode: 'OpenCode', hermes: 'Hermes Agent', codex: 'Codex', vibe: 'Vibe', kilo: 'Kilo Code', qwen: 'Qwen Code', claude: 'Claude Code' };

/** His agents (PandaCode bots), with the pins he set in this window. The Org Chart shows the ones
 *  he placed on it; live terminal sessions are not agents and are not on it. */
export async function botAgents(call: Call): Promise<Record<string, Agent>> {
  const pinned = new Set(saved().pinned);
  await loadLibrary(call); // so each agent's skills show as picked
  return Object.fromEntries((await listBots(call)).map(b => [b.id, { ...botAgent(b), pinned: pinned.has(b.id) }]));
}

// ---- PandaCode conversations in SwarmClaw's chat shape (an agent's chat is its bot's own thread) ----
interface PcMessage { id: number; role: string; content: string; createdAt: number }

/** PandaCode chats, newest first; archived and draft chats left out. */
const pcChats = async (call: Call) => visibleChats(await call<Chat[]>('list_sessions'));

function chatSession(c: Chat, agentId: string | null = null) {
  return { id: c.id, name: c.title || 'New chat', cwd: '', user: 'Jordan', provider: c.provider, model: c.model, claudeSessionId: null,
    messages: [], agentId, createdAt: c.createdAt, updatedAt: c.updatedAt,
    lastActiveAt: Math.max(c.lastResponseAt ?? 0, c.lastPromptAt ?? 0, c.updatedAt), active: chatState(c.status) === 'working' };
}

/** The bot whose own thread this conversation is, if any. */
const botOfThread = async (call: Call, sessionId: string) => (await listBots(call)).find(b => b.desktopSession === sessionId)?.id ?? null;

/** PandaCode's message rows in SwarmClaw's shape. Errors show as the agent's reply with a warning sign. */
// ponytail: tool and system rows are left out; add them as SwarmClaw toolEvents if he wants to see them.
// A bot's standing instructions ride on the end of his message (bots/brief.rs HEADER); show only his words.
const withoutBrief = (text: string) => { const at = text.indexOf('\n\nBot brief:'); return at < 0 ? text : text.slice(0, at); };
const toMessages = (rows: PcMessage[]) => rows.flatMap(m =>
  m.role === 'user' || m.role === 'assistant' ? [{ role: m.role, text: m.role === 'user' ? withoutBrief(m.content) : m.content, time: m.createdAt, kind: 'chat' }]
    : m.role === 'error' ? [{ role: 'assistant', text: `⚠️ ${m.content}`, time: m.createdAt, kind: 'chat' }] : []);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Sends one message to a PandaCode chat and streams the reply back in SwarmClaw's "data: {...}" format.
 *  PandaCode writes replies to its store, so this re-reads the chat every 1.5 s until it stops working. */
export function chatStream(call: Call, id: string, text: string, pollMs = 1500, imageIds: string[] = []): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(out) {
      const send = (e: Record<string, unknown>) => out.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const before = (await call<{ messages: PcMessage[] }>('get_messages', { sessionId: id })).messages.at(-1)?.id ?? 0;
        // An agent's own thread goes through the bot, so it gets its brief, team and queue.
        const botId = await botOfThread(call, id);
        if (botId) await call('bot_message', { botId, text, imageIds, moodboardIds: [] });
        else await call('send_message', { sessionId: id, text, imageIds, moodboardIds: [] });
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

/** A one-line answer in the chat (a command's result, or a problem in red), in SwarmClaw's stream format. */
function note(text: string, problem = false): Response {
  const line = (e: Record<string, unknown>) => `data: ${JSON.stringify(e)}\n\n`;
  return new Response(line(problem ? { t: 'err', text } : { t: 'r', text }) + line({ t: 'done' }), { headers: { 'Content-Type': 'text/event-stream' } });
}

/** The Hub's own slash commands. Returns the answer to show, or null when it is not one of them. */
async function hubSlash(call: Call, id: string, name: string, args: string): Promise<string | null> {
  if (name === '/agent') return 'Pick an agent from the list that opens when you type /agent.';
  if (name === '/rename') {
    if (!args) throw new Error('Type the new name after /rename.');
    await call('update_session', { sessionId: id, title: args });
    return `Renamed this chat to "${args}".`;
  }
  if (name === '/model') {
    const c = (await call<Chat[]>('list_sessions')).find(x => x.id === id);
    if (!c) throw new Error('That chat no longer exists in PandaCode.');
    const models = await call<{ id: string; name: string }[]>('list_provider_models', { provider: c.provider, force: false });
    if (!args) return `Models you can use here: ${models.map(m => m.name || m.id).join(', ')}. Type /model and a name, or use the model menu under the box.`;
    const want = args.toLowerCase();
    const m = models.find(x => x.id.toLowerCase() === want || (x.name || '').toLowerCase() === want)
      ?? models.find(x => (x.name || x.id).toLowerCase().includes(want) || x.id.toLowerCase().includes(want));
    if (!m) throw new Error(`No model here matches "${args}". Type /model to see the list.`);
    const botId = await botOfThread(call, id);
    if (botId) await updateBotAgent(call, botId, { model: m.id });
    else await call('update_session', { sessionId: id, model: m.id });
    return `Now using ${m.name || m.id}.`;
  }
  return null;
}

async function chatMessages(call: Call, id: string, limit: string | null) {
  const messages = toMessages((await call<{ messages: PcMessage[] }>('get_messages', { sessionId: id })).messages);
  // ponytail: only PandaCode's newest page; older messages need paging with before_id.
  return limit ? { messages, total: messages.length, hasMore: false, startIndex: 0 } : messages;
}

async function oneChat(call: Call, id: string) {
  const c = (await call<Chat[]>('list_sessions')).find(x => x.id === id);
  if (!c) throw new Error('That chat no longer exists in PandaCode.');
  return chatSession(c, await botOfThread(call, id));
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
  // supportsModelDiscovery: the model box asks discover-models below for the harness's full list.
  // Gemini CLI's free sign-in is shut for individuals (Google: "migrate to the Antigravity suite"), so it is not offered.
  return list.filter(p => p.installed && p.id !== 'gemini').map(p => ({ id: scProvider(p.id) as ProviderInfo['id'], name: p.name, models: (p.models ?? []).map(m => m.id), requiresApiKey: false, requiresEndpoint: false, supportsModelDiscovery: true }));
}

/** Every model a harness offers (OpenCode, Kilo and Hermes reach any API provider set up in them). */
async function discoverModels(call: Call, scId: string, force: boolean) {
  const id = pcProvider(scId);
  const base = { providerId: scId, cached: !force, fetchedAt: Date.now(), cacheTtlMs: 300_000, supportsDiscovery: true };
  try {
    const models = await call<{ id: string }[]>('list_provider_models', { provider: id, force });
    return { ...base, ok: true, models: models.map(m => m.id) };
  } catch (e) {
    return { ...base, ok: false, models: [], message: e instanceof Error ? e.message : String(e) };
  }
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

/** A board card is a PandaCode task, or a JOBS.md job (which can only be handed to an agent). */
const updateAnyTask = (call: Call, id: string, patch: Partial<BoardTask>) =>
  id.startsWith(JOB_PREFIX) ? startJob(call, id, patch, createBoardTask) : updateBoardTask(call, id, patch);

export const routes: Route[] = [
  { method: 'PUT', path: /^\/settings$/, run: async ({ body }) => {
    const s = saved();
    // Only choices that change what Jordan sees here; anything else SwarmClaw sends is ignored.
    const b = (body ?? {}) as { defaultAgentId?: string | null };
    if ('defaultAgentId' in b) s.settings.defaultAgentId = b.defaultAgentId ?? null;
    save(s);
    return { ...BASE_SETTINGS, ...s.settings };
  } },
  { method: 'PUT', path: /^\/agents\/([^/]+)$/, run: async ({ call, match, body }) => {
    const { pinned, ...rest } = (body ?? {}) as Partial<Agent>;
    if (typeof pinned === 'boolean') {
      const s = saved();
      s.pinned = s.pinned.filter(id => id !== match[1]).concat(pinned ? [match[1]] : []);
      save(s);
    }
    return Object.keys(rest).length ? updateBotAgent(call, match[1], rest) : { ok: true };
  } },
  { method: 'GET', path: /^\/projects$/, run: ({ call }) => projects(call) },
  { method: 'GET', path: /^\/mcp-servers$/, run: ({ call }) => mcpServers(call) },
  { method: 'GET', path: /^\/providers\/([^/]+)\/discover-models$/, run: ({ call, match, query }) => discoverModels(call, decodeURIComponent(match[1]), query.get('force') === '1') },
  // The form saves the discovered list back; the engine already caches it, so nothing to store.
  { method: 'PUT', path: /^\/providers\/([^/]+)\/models$/, run: async () => ({ ok: true }) },
  { method: 'POST', path: /^\/agents$/, run: ({ call, body }) => createBotAgent(call, (body ?? {}) as Partial<Agent>) },
  { method: 'DELETE', path: /^\/agents\/([^/]+)$/, run: ({ call, match }) => deleteBotAgent(call, match[1]) },
  // Org Chart drags and team edits: one save per agent.
  { method: 'PATCH', path: /^\/agents\/bulk$/, run: async ({ call, body }) => {
    const errors: string[] = [];
    let updated = 0;
    for (const { id, patch } of ((body as { patches?: { id: string; patch: Partial<Agent> }[] } | null)?.patches ?? [])) {
      try { await updateBotAgent(call, id, patch); updated++; } catch (e) { errors.push(String(e)); }
    }
    return { updated, errors };
  } },
  { method: 'GET', path: /^\/chats$/, run: async ({ call }) => Object.fromEntries((await pcChats(call)).map(c => [c.id, chatSession(c)])) },
  { method: 'GET', path: /^\/chats\/([^/]+)$/, run: ({ call, match }) => oneChat(call, match[1]) },
  { method: 'GET', path: /^\/chats\/([^/]+)\/messages$/, run: ({ call, match, query }) => chatMessages(call, match[1], query.get('limit')) },
  { method: 'POST', path: /^\/chats\/([^/]+)\/chat$/, run: async ({ call, match, body }) => {
    const b = (body ?? {}) as { message?: string; imagePath?: string; attachedFiles?: string[] };
    const id = match[1];
    try {
      const message = String(b.message ?? '');
      const slash = slashParts(message);
      if (slash) {
        const done = await hubSlash(call, id, slash.name, slash.args);
        if (done) return note(done);
        // A command this agent program does not run itself (a PandaCode window control) is not sent.
        const resolved = await call<{ action: string | null }>('resolve_slash_command', { sessionId: id, text: message });
        if (resolved.action) return note(`${slash.name} works in PandaCode's main window, not in the Hub.`, true);
      }
      const sent = forSend(message, b.attachedFiles?.length ? b.attachedFiles : b.imagePath ? [b.imagePath] : []);
      const bots = await listBots(call);
      const own = bots.find(x => x.desktopSession === id);
      await forwardMentions(call, id, own?.name ?? (await oneChat(call, id)).name, sent.text, bots, sent.imageIds);
      return chatStream(call, id, sent.text, 1500, sent.imageIds);
    } catch (e) {
      return note(String(e).replace(/^Error:\s*/, ''), true); // shown in red in the chat, in plain words
    }
  } },
  // "/" in the chat box: the Hub's own commands, then this agent program's commands and skills.
  { method: 'GET', path: /^\/chats\/([^/]+)\/commands$/, run: ({ call, match }) => chatCommands(call, match[1]) },
  // The speaker: becky-tts reads the reply (src-tauri/src/hub_tts.rs); code and markdown signs are not read.
  { method: 'POST', path: /^\/tts$/, run: async ({ call, body }) => {
    const wav = await call<ArrayBuffer>('hub_speak', { text: spoken(String((body as { text?: string } | null)?.text ?? '')) });
    return new Response(wav, { headers: { 'Content-Type': 'audio/wav' } });
  } },
  // The chat box's model menu: the models this chat's agent program offers, and switching one.
  { method: 'GET', path: /^\/chats\/([^/]+)\/models$/, run: async ({ call, match }) => {
    const c = (await call<Chat[]>('list_sessions')).find(x => x.id === match[1]);
    if (!c) throw new Error('That chat no longer exists in PandaCode.');
    const bot = (await listBots(call)).find(b => b.desktopSession === c.id);
    const models = await call<{ id: string; name: string }[]>('list_provider_models', { provider: c.provider, force: false });
    return { provider: c.provider, current: bot?.model ?? c.model, models: models.map(m => ({ id: m.id, name: m.name || m.id })) };
  } },
  { method: 'PUT', path: /^\/chats\/([^/]+)\/model$/, run: async ({ call, match, body }) => {
    const model = String((body as { model?: string } | null)?.model ?? '');
    if (!model) throw new Error('Pick a model.');
    const botId = await botOfThread(call, match[1]);
    if (botId) await updateBotAgent(call, botId, { model }); // an agent's chat runs on the agent's model
    else await call('update_session', { sessionId: match[1], model });
    return { ok: true, model };
  } },
  { method: 'POST', path: /^\/upload$/, run: ({ call, body }) => {
    if (!(body instanceof Blob)) throw new Error('Nothing to attach.');
    return uploadPicture(call, body as Blob & { name?: string });
  } },
  { method: 'POST', path: /^\/chats\/([^/]+)\/stop$/, run: async ({ call, match }) => { await call('stop_session', { sessionId: match[1] }); return { ok: true }; } },
  // "New chat" in SwarmClaw's chat header: a fresh PandaCode chat with the same agent and model.
  { method: 'POST', path: /^\/chats$/, run: async ({ call, body }) => {
    const b = (body ?? {}) as { provider?: string; model?: string };
    if (!b.provider) throw new Error('Pick an agent first.');
    return chatSession(await call<Chat>('chat_create', { provider: pcProvider(b.provider), model: b.model || 'default', mode: 'full' }));
  } },
  { method: 'GET', path: /^\/chats\/([^/]+)\/context-pack$/, run: async ({ call, match }) => {
    const c = await oneChat(call, match[1]);
    const rows = toMessages((await call<{ messages: PcMessage[] }>('get_messages', { sessionId: match[1] })).messages);
    return [`# ${c.name}`, ...rows.map(m => `**${m.role === 'user' ? 'Jordan' : c.name}:** ${m.text}`)].join('\n\n');
  } },
  // PandaCode has no message queue or context meter to show: an empty queue, and null hides the meter.
  { method: 'GET', path: /^\/chats\/([^/]+)\/queue$/, run: async ({ match }) => ({ sessionId: match[1], activeRunId: null, queueLength: 0, items: [] }) },
  { method: 'GET', path: /^\/chats\/([^/]+)\/context-status$/, run: async () => null },
  { method: 'POST', path: /^\/agents\/([^/]+)\/thread$/, run: async ({ call, match }) => oneChat(call, await botThread(call, match[1])) },
  // Schedules: his agents' own schedules (ids "bs-...") first, then his Windows tasks.
  { method: 'GET', path: /^\/schedules$/, run: async ({ call }) => {
    const [bots, windows] = await Promise.all([botSchedules(call), schedules(call)]);
    return { ...Object.fromEntries(bots.map(s => [PREFIX + s.id, scSchedule(s)])), ...windows };
  } },
  { method: 'POST', path: /^\/schedules\/preview$/, run: async ({ body }) => preview((body ?? {}) as Partial<Schedule>) },
  { method: 'POST', path: /^\/schedules$/, run: ({ call, body }) => createBotSchedule(call, (body ?? {}) as Partial<Schedule>) },
  { method: 'POST', path: /^\/schedules\/([^/]+)\/run$/, run: async ({ call, match }) => {
    if (match[1].startsWith(PREFIX)) await call('bot_run_schedule_now', { scheduleId: match[1].slice(PREFIX.length) });
    else await call('hub_task_run_now', { path: pathOf(match[1]) });
    return { ok: true, queued: true };
  } },
  { method: 'PUT', path: /^\/schedules\/([^/]+)$/, run: async ({ call, match, body }) => {
    const b = (body ?? {}) as Partial<Schedule>;
    if (match[1].startsWith(PREFIX) && ('taskPrompt' in b || 'scheduleType' in b)) {
      // The edit form: bots have no schedule edit, so save the new one, then remove the old one.
      const own = await scheduleOwner(call, match[1].slice(PREFIX.length));
      const made = await createBotSchedule(call, { ...b, agentId: b.agentId || own.botId });
      if (b.status === 'paused') await call('bot_schedule_set_enabled', { scheduleId: made.id.slice(PREFIX.length), enabled: false });
      await call('bot_schedule_delete', { botId: own.botId, scheduleId: own.id });
      return made;
    }
    const status = b.status;
    if (status !== 'active' && status !== 'paused') throw new Error('Only turning a schedule on or off is supported here.');
    if (match[1].startsWith(PREFIX)) await call('bot_schedule_set_enabled', { scheduleId: match[1].slice(PREFIX.length), enabled: status === 'active' });
    else await call('hub_task_set_enabled', { path: pathOf(match[1]), enabled: status === 'active' });
    return { ok: true };
  } },
  { method: 'DELETE', path: /^\/schedules\/bs-([^/]+)$/, run: async ({ call, match }) => {
    const own = await scheduleOwner(call, match[1]);
    await call('bot_schedule_delete', { botId: own.botId, scheduleId: own.id });
    return { ok: true };
  } },
  { method: 'GET', path: /^\/auth$/, run: async () => ({ authenticated: true }) },
  { method: 'POST', path: /^\/auth$/, run: async () => ({ ok: true }) },
  { method: 'GET', path: /^\/settings$/, run: async () => ({ ...BASE_SETTINGS, ...saved().settings }) },
  { method: 'GET', path: /^\/credentials$/, run: async () => ({}) },
  { method: 'GET', path: /^\/agents$/, run: ({ call }) => botAgents(call) },
  { method: 'GET', path: /^\/skills$/, run: ({ call }) => skills(call) },
  { method: 'GET', path: /^\/providers$/, run: ({ call }) => providers(call) },
  { method: 'GET', path: /^\/providers\/configs$/, run: async () => [] },
  { method: 'GET', path: /^\/usage$/, run: ({ call, query }) => usage(call, query.get('range') ?? '7d') },
  { method: 'GET', path: /^\/tasks\/metrics$/, run: async () => null },
  // Inbox: Jordan's inbox.txt (inbox.ts).
  { method: 'GET', path: /^\/hub-inbox$/, run: async ({ call }) => parseInbox(await call<string>('hub_read_list', { name: 'inbox' })) },
  { method: 'POST', path: /^\/hub-inbox$/, run: async ({ call, body }) => {
    const { link = '', note = '' } = (body ?? {}) as { link?: string; note?: string };
    await call('hub_inbox_add', { link, note });
    return parseInbox(await call<string>('hub_read_list', { name: 'inbox' }));
  } },
  { method: 'POST', path: /^\/hub-inbox\/install$/, run: async ({ call }) => { await call('hub_inbox_install'); return { ok: true }; } },
  { method: 'POST', path: /^\/hub-inbox\/open$/, run: async ({ call, body }) => { await call('hub_open_link', { url: (body as { url?: string })?.url ?? '' }); return { ok: true }; } },
  // Task Board: PandaCode's tasks (board-tasks.ts) and Jordan's JOBS.md jobs (jobs-md.ts).
  { method: 'GET', path: /^\/tasks$/, run: async ({ call, query }) => {
    const all = query.get('includeArchived') === 'true';
    const own = await boardTasks(call, true);
    const jobs = await jobBoardTasks(call, Object.values(own).map(t => t.title), all);
    return { ...jobs, ...(all ? own : Object.fromEntries(Object.entries(own).filter(([, t]) => t.status !== 'archived'))) };
  } },
  { method: 'POST', path: /^\/tasks$/, run: ({ call, body }) => createBoardTask(call, (body ?? {}) as Partial<BoardTask>) },
  { method: 'PUT', path: /^\/tasks\/([^/]+)$/, run: ({ call, match, body }) => updateAnyTask(call, decodeURIComponent(match[1]), (body ?? {}) as Partial<BoardTask>) },
  { method: 'POST', path: /^\/tasks\/bulk$/, run: async ({ call, body }) => {
    const { ids = [], ...patch } = (body ?? {}) as { ids?: string[] } & Partial<BoardTask>;
    for (const id of ids) await updateAnyTask(call, id, patch);
    return { updated: ids.length, ids };
  } },
  { method: 'DELETE', path: /^\/tasks$/, run: ({ call }) => settleDone(call) },
  // "View": the task's conversation in PandaCode's main window.
  { method: 'POST', path: /^\/tasks\/([^/]+)\/open$/, run: async ({ call, match }) => { await call('overlay_open_task', { sessionId: decodeURIComponent(match[1]) }); return { ok: true }; } },
];
