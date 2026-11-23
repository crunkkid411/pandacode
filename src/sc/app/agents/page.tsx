'use client'

import { useRouter } from 'next/navigation'
import { useAppStore } from '@/stores/use-app-store'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getViewPath } from '@/lib/app/navigation'
import { AgentChatList } from '@/components/agents/agent-chat-list'
import { AgentPickCard } from '../../../sc-hub/agent-pick-card'

function NoAgentsYet() {
  const setAgentSheetOpen = useAppStore((s) => s.setAgentSheetOpen)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="font-display text-[22px] font-700 text-text">No agents yet</h2>
      <p className="max-w-[420px] text-[14px] text-text-3">Make your first one. You can start from a template: opencompany roles, Claude-Extras agents, your plugins' agents or your Hermes bots.</p>
      <button type="button" onClick={() => setAgentSheetOpen(true)}
        className="px-5 py-3 rounded-[12px] bg-accent-bright text-white text-[15px] font-600 cursor-pointer hover:brightness-110 transition-all"
        style={{ fontFamily: 'inherit' }}>
        Make an agent
      </button>
    </div>
  )
}

/** Hub: all agents as cards (murmur's "Agents" grid); a card opens that agent's chat. */
function AllAgents() {
  const router = useRouter()
  const agents = useAppStore((s) => s.agents)
  const appSettings = useAppStore((s) => s.appSettings)
  const setAgentSheetOpen = useAppStore((s) => s.setAgentSheetOpen)
  const list = Object.values(agents).sort((a, b) =>
    Number(b.id === appSettings.defaultAgentId) - Number(a.id === appSettings.defaultAgentId) || Number(!!a.disabled) - Number(!!b.disabled) || a.name.localeCompare(b.name))
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-[30px] font-700 tracking-[-0.02em] text-text">Agents</h1>
          <p className="text-[14px] text-text-2 mt-1">{list.length === 1 ? '1 agent' : `${list.length} agents`}. Pick one to talk to it.</p>
        </div>
        <button type="button" onClick={() => setAgentSheetOpen(true)}
          className="px-4 py-2.5 rounded-[12px] bg-[#6d6cf0] text-white text-[14px] font-600 cursor-pointer hover:brightness-110 transition-all"
          style={{ fontFamily: 'inherit' }}>
          + New agent
        </button>
      </div>
      <div role="group" aria-label="All agents" className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {list.map((a) => (
          <AgentPickCard key={a.id} name={a.name} description={a.description} seed={a.avatarSeed ?? null} avatarUrl={a.avatarUrl}
            provider={a.provider} note={a.disabled ? 'Paused' : a.id === appSettings.defaultAgentId ? 'Your main agent' : undefined}
            onPick={() => router.push(getViewPath('agents', a.id))} />
        ))}
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const agents = useAppStore((s) => s.agents)

  if (!isDesktop) return <AgentChatList />

  // Hub: with no agents this used to spin forever; say what to do instead.
  if (!Object.keys(agents).length) return <NoAgentsYet />

  return <AllAgents />
}
