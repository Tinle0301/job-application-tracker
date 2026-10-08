import type { Application, Status } from '../types'
import { STATUSES } from '../types'

export interface PipelineStats {
  total: number
  byStatus: Record<Status, number>
  /** Applications submitted (everything except wishlist). */
  submitted: number
  /** Share of submitted applications that got any response beyond "applied". */
  responseRate: number
  /** Share of submitted applications that reached interviewing or offer. */
  interviewRate: number
}

const RESPONDED: Status[] = ['assessment', 'interviewing', 'offer', 'rejected']

export function computeStats(apps: Application[]): PipelineStats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>
  for (const app of apps) byStatus[app.status] += 1

  const submitted = apps.filter((a) => a.status !== 'wishlist').length
  const responded = apps.filter(
    (a) => a.history.some((h) => RESPONDED.includes(h.status)) || RESPONDED.includes(a.status),
  ).length
  const interviewed = apps.filter(
    (a) =>
      a.history.some((h) => h.status === 'interviewing' || h.status === 'offer') ||
      a.status === 'interviewing' ||
      a.status === 'offer',
  ).length

  return {
    total: apps.length,
    byStatus,
    submitted,
    responseRate: submitted === 0 ? 0 : responded / submitted,
    interviewRate: submitted === 0 ? 0 : interviewed / submitted,
  }
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
