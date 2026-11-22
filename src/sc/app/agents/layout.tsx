'use client'

import { SidebarPanelShell } from '@/components/layout/sidebar-panel-shell'
import { MainContent } from '@/components/layout/main-content'
import { AgentChatList } from '@/components/agents/agent-chat-list'

// Hub: SwarmClaw's "+ Agent" button and Config tab are left out. Agents here are PandaCode chats,
// which have no SwarmClaw agent settings behind them yet.
export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SidebarPanelShell title="Agents">
        <AgentChatList inSidebar />
      </SidebarPanelShell>
      <MainContent>{children}</MainContent>
    </>
  )
}
