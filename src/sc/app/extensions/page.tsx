'use client'

// Hub: Extensions = Jordan's install list (inbox.txt; src/sc-hub/install-list-page.tsx). SwarmClaw's own
// extension list needs its server's /extensions store, which the Hub doesn't have, so it isn't shown.
import { InstallList } from '../../../sc-hub/install-list-page'

export default function ExtensionsPage() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      <InstallList />
    </div>
  )
}
