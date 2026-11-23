// Slash commands and @tags in the Hub's chat box.
// "/" lists the Hub's own commands plus this agent program's commands and skills (PandaCode's
// list_slash_commands); "@" lists his agents. Sending "@Name ..." also hands the message to that agent.
type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface ChatCommand { name: string; description: string; hint?: string; source: string }
interface BotName { id: string; name: string; desktopSession?: string | null }

/** Commands the Hub runs itself. /agent is handled in the chat box (it opens another agent's chat). */
export const HUB_COMMANDS: ChatCommand[] = [
  { name: '/agent', description: 'Switch to another agent', hint: '<name>', source: 'Hub' },
  { name: '/model', description: 'Switch this chat to another model', hint: '<model name>', source: 'Hub' },
  { name: '/rename', description: 'Rename this chat', hint: '<new name>', source: 'Hub' },
];
/** PandaCode window controls that have no place in the Hub; the Hub's own versions above replace /model and /rename. */
const WINDOW_ONLY = new Set(['/new', '/model', '/permissions', '/settings', '/theme', '/resume', '/rename', '/btw', '/copy', '/pwd', '/diff', '/console']);

export async function chatCommands(call: Call, sessionId: string): Promise<ChatCommand[]> {
  const catalog = await call<{ commands: { name: string; description: string; argumentHint?: string | null; source: string; kind: string }[] }>('list_slash_commands', { sessionId });
  const theirs = catalog.commands
    .filter(c => !WINDOW_ONLY.has(c.name) && c.kind !== 'unsupported')
    .map(c => ({ name: c.name, description: c.description, hint: c.argumentHint ?? undefined, source: c.source }));
  return [...HUB_COMMANDS, ...theirs];
}

/** The agents named with @ in a message, longest names first so "@Chief of Staff" beats "@Chief". */
export function mentioned<T extends { name: string }>(text: string, agents: T[]): T[] {
  const found: T[] = [];
  let rest = ` ${text}`;
  for (const a of [...agents].sort((x, y) => y.name.length - x.name.length)) {
    const escaped = a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\s)@${escaped}(?=$|[\\s,.;:!?])`, 'i');
    if (re.test(rest)) { found.push(a); rest = rest.replace(re, '$1'); }
  }
  return found;
}

/** Hands a tagged message to each tagged agent (not the one this chat belongs to). Returns their names. */
export async function forwardMentions(call: Call, sessionId: string, chatName: string, text: string, bots: BotName[], imageIds: string[]): Promise<string[]> {
  const targets = mentioned(text, bots).filter(b => b.desktopSession !== sessionId);
  for (const b of targets) {
    await call('bot_message', { botId: b.id, text: `Jordan tagged you in his chat with ${chatName}:\n\n${text}`, imageIds, moodboardIds: [] });
  }
  return targets.map(b => b.name);
}

/** "/agent Name": the agent to open, by exact name first, then by the start of its name. */
export function agentNamed<T extends { name: string }>(arg: string, agents: T[]): T | undefined {
  const want = arg.trim().replace(/^@/, '').toLowerCase();
  if (!want) return undefined;
  return agents.find(a => a.name.toLowerCase() === want) ?? agents.find(a => a.name.toLowerCase().startsWith(want));
}

/** Splits "/name rest" into its parts. */
export function slashParts(text: string): { name: string; args: string } | null {
  const m = /^(\/[\p{L}\p{N}_:.-]+)(?:\s+([\s\S]*))?$/u.exec(text.trim());
  return m ? { name: m[1], args: (m[2] ?? '').trim() } : null;
}
