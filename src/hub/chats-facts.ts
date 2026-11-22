// Chats panel facts, as PandaCode's own commands send them (list_sessions, get_messages,
// list_providers), and the pure rules that turn them into colour and order.
// Tested by tests/hub-facts.test.mjs.
import type { Tone } from './facts';

export interface Chat { id: string; title: string; provider: string; model: string; status: string; archived: boolean; draft?: boolean; createdAt: number; updatedAt: number; lastResponseAt: number | null; lastPromptAt?: number | null }
export interface ChatMessage { id: number; role: string; content: string; createdAt: number }
export interface MessagePage { messages: ChatMessage[]; hasOlder: boolean }
export interface Provider { id: string; name: string; installed: boolean }

export type ChatState = 'working' | 'needs-you' | 'failed' | 'idle';

/** One of four looks from PandaCode's session status. */
export function chatState(status: string): ChatState {
  if (status === 'running') return 'working';
  if (status === 'waiting' || status === 'waiting_approval' || status === 'attention' || status === 'limited') return 'needs-you';
  if (status === 'failed' || status === 'interrupted') return 'failed';
  return 'idle';
}

export const CHAT_TONE: Record<ChatState, Tone> = { working: 'warn', 'needs-you': 'warn', failed: 'bad', idle: 'off' };

/** Last activity, newest first; drafts and archived chats are left out. */
export function visibleChats(chats: Chat[]): Chat[] {
  const last = (c: Chat) => Math.max(c.lastResponseAt ?? 0, c.lastPromptAt ?? 0, c.updatedAt, c.createdAt);
  return chats.filter(c => !c.archived && !c.draft).sort((a, b) => last(b) - last(a));
}

/** Who wrote a message: Jordan, the agent, an error he must read, or a quiet system line. */
export function speaker(role: string): 'me' | 'agent' | 'error' | 'note' {
  if (role === 'user') return 'me';
  if (role === 'assistant') return 'agent';
  if (role === 'error') return 'error';
  return 'note';
}

export interface ProviderModel { id: string; name: string }
export interface PoolEntry { provider: string; model: string; name: string }
export interface RoutedModel { provider: string; model: string; name: string; pSuccess: number }
export interface RouteResult { pick: RoutedModel | null; difficulty: number; category: string; profiler: 'onnx' | 'heuristic' }

/** Agents that run on Jordan's sign-in subscriptions, never on a paid API key ("NEVER SPEND
 * JORDAN'S MONEY. FREE OR OAUTH, NOTHING ELSE."). Other agents count only for free models. */
// ponytail: Antigravity is a sign-in agent too, but its ACP server lacks the HTTP MCP support
// PandaCode chats need ("does not advertise HTTP MCP support", seen 2026-11-22); add it back once it has it.
export const SIGN_IN_AGENTS = ['claude', 'codex'];
/** A model that costs nothing whichever agent runs it. */
export const freeModel = (id: string) => /:free$/.test(id) || id.startsWith('freellmapi/');

/** The models the router may choose from: each installed agent's real models (not its
 * "default" alias), only free or sign-in ones, at most `perAgent` each so one long
 * catalogue does not crowd out the rest. */
export function routePool(lists: { provider: string; models: ProviderModel[] }[], perAgent = 12): PoolEntry[] {
  return lists.flatMap(({ provider, models }) => models
    .filter(m => m.id && m.id !== 'default' && (SIGN_IN_AGENTS.includes(provider) || freeModel(m.id)))
    .slice(0, perAgent)
    .map(m => ({ provider, model: m.id, name: m.name || m.id })));
}
