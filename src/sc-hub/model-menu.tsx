// The chat box's model menu ("Claude Opus 5.5 ▾"): the models this chat's agent program offers.
// Picking one switches the chat (or, for an agent's chat, the agent) to it. Routes: GET/PUT /chats/:id/model(s).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '../sc/components/ui/dropdown-menu';
import { HarnessLogo } from './harness-logo';

interface Models { provider?: string; current: string; models: { id: string; name: string }[] }

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(String(body?.error ?? 'Request failed').replace(/^Error:\s*/, ''));
  return body as T;
}

export function ModelMenu({ sessionId }: { sessionId: string | null }) {
  const [data, setData] = useState<Models | null>(null);
  useEffect(() => {
    setData(null);
    if (!sessionId) return;
    let live = true;
    fetch(`/api/chats/${sessionId}/models`).then(r => asJson<Models>(r)).then(d => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [sessionId]);
  if (!sessionId || !data?.models.length) return null;
  const label = data.models.find(m => m.id === data.current)?.name ?? (data.current || 'Default model');
  const pick = async (model: string) => {
    try {
      await asJson(await fetch(`/api/chats/${sessionId}/model`, { method: 'PUT', body: JSON.stringify({ model }) }));
      setData({ ...data, current: model });
      toast.success(`Now using ${data.models.find(m => m.id === model)?.name ?? model}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Change model" title="Change model"
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-[10px] border-none bg-transparent text-text-3 text-[13px] cursor-pointer hover:text-text-2 hover:bg-white/[0.05] max-w-[240px]">
          {data.provider ? <HarnessLogo provider={data.provider} size={15} /> : null}
          <span className="truncate">{label}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[360px] overflow-y-auto">
        <DropdownMenuRadioGroup value={data.current} onValueChange={(v) => { void pick(v); }}>
          {data.models.map(m => <DropdownMenuRadioItem key={m.id} value={m.id}>{m.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
