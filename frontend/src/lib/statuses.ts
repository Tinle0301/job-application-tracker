import type { Status } from '@backend/models/types'

export const STATUS_LABELS: Record<Status, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  assessment: 'Assessment',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const STATUS_STYLES: Record<Status, string> = {
  wishlist: 'bg-stone-100 text-stone-700 ring-stone-300',
  applied: 'bg-sky-50 text-sky-800 ring-sky-200',
  assessment: 'bg-violet-50 text-violet-800 ring-violet-200',
  interviewing: 'bg-amber-50 text-amber-800 ring-amber-200',
  offer: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  withdrawn: 'bg-stone-100 text-stone-500 ring-stone-200',
}

/** Statuses that mean the application is still in play. */
export const ACTIVE_STATUSES: Status[] = ['applied', 'assessment', 'interviewing', 'offer']
