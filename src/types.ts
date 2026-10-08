export const STATUSES = ['wishlist', 'applied', 'assessment', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const

export type Status = (typeof STATUSES)[number]

export interface StatusChange {
  status: Status
  changedAt: string // ISO timestamp
}

export interface Application {
  id: string
  company: string
  role: string
  location: string
  url: string
  status: Status
  appliedOn: string | null // YYYY-MM-DD
  salary: string
  notes: string
  history: StatusChange[]
  createdAt: string
  updatedAt: string
}

/** Fields a user can edit directly in the form. */
export type ApplicationInput = Pick<
  Application,
  'company' | 'role' | 'location' | 'url' | 'status' | 'appliedOn' | 'salary' | 'notes'
>
