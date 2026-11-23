// The agent settings panel's Config tab in the Hub: what this agent IS and what it can use, read from the real
// bot and the real harness setup (capabilities_inventory). Jordan, 2026-11-23: "it doesn't even show me what tools
// and skills it has - this gui is not communicating what the agent is or does."
import { useEffect, useState } from 'react';
import { api } from '@/lib/app/api-client';
import type { Agent, Session } from '../sc/types';
import { pcProvider } from './bot-agents';
import type { Capability } from './capability-page';
import { HarnessLogo, harnessName } from './harness-logo';
import { HARNESSES } from './mascots';
import { ModeChip } from './mode-chip';

const card = 'rounded-[16px] border border-white/[0.1] bg-[#1c1c1c] p-4 flex flex-col gap-2.5';
const label = 'text-[13px] font-700 uppercase tracking-[0.06em] text-text-2';

// The tools PandaCode gives every agent (src-tauri/src/bots/tools.rs).
const HUB_TOOLS = ['Hand work to another agent', 'Remember, look up and forget facts about you', 'Schedule, list and cancel follow-ups', 'Send you a notification'];

// Reading every harness's setup takes ~10 s, so one read is shared by every panel for 5 minutes.
// ponytail: time-based cache; a skill installed meanwhile shows after 5 minutes or a restart.
let cached: { at: number; read: Promise<Capability[]> } | null = null;
const readSetup = () => {
  if (!cached || Date.now() - cached.at > 300_000) cached = { at: Date.now(), read: api<Capability[]>('GET', '/hub-capabilities?kind=*') };
  cached.read.catch(() => { cached = null; });
  return cached.read;
};

const KINDS: [string, string][] = [['skill', 'Skills'], ['plugin', 'Plugins'], ['mcp server', 'Tool servers (MCP)'], ['slash command', 'Slash commands']];

function NameList({ title, names, color }: { title: string; names: string[]; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex items-center gap-2 text-left text-[15px] font-700 text-text cursor-pointer bg-transparent border-none p-0" style={{ fontFamily: 'inherit' }}>
        <span aria-hidden style={{ color }}>{open ? '▾' : '▸'}</span>{title}
        <span className="text-[13px] px-2 py-0.5 rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>{names.length}</span>
      </button>
      {open ? (
        <ul className="flex flex-wrap gap-1.5 pl-5">
          {names.map(n => <li key={n} className="text-[13px] text-text px-2 py-1 rounded-[8px] bg-white/[0.06] break-all">{n}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** The harness, model and mode (the mode chip needs the agent's own chat). */
export function RunsOn({ agent, sessionId }: { agent: Agent; sessionId: string | null }) {
  const harness = pcProvider(agent.provider);
  const color = HARNESSES[harness]?.color ?? '#9b9cff';
  return (
    <section aria-label="Runs on" className={card} style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
      <div className={label}>Runs on</div>
      <div className="flex items-center gap-2 text-[16px] font-700 text-text"><HarnessLogo provider={harness} size={18} />{harnessName(harness)}</div>
      <div className="text-[14px] text-text">Model: <span className="font-700">{agent.model || 'default'}</span></div>
      <div className="flex items-center gap-2 text-[14px] text-text">Mode: {sessionId ? <ModeChip sessionId={sessionId} /> : <span className="text-text-2">set after its first chat</span>}</div>
      <p className="text-[13px] text-text-2">Shift+Tab in the chat box, or a click on the mode, changes it.</p>
    </section>
  );
}

/** Everything the agent can use: its harness setup (read from the real config files), the Hub tools, and extras. */
export function CanUse({ agent, note }: { agent: Agent; note?: string }) {
  const harness = pcProvider(agent.provider);
  const color = HARNESSES[harness]?.color ?? '#9b9cff';
  const [setup, setSetup] = useState<Capability[] | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let live = true;
    readSetup()
      .then(all => { if (live) setSetup(all.filter(c => c.harness === harness)); })
      .catch(e => { if (live) setFailed(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [harness]);
  const added = [...(agent.skillIds ?? [])];
  const servers = [...(agent.mcpServerIds ?? [])];
  return (
    <section aria-label="What it can use" className={card}>
      <div className={label}>What it can use</div>
      <p className="text-[14px] text-text-2">Everything in your {harnessName(harness)} setup, the same as a {harnessName(harness)} window, plus the Hub's own tools.</p>
      {failed ? <p className="text-[14px] text-red-400">Could not read your {harnessName(harness)} setup: {failed}</p> : null}
      {!setup && !failed ? <p className="text-[14px] text-text-2">Reading your {harnessName(harness)} setup (about 10 seconds)…</p> : null}
      {setup ? KINDS.map(([k, title]) => {
        const names = setup.filter(c => c.kind === k).map(c => c.name);
        return names.length ? <NameList key={k} title={title} names={names} color={color} /> : null;
      }) : null}
      <NameList title="Hub tools" names={HUB_TOOLS} color="#9b9cff" />
      {added.length ? <NameList title="Skills added just for this agent" names={added} color="#4ade80" /> : null}
      {servers.length ? <NameList title="Tool servers added just for this agent" names={servers} color="#4ade80" /> : null}
      {note ? <p className="text-[13px] text-text-2">{note}</p> : null}
    </section>
  );
}

/** The folder this agent works in: a project he picked for it, or its own folder. */
function WorksIn({ agent }: { agent: Agent }) {
  const [where, setWhere] = useState<{ name: string; path: string; own: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    api<{ name: string; path: string; own: boolean }>('GET', `/agents/${encodeURIComponent(agent.id)}/folder`).then(w => { if (live) setWhere(w); }).catch(() => {});
    return () => { live = false; };
  }, [agent.id, agent.projectId]);
  if (!where) return null;
  return (
    <section aria-label="Works in" className={card}>
      <div className={label}>Works in</div>
      <div className="flex items-center gap-2 text-[15px] font-700 text-text">
        <span aria-hidden>{where.own ? '🤖' : '📁'}</span>{where.own ? 'Its own folder' : where.name}
      </div>
      <div className="text-[13px] text-text-2 break-all">{where.path}</div>
      {where.own ? <p className="text-[13px] text-text-2">To have it work in one of your projects, pick a project below in this tab.</p> : null}
    </section>
  );
}

export function AgentProfile({ agent, session }: { agent: Agent; session: Session | null }) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <RunsOn agent={agent} sessionId={session?.id ?? null} />
      <WorksIn agent={agent} />
      {agent.description ? (
        <section aria-label="What it does" className={card}>
          <div className={label}>What it does</div>
          <p className="text-[15px] text-text leading-relaxed">{agent.description}</p>
        </section>
      ) : null}
      <CanUse agent={agent} />
      <section aria-label="Instructions" className={card}>
        <div className={label}>Instructions it follows</div>
        {agent.systemPrompt
          ? <pre className="text-[13px] text-text whitespace-pre-wrap break-words max-h-[420px] overflow-y-auto m-0" style={{ fontFamily: 'inherit' }}>{agent.systemPrompt}</pre>
          : <p className="text-[14px] text-text-2">None. It works from its role alone.</p>}
      </section>
    </div>
  );
}
