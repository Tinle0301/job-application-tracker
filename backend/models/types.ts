// types.ts — shared domain types for frontend and backend services.
// Database columns are snake_case; these are the camelCase shapes the
// services return (see docs/DATA_MODEL.md for the mapping).

export const STATUSES = ['wishlist', 'applied', 'assessment', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const

export type Status = (typeof STATUSES)[number]

export interface StatusChange {
  status: Status
  changedAt: string // ISO timestamp
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

export interface ServiceError {
  code: string
  message: string
}

/** Every service call returns this shape and never throws (docs/API_CONTRACT.md). */
export type Result<T> = { data: T; error: null } | { data: null; error: ServiceError }
