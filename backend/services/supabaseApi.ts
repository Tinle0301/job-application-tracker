// supabaseApi.ts — production implementation of TrackerApi.
//
// Every function returns { data, error } and never throws. RLS scopes every
// query to the signed-in user; the status_history trigger and the AI edge
// functions do the rest (docs/ARCHITECTURE.md).
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Application,
  ApplicationInput,
  FitAnalysis,
  ParsedJob,
  Result,
  Resume,
  Status,
  StatusChange,
  EmailConnection,
  EmailScanResult,
  EmailUpdate,
} from '../models/types'
import type { TrackerApi } from './api'
import { fail, ok, toServiceError } from './result'
import { validateApplication, validateResume } from './validation'

interface AnalysisRow {
  id: string
  score: number
  matched_skills: string[]
  missing_skills: string[]
  summary: string
  suggestions: string[]
  model: string
  created_at: string
}

interface ApplicationRow {
  id: string
  company: string
  role: string
  location: string
  url: string
  status: Status
  applied_on: string | null
  salary: string
  notes: string
  job_description: string
  created_at: string
  updated_at: string
  status_history: { status: Status; changed_at: string; source?: 'manual' | 'email' }[]
  ai_analyses: AnalysisRow[]
}

const SELECT =
  '*, status_history(status, changed_at, source), ai_analyses(id, score, matched_skills, missing_skills, summary, suggestions, model, created_at)'

export function toAnalysis(r: AnalysisRow): FitAnalysis {
  return {
    id: r.id,
    score: r.score,
    matchedSkills: r.matched_skills ?? [],
    missingSkills: r.missing_skills ?? [],
    summary: r.summary,
    suggestions: r.suggestions ?? [],
    model: r.model,
    createdAt: r.created_at,
  }
}

