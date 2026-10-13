// types.ts — shared domain types for frontend and backend services.
// Database columns are snake_case; these are the camelCase shapes the
// services return (see docs/DATA_MODEL.md for the mapping).

export const STATUSES = ['wishlist', 'applied', 'assessment', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const

export type Status = (typeof STATUSES)[number]

export interface StatusChange {
  status: Status
  changedAt: string // ISO timestamp
  /** 'email' when inbox sync made the change (docs/EMAIL_SYNC.md). */
  source?: 'manual' | 'email'
}

export interface FitAnalysis {
  id: string
  score: number // 0–100
  matchedSkills: string[]
  missingSkills: string[]
  summary: string
  suggestions: string[]
  model: string
  createdAt: string
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
  jobDescription: string
  history: StatusChange[]
  latestAnalysis: FitAnalysis | null
  createdAt: string
  updatedAt: string
}

/** Fields a user can edit directly in the form. */
export type ApplicationInput = Pick<
  Application,
  'company' | 'role' | 'location' | 'url' | 'status' | 'appliedOn' | 'salary' | 'notes' | 'jobDescription'
>

export interface Resume {
  id: string
  title: string
  content: string
  updatedAt: string
}

/** What the parse-job edge function extracts from a posting. */
export interface ParsedJob {
  company: string
  role: string
  location: string
  salary: string
  employmentType: string
  requirements: string[]
  summary: string
  /** The posting text the fields were read from (stored as the job description). */
  description: string
}

/** What the signed-in user has used against the free-tier limits. */
export interface Usage {
  applications: number
  maxApplications: number
  writesToday: number
  maxWritesPerDay: number
  /** Successful AI auto-fills so far, against a lifetime cap (0 = no cap, e.g. demo mode). */
  autofillsUsed: number
  maxAutofills: number
}

/** The user's connected inbox (no token: that never leaves the server). */
export interface EmailConnection {
  email: string
  /** 'needs_reconnect' once Google stops accepting the saved access. */
  status: 'connected' | 'needs_reconnect'
  lastScanAt: string | null
  connectedAt: string
}

/** A status change an email led to: applied already, or waiting as a suggestion. */
export interface EmailUpdate {
  id: string
  applicationId: string
  fromAddress: string
  subject: string
  receivedAt: string
  detectedStatus: Status
  previousStatus: Status
  reason: string
  state: 'applied' | 'suggested' | 'undone' | 'dismissed'
}

/** A job found in a "thanks for applying" email: added already, or waiting as a suggestion. */
export interface EmailApplication {
  id: string
  /** The application it added (null while it is a suggestion). */
  applicationId: string | null
  fromAddress: string
  subject: string
  receivedAt: string
  /** Opens the email in Gmail. */
  link: string
  company: string
  role: string
  reason: string
  state: 'created' | 'suggested'
}

export interface EmailScanResult {
  scanned: number
  matched: number
  applied: number
  suggested: number
  /** Applications added from confirmation emails. */
  added: number
  /** Confirmation emails waiting for the user to add or dismiss. */
  toAdd: number
  /** False when a limit cut the scan short; scanning again continues. */
  complete: boolean
}

export interface ServiceError {
  code: string
  message: string
}

/** Every service call returns this shape and never throws (docs/API_CONTRACT.md). */
export type Result<T> = { data: T; error: null } | { data: null; error: ServiceError }
