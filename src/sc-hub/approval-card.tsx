// An agent in "Ask first" mode waits for Jordan before it edits or runs something. PandaCode keeps that request
// in memory only (pending_requests), so the Hub chat checks it every 2 seconds and shows it with Approve / Deny.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Request { kind: string; text: string; requestId: string | null }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(String(body?.error ?? 'Request failed').replace(/^Error:\s*/, ''));
  return body as T;
}

export function ApprovalCards({ sessionId }: { sessionId: string | null }) {
  const [asks, setAsks] = useState<Request[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    setAsks([]);
    if (!sessionId) return;
    let live = true;
    const read = () => fetch(`/api/chats/${sessionId}/requests`).then(r => asJson<Request[]>(r))
      .then(list => { if (live) setAsks(list.filter(r => r.kind === 'approval' && r.requestId)); }).catch(() => {});
    void read();
    const t = setInterval(read, 2000);
    return () => { live = false; clearInterval(t); };
  }, [sessionId]);
  if (!sessionId || !asks.length) return null;
  const answer = async (r: Request, approved: boolean) => {
    setBusy(r.requestId ?? '');
    try {
      await asJson(await fetch(`/api/chats/${sessionId}/approve`, { method: 'POST', body: JSON.stringify({ requestId: r.requestId, approved }) }));
      setAsks(a => a.filter(x => x.requestId !== r.requestId));
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  return (
    <div className="flex flex-col gap-2 mb-2">
      {asks.map(r => (
        <section key={r.requestId} aria-label="The agent asks first" className="rounded-[14px] px-4 py-3 flex flex-col gap-2" style={{ background: 'color-mix(in srgb, #fbbf24 12%, #1c1c1c)', border: '1px solid rgba(251,191,36,0.5)' }}>
          <div className="text-[14px] font-700" style={{ color: '#fbbf24' }}>Waiting for you: may it do this?</div>
          <pre className="text-[13px] text-text whitespace-pre-wrap break-words max-h-[160px] overflow-y-auto m-0" style={{ fontFamily: 'inherit' }}>{r.text}</pre>
          <div className="flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => { void answer(r, true); }} className="px-4 py-1.5 rounded-[10px] text-[14px] font-700 text-white cursor-pointer disabled:opacity-40" style={{ background: '#15803d', fontFamily: 'inherit' }}>Approve</button>
            <button type="button" disabled={!!busy} onClick={() => { void answer(r, false); }} className="px-4 py-1.5 rounded-[10px] text-[14px] font-700 text-white cursor-pointer disabled:opacity-40" style={{ background: '#b91c1c', fontFamily: 'inherit' }}>Deny</button>
          </div>
        </section>
      ))}
    </div>
  );
}
