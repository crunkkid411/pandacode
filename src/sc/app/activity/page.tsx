'use client'

// Hub: one feed of agent activity and chat states (src/sc-hub/activity-page.tsx).
import { MainContent } from '@/components/layout/main-content'
import { HubActivity } from '../../../sc-hub/activity-page'

export default function ActivityPage() {
  return <MainContent><HubActivity /></MainContent>
}
