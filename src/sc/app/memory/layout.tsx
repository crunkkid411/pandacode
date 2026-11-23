'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list. SwarmClaw's memory store needs its own server; the page shows what Jordan's
// agents saved in their own memory files (src/sc-hub/memory-page.tsx).
export default function MemoryLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
