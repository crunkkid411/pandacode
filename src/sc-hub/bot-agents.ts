// SwarmClaw agents ARE PandaCode bots (Jordan, 2026-11-22: "agents and bots are the same concept in
// my mind - profiles i can set up via gui, and sometimes have them work together on things").
// Each bot reads as a SwarmClaw Agent; SwarmClaw's create / edit / delete / org-chart saves go back
// to the bot commands in src-tauri/src/bots.rs. Fields bots do not have are not saved.
import type { Agent } from '../sc/types';
import { catalogIds, libraryNames, loadLibrary } from './bot-skills';
import { mascotKind, mascotSeed, toolFor } from './mascots';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface BotOrg { parentId?: string | null; teamLabel?: string | null; teamColor?: string | null; swarmRole?: string; onChart?: boolean; x?: number | null; y?: number | null }
export interface Bot {
  id: string; name: string; role: string; instructions: string; goals: string; soul: string; avatar: string;
  provider: string; model: string; mode: string; heartbeatMinutes: number; paused: boolean;
  color: string; reasoningEffort: string; backupModels: unknown[]; fallbackMode: string; notify: boolean; whileWorking: string; showPlan: boolean;
  skills: string[]; mcp: string[]; org: BotOrg; projectId?: string; workProject?: string; createdAt: number; updatedAt: number;
  desktopSession?: string | null; lastMessage?: { at: number } | null;
}

const isImage = (v: string) => v.startsWith('data:image/');

// SwarmClaw's names for CLI harnesses (src/sc/lib/providers/cli-provider-metadata.ts) <-> PandaCode's.
// Using SwarmClaw's names keeps its form's harness-specific parts (e.g. Claude skills) working.
const SC_NAMES: Record<string, string> = { claude: 'claude-cli', codex: 'codex-cli', opencode: 'opencode-cli', gemini: 'gemini-cli', copilot: 'copilot-cli', cursor: 'cursor-cli', qwen: 'qwen-code-cli' };
const PC_NAMES = Object.fromEntries(Object.entries(SC_NAMES).map(([pc, sc]) => [sc, pc]));
export const scProvider = (pc: string) => SC_NAMES[pc] ?? pc;
export const pcProvider = (sc: string) => PC_NAMES[sc] ?? sc;

export function botAgent(b: Bot): Agent {
  const org = b.org ?? {};
  return {
    id: b.id, name: b.name, description: b.role, systemPrompt: b.instructions, soul: b.soul,
    provider: scProvider(b.provider) as Agent['provider'], model: b.model,
    emoji: b.avatar && !isImage(b.avatar) && !b.avatar.startsWith('panda:') ? b.avatar : undefined,
    avatarUrl: isImage(b.avatar) ? b.avatar : null,
    // Its face: the harness mascot in the bot's own color, its chosen panda face, a tool for its role (mascots.ts).
    avatarSeed: mascotSeed(mascotKind(b.provider, b.model), b.id, b.color ?? '', /^panda:(\d+)$/.test(b.avatar) ? Number(b.avatar.slice(6)) : null,
      toolFor(`${b.name} ${b.role}`, org.swarmRole === 'coordinator')),
    role: org.swarmRole === 'coordinator' ? 'coordinator' : 'worker',
    orgChart: org.onChart ? { parentId: org.parentId ?? null, teamLabel: org.teamLabel ?? null, teamColor: org.teamColor ?? null, x: org.x ?? null, y: org.y ?? null } : null,
    skillIds: catalogIds(b.skills), mcpServerIds: b.mcp, projectId: b.workProject || undefined,
    heartbeatEnabled: b.heartbeatMinutes > 0, heartbeatIntervalSec: b.heartbeatMinutes ? b.heartbeatMinutes * 60 : null,
    heartbeatGoal: b.goals || null,
    thinkingLevel: (['minimal', 'low', 'medium', 'high'].includes(b.reasoningEffort) ? b.reasoningEffort : undefined) as Agent['thinkingLevel'],
    disabled: b.paused, threadSessionId: b.desktopSession ?? null,
    createdAt: b.createdAt, updatedAt: b.updatedAt, lastUsedAt: b.lastMessage?.at,
  } as Agent;
}

