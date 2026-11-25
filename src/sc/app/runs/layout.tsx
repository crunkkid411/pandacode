'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list. The page is Running now (src/sc-hub/running-page.tsx).
export default function RunsLayout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
