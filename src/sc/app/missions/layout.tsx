'use client'

import { MainContent } from '@/components/layout/main-content'

// Hub: no side list on placeholder pages (src/sc-hub/placeholder-page.tsx).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MainContent>{children}</MainContent>
}
