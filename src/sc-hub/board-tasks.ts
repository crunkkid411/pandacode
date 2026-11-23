// SwarmClaw's Task Board shows PandaCode's own tasks (Jordan, 2026-11-22: PandaCode is "the
// orchestration engine", SwarmClaw "the GUI ... that makes sense to me"). Stages map to columns:
//   Pending -> Backlog, agent working -> Running, waiting for review -> Completed,
//   stopped or failed -> Failed, Settled -> Archived.
// A task handed to an agent runs on that agent's harness and model, and its first message
// carries the agent's brief, the same way PandaCode's main window does it.
import type { BoardTask, BoardTaskStatus } from '../sc/types';
import { isChatProject } from '../chats';
import { listBots, type Bot } from './bot-agents';
import { startMode } from './mode-facts';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface PcTask {
  id: string; title: string; taskDescription?: string; taskStage?: 'pending' | 'in_progress' | 'review' | 'completed';
  status: string; archived: boolean; draft?: boolean; projectId: string; provider: string; model: string;
  createdAt: number; updatedAt: number; lastPromptAt?: number | null; lastResponseAt?: number | null; completedAt?: number | null;
}
interface PcProject { id: string; name: string; path: string }

const WORKING = ['running', 'waiting', 'waiting_approval', 'attention', 'limited'];
/** PandaCode's stage for a task (same rule as src/task-board.ts taskStage). */
export function stageOf(t: PcTask): NonNullable<PcTask['taskStage']> {
  if (t.archived) return 'completed';
  return t.taskStage ?? (['running', 'waiting', 'interrupted'].includes(t.status) ? 'in_progress' : t.lastResponseAt ? 'review' : 'pending');
}

export function boardStatus(t: PcTask): BoardTaskStatus {
  const stage = stageOf(t);
  if (stage === 'pending') return 'backlog';
  if (stage === 'review') return 'completed';
  if (stage === 'completed') return 'archived';
  return WORKING.includes(t.status) ? 'running' : 'failed';
}

export function boardTask(t: PcTask, botId: string | undefined, chatFolder: boolean): BoardTask {
  const status = boardStatus(t);
  return {
    id: t.id, title: t.title, description: t.taskDescription ?? '', status, agentId: botId ?? '',
    projectId: chatFolder ? undefined : t.projectId, sessionId: t.lastPromptAt ? t.id : null,
    error: status === 'failed' ? (t.status === 'failed' ? 'The agent stopped with an error.' : 'Stopped before it finished.') : null,
    createdAt: t.createdAt, updatedAt: t.updatedAt, startedAt: t.lastPromptAt ?? null, completedAt: t.completedAt ?? null,
  } as BoardTask;
}

async function facts(call: Call) {
  const [tasks, projects, botFolders, links] = await Promise.all([
    call<PcTask[]>('list_sessions'), call<PcProject[]>('list_projects'), call<string[]>('bot_project_ids'), call<Record<string, string>>('bot_task_links'),
  ]);
  return { tasks, projects, botFolders: new Set(botFolders), links };
}

/** Every task, keyed by id. Bots' own conversations and unsent drafts are left out. */
export async function boardTasks(call: Call, includeArchived = true): Promise<Record<string, BoardTask>> {
  const { tasks, projects, botFolders, links } = await facts(call);
  const out: Record<string, BoardTask> = {};
  for (const t of tasks) {
    if (t.draft || botFolders.has(t.projectId)) continue;
    const task = boardTask(t, links[t.id], isChatProject(projects.find(p => p.id === t.projectId)));
    if (includeArchived || task.status !== 'archived') out[t.id] = task;
  }
  return out;
}

async function oneTask(call: Call, id: string): Promise<PcTask> {
  const t = (await call<PcTask[]>('list_sessions')).find(s => s.id === id);
  if (!t) throw new Error('That task no longer exists.');
  return t;
}
async function oneBoardTask(call: Call, id: string): Promise<BoardTask> {
  const task = (await boardTasks(call))[id];
  if (!task) throw new Error('That task no longer exists.');
  return task;
}

/** Starts a task: its words, plus the agent's brief when an agent has it. */
async function start(call: Call, t: PcTask, botId: string | undefined) {
  const brief = botId ? await call<string | null>('bot_task_brief', { sessionId: t.id }) ?? '' : '';
  if (brief) await call('send_message', { sessionId: t.id, text: (t.taskDescription?.trim() || t.title) + brief });
  else await call('start_task', { sessionId: t.id });
}

