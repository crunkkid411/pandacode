// SwarmClaw's Chatrooms = PandaCode's bot group chats (bots/shared_channels.rs): a room is a channel,
// its agents are the channel's bots, his message goes to them and their replies stream back in
// SwarmClaw's "data: {...}" format. Deleting a room archives the channel (it can come back).
import type { Chatroom, ChatroomMessage } from '../sc/types';

type Call = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export interface SharedChannel { id: string; name: string; memberIds: string[]; leadBotId: string | null; archived: boolean; updatedAt: number }
export interface SharedMessage { id: string; kind: string; authorBotId: string | null; text: string; status: string | null; createdAt: number }
export interface SharedDetail extends SharedChannel { messages: SharedMessage[]; activeBotIds: string[]; hasMore: boolean }

/** His words and the agents' replies; "assigned" bookkeeping rows are left out. */
export function roomMessages(rows: SharedMessage[], names: Record<string, string>): ChatroomMessage[] {
  return rows.flatMap((m): ChatroomMessage[] => {
    if (m.kind === 'user') return [{ id: m.id, senderId: 'user', senderName: 'You', role: 'user' as const, text: m.text, mentions: [], reactions: [], time: m.createdAt }];
    if (m.kind === 'reply' && m.authorBotId) return [{ id: m.id, senderId: m.authorBotId, senderName: names[m.authorBotId] ?? 'Agent', role: 'assistant' as const, text: m.text, mentions: [], reactions: [], time: m.createdAt }];
    return [];
  }).sort((a, b) => a.time - b.time);
}

export function toRoom(c: SharedChannel, messages: ChatroomMessage[] = []): Chatroom {
  return { id: c.id, name: c.name, agentIds: c.memberIds, messages, chatMode: 'parallel', createdAt: c.updatedAt, updatedAt: c.updatedAt };
}

/** Each room comes with its messages: SwarmClaw's list reload replaces the open room, and its search reads them. */
export async function listRooms(call: Call, names: Record<string, string>): Promise<Record<string, Chatroom>> {
  const live = (await call<SharedChannel[]>('bot_shared_channels')).filter(c => !c.archived);
  return Object.fromEntries(await Promise.all(live.map(async c => [c.id, await oneRoom(call, c.id, names)] as const)));
}

export async function oneRoom(call: Call, id: string, names: Record<string, string>): Promise<Chatroom> {
  const d = await call<SharedDetail>('bot_shared_channel_detail', { channelId: id, limit: 100 });
  return toRoom(d, roomMessages(d.messages, names));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Posts his message to the room and streams each agent's reply as it lands. Ends when no agent is
 *  working any more (after a short grace so a slow starter is not missed), or after 30 minutes. */
export function roomStream(call: Call, id: string, text: string, names: Record<string, string>, pollMs = 1500): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(out) {
      const send = (e: Record<string, unknown>) => out.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      const typing = new Set<string>();
      try {
        const before = new Set((await call<SharedDetail>('bot_shared_channel_detail', { channelId: id, limit: 100 })).messages.map(m => m.id));
        await call('bot_shared_channel_post', { channelId: id, text, recipients: null });
        const started = Date.now();
        let quiet = 0;
        while (Date.now() - started < 30 * 60_000) {
          await sleep(pollMs);
          const d = await call<SharedDetail>('bot_shared_channel_detail', { channelId: id, limit: 100 });
          for (const botId of d.activeBotIds) if (!typing.has(botId)) { typing.add(botId); send({ t: 'cr_agent_start', agentId: botId, agentName: names[botId] ?? 'Agent' }); }
          for (const m of d.messages.filter(m => !before.has(m.id) && m.kind === 'reply' && m.authorBotId)) {
            before.add(m.id);
            const agentId = m.authorBotId!;
            if (!typing.has(agentId)) send({ t: 'cr_agent_start', agentId, agentName: names[agentId] ?? 'Agent' });
            send({ t: 'd', agentId, text: m.text });
            send({ t: 'cr_agent_done', agentId });
            typing.delete(agentId);
          }
          quiet = d.activeBotIds.length ? 0 : quiet + 1;
          if (quiet >= 2 && Date.now() - started > 4000) break;
        }
      } catch (e) {
        send({ t: 'err', text: String(e) });
      }
      for (const agentId of typing) send({ t: 'cr_agent_done', agentId });
      send({ t: 'done' });
      out.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}
