'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list. SwarmClaw's extension list and "+ Extension" need its own server, which the
// Hub doesn't have; the page itself is Jordan's install list (src/sc-hub/install-list-page.tsx).
export default function ExtensionsLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
