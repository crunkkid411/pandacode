// The mode chip: a colored word for how much this chat's agent may do without asking. Click it, or press
// Shift+Tab in the chat box (chat-input.tsx calls cycleMode), to step to the next mode. Every chip for the same
// chat shares one value, so the chat box and the settings panel always agree.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { modeLook, nextMode } from './mode-facts';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(String(body?.error ?? 'Request failed').replace(/^Error:\s*/, ''));
  return body as T;
}

const modes = new Map<string, string>();
const busy = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(f => f());

async function load(sessionId: string) {
  try {
    modes.set(sessionId, (await asJson<{ mode: string }>(await fetch(`/api/chats/${sessionId}/mode`))).mode);
    changed();
  } catch { /* no chip when the mode can't be read */ }
}

/** Steps this chat to the next mode and saves it (one step per call, even with several chips on screen). */
export async function cycleMode(sessionId: string | null) {
  const now = sessionId ? modes.get(sessionId) : undefined;
  if (!sessionId || !now || busy.has(sessionId)) return;
  busy.add(sessionId);
  const to = nextMode(now);
  try {
    await asJson(await fetch(`/api/chats/${sessionId}/mode`, { method: 'PUT', body: JSON.stringify({ mode: to }) }));
    modes.set(sessionId, to);
    changed();
    toast.success(`${modeLook(to).word}: ${modeLook(to).meaning}`);
  } catch (e) { toast.error(errorText(e)); } finally { busy.delete(sessionId); }
}

export function ModeChip({ sessionId }: { sessionId: string | null }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const f = () => redraw(n => n + 1);
    listeners.add(f);
    if (sessionId) void load(sessionId);
    return () => { listeners.delete(f); };
  }, [sessionId]);
  const mode = sessionId ? modes.get(sessionId) : undefined;
  if (!sessionId || !mode) return null;
  const m = modeLook(mode);
  return (
    <button type="button" onClick={() => { void cycleMode(sessionId); }} aria-label={`Mode: ${m.word}. Shift+Tab to change`} title={`${m.meaning} Shift+Tab or click to change.`}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-[13px] font-700 cursor-pointer hover:brightness-125"
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`, fontFamily: 'inherit' }}>
      <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: m.color }} />{m.word}
    </button>
  );
}
