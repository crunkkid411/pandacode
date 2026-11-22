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

/** Who wrote a message: Jordan, the agent, or a quiet system line. */
export function speaker(role: string): 'me' | 'agent' | 'note' {
  if (role === 'user') return 'me';
  if (role === 'assistant') return 'agent';
  return 'note';
}