export function toApplication(row: ApplicationRow): Application {
  const history: StatusChange[] = (row.status_history ?? [])
    .map((h) => ({ status: h.status, changedAt: h.changed_at, source: h.source ?? 'manual' }))
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
  const latest = [...(row.ai_analyses ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    location: row.location,
    url: row.url,
    status: row.status,
    appliedOn: row.applied_on,
    salary: row.salary,
    notes: row.notes,
    jobDescription: row.job_description ?? '',
    history,
    latestAnalysis: latest ? toAnalysis(latest) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toRow(input: ApplicationInput) {
  return {
    company: input.company.trim(),
    role: input.role.trim(),
    location: input.location,
    url: input.url,
    status: input.status,
    applied_on: input.appliedOn || null,
    salary: input.salary,
    notes: input.notes,
    job_description: input.jobDescription ?? '',
  }
}

interface EmailUpdateRow {
  id: string
  application_id: string
  from_address: string
  subject: string
  received_at: string
  detected_status: Status
  previous_status: Status
  reason: string
  state: EmailUpdate['state']
}

export function toEmailUpdate(r: EmailUpdateRow): EmailUpdate {
  return {
    id: r.id,
    applicationId: r.application_id,
    fromAddress: r.from_address,
    subject: r.subject,
    receivedAt: r.received_at,
    detectedStatus: r.detected_status,
    previousStatus: r.previous_status,
    reason: r.reason,
    state: r.state,
  }
}

/** Maps edge-function failures (which carry our { error } body) to ServiceErrors. */
async function invokeFunction<T>(
  db: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
  unavailable = 'The AI service is unavailable right now. Please try again.',
): Promise<Result<T>> {
  const { data, error } = await db.functions.invoke(name, { body })
  if (error) {
    // FunctionsHttpError keeps the response; our functions always reply { data, error }.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as { error?: { code: string; message: string } }
        if (payload?.error) return fail(payload.error.code, payload.error.message)
      } catch {
        /* fall through */
      }
    }
    return fail('AI_REQUEST_FAILED', unavailable)
  }
  const payload = data as Result<T>
  return payload?.error ? fail(payload.error.code, payload.error.message) : ok(payload.data as T)
}

const EMAIL_UNAVAILABLE = 'Email sync is unavailable right now. Please try again.'

export function createSupabaseApi(
  db: SupabaseClient,
  options: { aiEnabled?: boolean; emailSyncEnabled?: boolean } = {},
): TrackerApi {
  const rpc = async (name: string, id: string): Promise<Result<null>> => {
    const { error } = await db.rpc(name, { p_id: id })
    return error ? { data: null, error: toServiceError(error, 'EMAIL_UPDATE_FAILED') } : ok(null)
  }

  const one = async (query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Result<Application>> => {
    const { data, error } = await query
    if (error) return { data: null, error: toServiceError(error, 'DATABASE_ERROR') }
    return ok(toApplication(data as ApplicationRow))
  }

  async function getResume(): Promise<Result<Resume | null>> {
    const { data, error } = await db
      .from('resumes')
      .select('id, title, content, updated_at')
      .eq('is_default', true)
      .maybeSingle()
    if (error) return { data: null, error: toServiceError(error, 'LOAD_FAILED') }
    if (!data) return ok(null) // "nothing found" is not an error
    return ok({ id: data.id, title: data.title, content: data.content, updatedAt: data.updated_at })
  }

  return {
    mode: 'supabase',
    aiEnabled: options.aiEnabled ?? false,

    async listApplications() {
      const { data, error } = await db.from('applications').select(SELECT)
      if (error) return { data: null, error: toServiceError(error, 'LOAD_FAILED') }
      return ok((data as ApplicationRow[]).map(toApplication))
    },

    async createApplication(input) {
      const invalid = validateApplication(input)
      if (invalid) return { data: null, error: invalid }
      return one(db.from('applications').insert(toRow(input)).select(SELECT).single())
    },

    async updateApplication(id, input) {
      const invalid = validateApplication(input)
      if (invalid) return { data: null, error: invalid }
      return one(db.from('applications').update(toRow(input)).eq('id', id).select(SELECT).single())
    },

    async updateStatus(id, status) {
      return one(db.from('applications').update({ status }).eq('id', id).select(SELECT).single())
    },

    async deleteApplication(id) {
      const { error } = await db.from('applications').delete().eq('id', id)
      return error ? { data: null, error: toServiceError(error, 'DELETE_FAILED') } : ok(null)
    },

    async importApplications(inputs) {
      for (const [i, input] of inputs.entries()) {
        const invalid = validateApplication(input)
        if (invalid) return fail(invalid.code, `Row ${i + 1}: ${invalid.message}`)
      }
      const { data, error } = await db.from('applications').insert(inputs.map(toRow)).select(SELECT)
      if (error) return { data: null, error: toServiceError(error, 'IMPORT_FAILED') }
      return ok((data as ApplicationRow[]).map(toApplication))
    },

    async getUsage() {
      const { data, error } = await db.rpc('my_usage').single()
      if (error || !data) return { data: null, error: toServiceError(error, 'LOAD_FAILED') }
      const r = data as {
        applications: number
        max_applications: number
        writes_today: number
        max_writes_per_day: number
        autofills_used: number
        max_autofills: number
      }
      return ok({
        applications: r.applications,
        maxApplications: r.max_applications,
        writesToday: r.writes_today,
        maxWritesPerDay: r.max_writes_per_day,
        autofillsUsed: r.autofills_used,
        maxAutofills: r.max_autofills,
      })
    },

    getResume,

    async saveResume(content, title = 'My resume') {
      const invalid = validateResume(content)
      if (invalid) return { data: null, error: invalid }
      const existing = await getResume()
      if (existing.error) return { data: null, error: existing.error }
      const query = existing.data
        ? db.from('resumes').update({ content, title }).eq('id', existing.data.id)
        : db.from('resumes').insert({ content, title, is_default: true })
      const { data, error } = await query.select('id, title, content, updated_at').single()
      if (error) return { data: null, error: toServiceError(error, 'SAVE_FAILED') }
      return ok({ id: data.id, title: data.title, content: data.content, updatedAt: data.updated_at })
    },

    async parseJobPosting(source) {
      if (!source.text?.trim() && !source.url?.trim())
        return fail('NOTHING_TO_PARSE', 'Paste a job description or a job posting URL.')
      return invokeFunction<ParsedJob>(db, 'parse-job', source)
    },

    async analyzeFit(applicationId) {
      return invokeFunction<FitAnalysis>(db, 'match-resume', { applicationId })
    },

    emailSyncEnabled: options.emailSyncEnabled ?? false,

    async getEmailConnection() {
      const { data, error } = await db.rpc('my_email_connection').maybeSingle()
      if (error) return { data: null, error: toServiceError(error, 'LOAD_FAILED') }
      if (!data) return ok(null)
      const r = data as {
        email: string
        status: EmailConnection['status']
        last_scan_at: string | null
        connected_at: string
      }
      return ok({ email: r.email, status: r.status, lastScanAt: r.last_scan_at, connectedAt: r.connected_at })
    },

    async startEmailConnect() {
      return invokeFunction<{ url: string }>(db, 'email-connect', { action: 'start' }, EMAIL_UNAVAILABLE)
    },

    async disconnectEmail() {
      return invokeFunction<null>(db, 'email-connect', { action: 'disconnect' }, EMAIL_UNAVAILABLE)
    },

    async scanEmail() {
      return invokeFunction<EmailScanResult>(db, 'email-scan', {}, EMAIL_UNAVAILABLE)
    },

    async listEmailUpdates() {
      const { data, error } = await db
        .from('email_status_updates')
        .select(
          'id, application_id, from_address, subject, received_at, detected_status, previous_status, reason, state',
        )
        .order('received_at', { ascending: false })
        .limit(50)
      if (error) return { data: null, error: toServiceError(error, 'LOAD_FAILED') }
      return ok((data as EmailUpdateRow[]).map(toEmailUpdate))
    },

    applyEmailUpdate: (id) => rpc('apply_email_update', id),
    undoEmailUpdate: (id) => rpc('undo_email_update', id),
    dismissEmailUpdate: (id) => rpc('dismiss_email_update', id),
  }
}
