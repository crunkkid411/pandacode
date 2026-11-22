'use client'

import { ProviderList } from '@/components/providers/provider-list'

export default function ProvidersPage() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex items-center px-6 pt-5 pb-3 shrink-0">
        <h2 className="font-display text-[14px] font-600 text-text-2 tracking-[-0.01em] capitalize flex-1">
          Providers
        </h2>
      </div>
      <ProviderList />
    </div>
  )
}
