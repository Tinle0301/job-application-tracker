import type { Application } from '../types'
import { computeStats, formatPercent } from '../lib/stats'

export function StatsBar({ apps }: { apps: Application[] }) {
  const s = computeStats(apps)
  const tiles = [
    { label: 'Submitted', value: String(s.submitted) },
    { label: 'Active', value: String(s.byStatus.applied + s.byStatus.assessment + s.byStatus.interviewing) },
    { label: 'Interviews', value: String(s.byStatus.interviewing) },
    { label: 'Offers', value: String(s.byStatus.offer) },
    { label: 'Response rate', value: formatPercent(s.responseRate) },
    { label: 'Interview rate', value: formatPercent(s.interviewRate) },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
          <dt className="text-xs font-medium text-stone-500">{t.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</dd>
        </div>
      ))}
    </dl>
  )
}
