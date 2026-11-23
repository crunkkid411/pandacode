'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list. SwarmClaw's MCP server store needs its own server; the page shows the servers
// Jordan's harnesses already have (src/sc-hub/capability-page.tsx).
export default function McpServersLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
