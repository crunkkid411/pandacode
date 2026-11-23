'use client'

// Hub: Jordan's PandaCode project folders with their agents and chats (src/sc-hub/sessions-page.tsx).
// SwarmClaw's own project records (objectives, heartbeats, credentials) have no store in the Hub.
import { MainContent } from '@/components/layout/main-content'
import { HubProjects } from '../../../sc-hub/sessions-page'

export default function ProjectsPage() {
  return (
    <MainContent>
      <HubProjects />
    </MainContent>
  )
}
