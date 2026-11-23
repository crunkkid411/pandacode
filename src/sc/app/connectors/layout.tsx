'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list; the page shows every agent's connections (src/sc-hub/connectors-page.tsx).
export default function ConnectorsLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