/** Hands a task to an agent (or takes it back with ''); only before it starts. */
async function assign(call: Call, t: PcTask, botId: string, bots?: Bot[]) {
  if (stageOf(t) !== 'pending') throw new Error('Hand a task to an agent before it starts.');
  await call('bot_assign_task', { sessionId: t.id, botId: botId || null });
  const bot = botId ? (bots ?? await listBots(call)).find(b => b.id === botId) : undefined;
  if (bot && (bot.provider !== t.provider || bot.model !== t.model)) await call('configure_session', { sessionId: t.id, provider: bot.provider, model: bot.model });
}

async function setStatus(call: Call, t: PcTask, status: BoardTaskStatus, botId: string | undefined) {
  const current = boardStatus(t);
  if (status === current) return;
  if (status === 'backlog') await call('set_task_stage', { sessionId: t.id, stage: 'pending' });
  else if (status === 'completed') await call('set_task_stage', { sessionId: t.id, stage: 'review' });
  else if (status === 'archived') await call('set_task_stage', { sessionId: t.id, stage: 'completed' });
  else if (status === 'queued' || status === 'running') await start(call, t, botId);
  else if ((status === 'failed' || status === 'cancelled') && current === 'running') await call('stop_session', { sessionId: t.id });
  else throw new Error('A task moves to Failed by itself when its agent stops with an error.');
}

/** Saves what SwarmClaw sent for one task: words, agent, then column. */
export async function updateBoardTask(call: Call, id: string, patch: Partial<BoardTask>): Promise<BoardTask> {
  let t = await oneTask(call, id);
  if (patch.projectId !== undefined && (patch.projectId || undefined) !== (await oneBoardTask(call, id)).projectId) {
    throw new Error('A task stays in the project it was made in. Make a new task in the other project.');
  }
  if (patch.title !== undefined || patch.description !== undefined) {
    const title = (patch.title ?? t.title).trim();
    if (!title) throw new Error('Give the task a title.');
    await call('update_task_details', { sessionId: id, title, description: patch.description ?? t.taskDescription ?? '' });
  }
  const links = await call<Record<string, string>>('bot_task_links');
  if (patch.agentId !== undefined && patch.agentId !== (links[id] ?? '')) { await assign(call, t, patch.agentId); t = await oneTask(call, id); }
  if (patch.status) await setStatus(call, t, patch.status, patch.agentId ?? links[id]);
  return oneBoardTask(call, id);
}

/** A new task: in the chosen project (or a fresh chat folder for none), on its agent's harness. */
export async function createBoardTask(call: Call, data: Partial<BoardTask>): Promise<BoardTask> {
  const title = (data.title ?? '').trim();
  if (!title) throw new Error('Give the task a title.');
  const bots = data.agentId ? await listBots(call) : [];
  const bot = bots.find(b => b.id === data.agentId);
  if (data.agentId && !bot) throw new Error('That agent no longer exists.');
  // ponytail: with no agent, Claude Code (his sign-in subscription) on its default model.
  const provider = bot?.provider ?? 'claude', model = bot?.model ?? 'default', description = data.description ?? '';
  const mode = bot?.mode || startMode(provider, 'full'); // the agent's own mode; Claude Code alone starts in Auto
  let t: PcTask;
  if (data.projectId) t = await call<PcTask>('create_board_task', { projectId: data.projectId, provider, model, mode, title, description });
  else {
    t = await call<PcTask>('chat_create', { provider, model, mode });
    t = await call<PcTask>('update_task_details', { sessionId: t.id, title, description });
  }
  if (bot) await assign(call, t, bot.id, bots);
  if (data.status === 'queued' || data.status === 'running') await start(call, await oneTask(call, t.id), bot?.id);
  return oneBoardTask(call, t.id);
}

/** "Clear done": settles every task waiting for review (they move to Archived; nothing is deleted). */
export async function settleDone(call: Call) {
  const done = Object.values(await boardTasks(call, false)).filter(t => t.status === 'completed');
  for (const t of done) await call('set_task_stage', { sessionId: t.id, stage: 'completed' });
  return { ok: true, count: done.length };
}
