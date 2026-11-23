// The Hub's Memory page, in SwarmClaw's three-column layout: where a memory applies (everywhere, or
// one project folder), the memories there, and the chosen memory's text. Facts: hub_memory.rs, read
// from Claude Code's own memory files. Each memory's kind shows as a color AND a word (J10).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';

export interface MemoryFile { scope: string; path: string; name: string; description: string; kind: string; modified: number }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const KINDS: Record<string, { word: string; color: string }> = {
  user: { word: 'About you', color: '#f472b6' },
  feedback: { word: 'Your correction', color: '#fbbf24' },
  project: { word: 'Project fact', color: '#60a5fa' },
  reference: { word: 'Where to look', color: '#34d399' },
};
const kindLook = (k: string) => KINDS[k] ?? { word: 'Note', color: '#c8c8c8' };
const panel = 'rounded-[20px] border border-white/[0.08] bg-white/[0.03] overflow-hidden flex flex-col min-h-[260px]';
const when = (ms: number) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

/** The memory text without its --- header. */
export const memoryBody = (text: string) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

export function HubMemory() {
  const [files, setFiles] = useState<MemoryFile[] | null>(null);
  const [failed, setFailed] = useState('');
  const [scope, setScope] = useState('all');
  const [kind, setKind] = useState('all');
  const [find, setFind] = useState('');
  const [open, setOpen] = useState<MemoryFile | null>(null);
  const [text, setText] = useState('');
  useEffect(() => { api<MemoryFile[]>('GET', '/hub-memory').then(setFiles).catch(e => setFailed(errorText(e))); }, []);
  useEffect(() => {
    setText('');
    if (open) api<string>('POST', '/hub-memory/read', { path: open.path }).then(setText).catch(e => setText(`Could not read it: ${errorText(e)}`));
  }, [open]);
  if (failed) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read your agents' memories: {failed}</p>;
  if (!files) return null;

  const scopes = [...new Set(files.map(f => f.scope))].sort((a, b) => (a === 'Everywhere' ? -1 : b === 'Everywhere' ? 1 : a.localeCompare(b)));
  const inScope = files.filter(f => scope === 'all' || f.scope === scope);
  const q = find.toLowerCase();
  const shown = inScope.filter(f => (kind === 'all' || f.kind === kind) && (!q || `${f.name} ${f.description}`.toLowerCase().includes(q)));

  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-hidden">
      <div>
        <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Memory</h1>
        <p className="text-[14px] text-text-2 mt-1">What your agents remember about you and your projects: {files.length} facts, saved by the agents themselves.</p>
      </div>
      <div className="flex flex-wrap gap-4 flex-1 min-h-0">
        <section aria-label="Where" className={panel} style={{ flex: '1 1 200px', maxWidth: 270 }}>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {[['all', files.length] as const, ...scopes.map(s => [s, files.filter(f => f.scope === s).length] as const)].map(([s, n]) => (
              <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); setOpen(null); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[12px] text-left cursor-pointer"
                style={{ background: scope === s ? '#2e2e36' : 'transparent', border: `1px solid ${scope === s ? '#8b8cf8' : 'transparent'}` }}>
                <span aria-hidden>{s === 'all' ? '🧠' : s === 'Everywhere' ? '🌐' : '📁'}</span>
                <span className="flex-1 min-w-0 truncate text-[14px] font-600 text-text" title={s}>{s === 'all' ? 'All memories' : s.replace(/^C:\\Users-[^-]+-?/, '~\\')}</span>
                <span className="text-[13px] text-text-2">{n}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Memories" className={panel} style={{ flex: '1 1 300px', maxWidth: 420 }}>
          <div className="p-3 flex flex-col gap-2 border-b border-white/[0.08]">
            <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find a memory" aria-label="Find a memory"
              className="w-full px-3.5 py-2.5 rounded-[12px] bg-white/[0.06] border border-white/[0.12] text-[15px] text-text outline-none focus:border-[#8b8cf8]" style={{ fontFamily: 'inherit' }} />
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Kind">
              {['all', ...Object.keys(KINDS)].map(k => {
                const look = k === 'all' ? { word: 'All', color: '#ffffff' } : KINDS[k];
                return (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                    className="px-2.5 py-1 rounded-full text-[13px] font-700 cursor-pointer"
                    style={{ fontFamily: 'inherit', color: look.color, border: `1.5px solid ${kind === k ? look.color : 'rgba(255,255,255,0.12)'}`, background: kind === k ? `color-mix(in srgb, ${look.color} 16%, #1d1d1d)` : '#1d1d1d' }}>
                    {look.word}
                  </button>
                );
              })}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {shown.map(f => {
              const look = kindLook(f.kind);
              const on = open?.path === f.path;
              return (
                <li key={f.path}>
                  <button type="button" onClick={() => setOpen(f)} aria-selected={on}
                    className="w-full text-left px-3.5 py-2.5 rounded-[12px] cursor-pointer"
                    style={{ background: on ? '#2e2e36' : '#1d1d1d', border: `1px solid ${on ? '#8b8cf8' : 'rgba(255,255,255,0.07)'}`, boxShadow: `inset 4px 0 0 ${look.color}` }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-700 text-text truncate flex-1">{f.name}</span>
                      <span className="text-[12px] font-700 whitespace-nowrap" style={{ color: look.color }}>{look.word}</span>
                    </div>
                    {f.description ? <div className="text-[13px] text-text-2 line-clamp-2 mt-0.5">{f.description}</div> : null}
                  </button>
                </li>
              );
            })}
            {!shown.length ? <li className="px-3 py-8 text-[15px] text-text-2 text-center">No memories match.</li> : null}
          </ul>
        </section>

        <section aria-label="Memory" className={`${panel} p-5 gap-3`} style={{ flex: '2 1 340px' }}>
          {open ? (
            <>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[20px] font-700 text-text">{open.name}</div>
                  <div className="text-[13px] text-text-2 mt-0.5">
                    <span className="font-700" style={{ color: kindLook(open.kind).color }}>{kindLook(open.kind).word}</span> · {open.scope} · saved {when(open.modified)}
                  </div>
                </div>
                <button type="button" onClick={() => api('POST', '/hub-memory/open', { path: open.path }).catch(e => toast.error(errorText(e)))}
                  className="px-3.5 py-2 rounded-[10px] bg-white/[0.08] text-text text-[14px] font-600 cursor-pointer hover:bg-white/[0.12]" style={{ fontFamily: 'inherit' }}>
                  Open the file
                </button>
              </div>
              <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-text">{memoryBody(text)}</div>
            </>
          ) : <p className="px-5 py-10 text-[15px] text-text-2 text-center">Pick a memory to read it.</p>}
        </section>
      </div>
    </div>
  );
}
