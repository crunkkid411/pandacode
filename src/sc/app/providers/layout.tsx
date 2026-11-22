'use client'

import { SidebarPanelShell } from '@/components/layout/sidebar-panel-shell'
import { MainContent } from '@/components/layout/main-content'
import { ProviderList } from '@/components/providers/provider-list'

export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SidebarPanelShell
        title="Providers"
      >
        <ProviderList inSidebar />
      </SidebarPanelShell>
      <MainContent>{children}</MainContent>
    </>
  )
}
