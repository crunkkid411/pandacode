'use client'

import { ScheduleConsole } from '@/components/schedules/schedule-console'

export default function SchedulesPage() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex items-center px-6 pt-5 pb-3 shrink-0">
        <h2 className="font-display text-[14px] font-600 text-text-2 tracking-[-0.01em] capitalize flex-1">
          Schedules
        </h2>
        {/* Hub: no "+ Schedule"; new Windows tasks are not made from here yet */}
      </div>
      <ScheduleConsole />
    </div>
  )
}
