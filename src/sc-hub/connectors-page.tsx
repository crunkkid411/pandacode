// The Hub's Connectors page: one card per agent with its chat connections (each platform in its own
// color and icon, state as a color AND a word), an on/off switch and Remove (asks once), plus a form
// to connect an agent to a platform. Tokens are typed by Jordan into password boxes and go straight
// to PandaCode, which checks them with the service before saving them in the Windows keychain.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/app/api-client';
import { AgentAvatar } from '../sc/components/agents/agent-avatar';
import { LINK_LOOK, linkState, PLATFORMS, type PcChannel } from './connectors-facts';

interface AgentLinks { id: string; name: string; seed: string | null; channels: PcChannel[] }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field = 'w-full px-3.5 py-2.5 rounded-[12px] bg-white/[0.06] border border-white/[0.14] text-[15px] text-text outline-none focus:border-[#8b8cf8]';
const look = (kind: string) => PLATFORMS[kind] ?? { name: kind, color: '#c8c8c8', icon: '🔌', secrets: [] };

function AddForm({ agents, onDone }: { agents: AgentLinks[]; onDone: () => void }) {
  const [botId, setBotId] = useState(agents[0]?.id ?? '');
  const [kind, setKind] = useState('web');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const p = look(kind);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const secrets = Object.fromEntries(p.secrets.map(([k]) => [k, values[k] ?? '']));
      const config = p.needs ? { [p.needs[0]]: values[p.needs[0]] ?? '' } : {};
      await api('POST', '/hub-connectors/add', { botId, kind, label: p.name, config, secrets });
      toast.success(`${p.name} connected`);
      setValues({});
      onDone();
    } catch (err) { toast.error(errorText(err)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} aria-label="Connect an agent" className="rounded-[20px] border border-white/[0.1] bg-[#1c1c1c] p-5 flex flex-col gap-4 max-w-[640px]">
      <div className="text-[18px] font-700 text-text">Connect an agent</div>
      <label className="flex flex-col gap-1.5 text-[14px] font-700 text-text">Agent
        <select value={botId} onChange={e => setBotId(e.target.value)} className={field} style={{ fontFamily: 'inherit' }}>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div role="group" aria-label="Platform" className="flex flex-wrap gap-2">
        {Object.entries(PLATFORMS).map(([k, v]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setValues({}); }}
            className="px-3.5 py-2 rounded-[12px] text-[15px] font-700 cursor-pointer flex items-center gap-2"
            style={{ color: kind === k ? '#fff' : v.color, background: kind === k ? `color-mix(in srgb, ${v.color} 28%, #2a2a2a)` : '#262626', border: `2px solid ${kind === k ? v.color : 'transparent'}` }}>
            <span aria-hidden>{v.icon}</span>{v.name}
          </button>
        ))}
      </div>
      {[...(p.needs ? [p.needs] : []), ...p.secrets].map(([k, label]) => (
        <label key={k} className="flex flex-col gap-1.5 text-[14px] font-700 text-text">{label}
          <input type={p.secrets.some(([s]) => s === k) ? 'password' : 'text'} autoComplete="off" value={values[k] ?? ''} onChange={e => setValues({ ...values, [k]: e.target.value })} className={field} style={{ fontFamily: 'inherit' }} />
        </label>
      ))}
      {kind === 'web' ? <p className="text-[14px] text-text-2">Web chat needs nothing: you get a private link to chat with the agent from your phone's browser.</p> : null}
      <button type="submit" disabled={busy || !botId} className="self-start px-5 py-2.5 rounded-[12px] bg-[#6d6cf0] text-white text-[15px] font-700 cursor-pointer hover:brightness-110 disabled:opacity-40" style={{ fontFamily: 'inherit' }}>
        {busy ? 'Checking…' : `Connect to ${p.name}`}
      </button>
    </form>
  );
}

