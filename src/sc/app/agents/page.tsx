'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/stores/use-app-store'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getViewPath } from '@/lib/app/navigation'
import { AgentChatList } from '@/components/agents/agent-chat-list'
import { PageLoader } from '@/components/ui/page-loader'

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

export default function AgentsPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const router = useRouter()
  const agents = useAppStore((s) => s.agents)
  const appSettings = useAppStore((s) => s.appSettings)
  const redirected = useRef(false)

  const defaultAgent = appSettings.defaultAgentId && agents[appSettings.defaultAgentId]
    ? agents[appSettings.defaultAgentId]
    : Object.values(agents)[0] || null

  // On desktop, auto-redirect to the default (or first) agent instead of showing a placeholder
  useEffect(() => {
    if (!isDesktop || redirected.current) return
    if (defaultAgent) {
      redirected.current = true
      router.replace(getViewPath('agents', defaultAgent.id))
    }
  }, [isDesktop, defaultAgent, router])

  if (!isDesktop) return <AgentChatList />

  // Hub: with no agents this used to spin forever; say what to do instead.
  if (!defaultAgent) return <NoAgentsYet />

  // Brief flash while redirecting
  return <PageLoader />
}
