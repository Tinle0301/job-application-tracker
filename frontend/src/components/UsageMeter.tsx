import { useEffect, useState } from 'react'
import type { Usage } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'

/** Shows how close the user is to their limits; refreshes when `version` changes. */
export function UsageMeter({ api, version }: { api: TrackerApi; version: number }) {
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    let cancelled = false
    api.getUsage().then((res) => {
      if (!cancelled && res.data) setUsage(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [api, version])

  if (!usage) return null
  const pct = Math.min(100, Math.round((usage.applications / usage.maxApplications) * 100))
  const near = pct >= 80
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500" aria-label="Usage">
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 w-28 overflow-hidden rounded-full bg-stone-200"
          role="progressbar"
          aria-label="Applications used"
          aria-valuenow={usage.applications}
          aria-valuemin={0}
          aria-valuemax={usage.maxApplications}
        >
          <div className={`h-full ${near ? 'bg-amber-500' : 'bg-stone-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={near ? 'font-medium text-amber-700' : undefined}>
          {usage.applications.toLocaleString()} of {usage.maxApplications.toLocaleString()} applications
        </span>
      </div>
      {usage.maxWritesPerDay > 0 && (
        <span>
          {usage.writesToday.toLocaleString()} of {usage.maxWritesPerDay.toLocaleString()} changes today
        </span>
      )}
    </div>
  )
}