/** The bot's saved profile with SwarmClaw's changes laid over it (BotInput in bots.rs). */
function input(base: Partial<Bot>, a: Partial<Agent>) {
  const minutes = a.heartbeatEnabled === false ? 0
    : a.heartbeatIntervalSec ? Math.min(7 * 24 * 60, Math.max(1, Math.round(a.heartbeatIntervalSec / 60)))
    : a.heartbeatEnabled ? (base.heartbeatMinutes || 60) : (base.heartbeatMinutes ?? 0);
  const avatar = a.avatarUrl && isImage(a.avatarUrl) ? a.avatarUrl : a.emoji !== undefined ? (a.emoji ?? '') : (base.avatar ?? '');
  return {
    name: (a.name ?? base.name ?? '').trim(), role: a.description ?? base.role ?? '', instructions: a.systemPrompt ?? base.instructions ?? '',
    goals: a.heartbeatGoal ?? base.goals ?? '', soul: a.soul ?? base.soul ?? '', avatar,
    provider: a.provider ? pcProvider(a.provider) : base.provider ?? 'claude', model: a.model || base.model || 'default',
    // ponytail: new bots start in PandaCode's own default, "ask"; change it in PandaCode's bot settings.
    mode: base.mode ?? 'ask', heartbeatMinutes: minutes,
    color: base.color ?? '', reasoningEffort: a.thinkingLevel ?? base.reasoningEffort ?? '',
    backupModels: base.backupModels ?? [], fallbackMode: base.fallbackMode ?? 'ask', notify: base.notify ?? true,
    whileWorking: base.whileWorking ?? 'queue', showPlan: base.showPlan ?? false,
  };
}

const orgOf = (o: Agent['orgChart'], role: Agent['role'], before: BotOrg = {}): BotOrg => ({
  parentId: o ? o.parentId ?? null : before.parentId ?? null,
  teamLabel: o ? o.teamLabel ?? null : before.teamLabel ?? null,
  teamColor: o ? o.teamColor ?? null : before.teamColor ?? null,
  x: o ? o.x ?? null : before.x ?? null, y: o ? o.y ?? null : before.y ?? null,
  swarmRole: role ?? before.swarmRole ?? 'worker', onChart: o !== undefined ? o !== null : before.onChart ?? false,
});

export const listBots = (call: Call) => call<Bot[]>('bots_list');
const oneBot = async (call: Call, id: string) => {
  const bot = (await listBots(call)).find(b => b.id === id);
  if (!bot) throw new Error('That agent no longer exists.');
  return bot;
};

/** Saves what SwarmClaw sent: profile, chart place, skills and tool servers, paused. */
async function apply(call: Call, bot: Bot, a: Partial<Agent>): Promise<Agent> {
  const profileKeys = ['name', 'description', 'systemPrompt', 'soul', 'provider', 'model', 'emoji', 'avatarUrl', 'heartbeatEnabled', 'heartbeatIntervalSec', 'heartbeatGoal', 'thinkingLevel'] as const;
  if (profileKeys.some(k => k in a)) await call('bot_update', { botId: bot.id, input: input(bot, a) });
  if ('orgChart' in a || 'role' in a) await call('bot_set_org', { botId: bot.id, org: orgOf(a.orgChart, a.role, bot.org) });
  if ('skillIds' in a || 'mcpServerIds' in a) await call('bot_set_capabilities', { botId: bot.id, skills: a.skillIds ? await libraryNames(call, a.skillIds) : bot.skills, mcp: a.mcpServerIds ?? bot.mcp });
  // Project: the folder its Hub chat works in; none = its own workspace.
  if ('projectId' in a && (a.projectId || '') !== (bot.workProject || '')) await call('bot_set_work_project', { botId: bot.id, projectId: a.projectId || null });
  if (typeof a.disabled === 'boolean' && a.disabled !== bot.paused) await call('bot_set_paused', { botId: bot.id, paused: a.disabled });
  await loadLibrary(call);
  return botAgent(await oneBot(call, bot.id));
}

export async function createBotAgent(call: Call, a: Partial<Agent>): Promise<Agent> {
  const made = await call<Bot>('bot_create', { input: input({}, a) });
  return apply(call, { ...made, desktopSession: null }, { orgChart: a.orgChart, role: a.role, skillIds: a.skillIds, mcpServerIds: a.mcpServerIds, projectId: a.projectId, disabled: a.disabled });
}

export const updateBotAgent = async (call: Call, id: string, a: Partial<Agent>) => apply(call, await oneBot(call, id), a);
export async function deleteBotAgent(call: Call, id: string) { await call('bot_delete', { botId: id }); return id; }
/** The bot's own conversation, made on first use. */
export const botThread = (call: Call, id: string) => call<string>('bot_desktop_thread', { botId: id });
