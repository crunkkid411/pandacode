'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list. SwarmClaw's knowledge store needs its own server; the page is Jordan's qmd
// library (src/sc-hub/knowledge-page.tsx).
export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