export function HubConnectors() {
  const [agents, setAgents] = useState<AgentLinks[] | null>(null);
  const [failed, setFailed] = useState('');
  const [armed, setArmed] = useState('');
  const load = useCallback(() => api<AgentLinks[]>('GET', '/hub-connectors').then(a => { setAgents(a); setFailed(''); }).catch(e => setFailed(errorText(e))), []);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  if (failed && !agents) return <p className="px-8 py-8 text-[15px] text-red-400">Could not read the connections: {failed}</p>;
  if (!agents) return null;
  const act = (path: string, body: unknown, ok: string) => api('POST', path, body).then(() => { toast.success(ok); load(); }).catch(e => toast.error(errorText(e)));
  const copyLink = (id: string) => api<string>('POST', '/hub-connectors/web-link', { id })
    .then(link => navigator.clipboard.writeText(link)).then(() => toast.success('Web chat link copied')).catch(e => toast.error(errorText(e)));
  const total = agents.reduce((n, a) => n + a.channels.length, 0);

  return (
    <div className="h-full w-full flex-1 flex flex-col px-6 py-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Connectors</h1>
        <p className="text-[14px] text-text-2 mt-1">Where you can talk to your agents outside this window: {total ? `${total} connection${total === 1 ? '' : 's'}` : 'none yet'}.</p>
      </div>
      <section aria-label="Agents" className="flex flex-wrap gap-4">
        {agents.map(a => (
          <article key={a.id} aria-label={a.name} className="rounded-[20px] border border-white/[0.1] bg-[#1c1c1c] p-4 flex flex-col gap-3" style={{ flex: '1 1 320px', maxWidth: 520 }}>
            <div className="flex items-center gap-3">
              <AgentAvatar seed={a.seed} name={a.name} size={42} />
              <div className="text-[17px] font-700 text-text">{a.name}</div>
            </div>
            {a.channels.length ? (
              <ul className="flex flex-col gap-2">
                {a.channels.map(c => {
                  const p = look(c.kind), s = LINK_LOOK[linkState(c)];
                  return (
                    <li key={c.id} className="rounded-[14px] px-3.5 py-3 flex flex-col gap-2" style={{ background: '#262626', boxShadow: `inset 4px 0 0 ${p.color}` }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span aria-hidden className="text-[18px]">{p.icon}</span>
                        <span className="text-[15px] font-700" style={{ color: p.color }}>{p.name}</span>
                        <span className="text-[13px] font-700 px-2 py-0.5 rounded-full" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 16%, transparent)` }}>{s.word}</span>
                      </div>
                      {c.status && c.status !== 'Off' ? <div className="text-[13px] text-text-2 break-words">{c.status}</div> : null}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => act('/hub-connectors/enabled', { id: c.id, enabled: !c.enabled }, c.enabled ? `${p.name} switched off` : `${p.name} switched on`)}
                          className="px-3 py-1.5 rounded-[10px] text-[14px] font-600 cursor-pointer text-white hover:brightness-125" style={{ background: "#353535" }}>{c.enabled ? 'Switch off' : 'Switch on'}</button>
                        {c.kind === 'web' ? <button type="button" onClick={() => copyLink(c.id)} className="px-3 py-1.5 rounded-[10px] text-[14px] font-600 cursor-pointer text-white hover:brightness-125" style={{ background: "#353535" }}>Copy the link</button> : null}
                        <button type="button" onClick={() => { if (armed === c.id) { setArmed(''); act('/hub-connectors/remove', { id: c.id }, `${p.name} removed`); } else setArmed(c.id); }}
                          className="px-3 py-1.5 rounded-[10px] text-[14px] font-600 cursor-pointer text-white hover:brightness-125" style={{ background: armed === c.id ? '#b91c1c' : '#353535' }}>
                          {armed === c.id ? 'Click again to remove' : 'Remove'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[14px] text-text-2">Not connected anywhere yet.</p>}
          </article>
        ))}
      </section>
      {agents.length ? <AddForm agents={agents} onDone={load} /> : <p className="text-[15px] text-text-2">Make an agent first (Agents page), then connect it here.</p>}
    </div>
  );
}
