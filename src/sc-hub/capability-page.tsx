// What Jordan's harnesses already have set up, read from their own config files by PandaCode's
// capabilities_inventory: MCP servers (the "MCP Servers" page) and plugins (on the Extensions page).
// Grouped by harness, each group headed by the harness logo in its brand color. Read only: adding or
// removing one is done in that harness, so no buttons pretend otherwise (J10).
import { useEffect, useState } from 'react';
import { api } from '@/lib/app/api-client';
import { HarnessLogo, harnessName } from './harness-logo';
import { HARNESSES } from './mascots';

export interface Capability { harness: string; kind: string; name: string; state: string; source: string; command: string | null }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CapabilityGroups({ kind, noun }: { kind: string; noun: string }) {
  const [items, setItems] = useState<Capability[] | null>(null);
  const [failed, setFailed] = useState('');
  const [find, setFind] = useState('');
  useEffect(() => { api<Capability[]>('GET', `/hub-capabilities?kind=${encodeURIComponent(kind)}`).then(setItems).catch(e => setFailed(errorText(e))); }, [kind]);
  if (failed) return <p className="text-[15px] text-red-400">Could not read your {noun}: {failed}</p>;
  if (!items) return null;
  const shown = items.filter(i => !find || i.name.toLowerCase().includes(find.toLowerCase()));
  const groups = [...new Set(shown.map(i => i.harness))];
  return (
    <div className="flex flex-col gap-5">
      <input value={find} onChange={e => setFind(e.target.value)} placeholder={`Find one of your ${items.length} ${noun}`} aria-label={`Find ${noun}`}
        className="w-full max-w-[460px] px-4 py-3 rounded-[12px] bg-white/[0.06] border border-white/[0.12] text-[15px] text-text outline-none focus:border-[#8b8cf8]" style={{ fontFamily: 'inherit' }} />
      {groups.map(h => {
        const color = HARNESSES[h]?.color ?? '#9b9cff';
        const mine = shown.filter(i => i.harness === h);
        return (
          <section key={h} aria-label={harnessName(h)} className="rounded-[18px] p-4" style={{ background: '#1b1b1b', border: '1px solid rgba(255,255,255,0.08)', borderTop: `3px solid ${color}` }}>
            <h2 className="flex items-center gap-2 mb-3">
              <HarnessLogo provider={h} size={20} />
              <span className="text-[17px] font-700" style={{ color: `color-mix(in srgb, ${color} 55%, #fff)` }}>{harnessName(h)}</span>
              <span className="text-[14px] text-text-2">{mine.length}</span>
            </h2>
            <ul className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {mine.map(i => {
                const [name, from] = i.name.split('@');
                return (
                  <li key={`${i.source}|${i.name}`} className="px-3.5 py-2.5 rounded-[12px]" style={{ background: '#262626' }}>
                    <div className="text-[15px] font-600 text-text truncate" title={i.name}>{name}</div>
                    <div className="text-[12px] text-text-3 truncate">{[from && `from ${from}`, i.command && `runs ${i.command}`, i.source].filter(Boolean).join(' · ')}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!groups.length ? <p className="text-[15px] text-text-2">{items.length ? 'Nothing matches.' : `None of your harnesses has ${noun} set up.`}</p> : null}
    </div>
  );
}

export function HubMcpServers() {
  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">MCP Servers</h1>
        <p className="text-[14px] text-text-2 mt-1">Tool servers your harnesses already have set up. An agent picks which ones it may use in its settings.</p>
      </div>
      <CapabilityGroups kind="mcp server" noun="MCP servers" />
    </div>
  );
}
