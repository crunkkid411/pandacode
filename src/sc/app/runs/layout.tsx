'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list. SwarmClaw's run list needs its own server; the page is every PandaCode chat
// (src/sc-hub/sessions-page.tsx).
export default function RunsLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
