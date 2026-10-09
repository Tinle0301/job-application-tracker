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
  status_history: { status: Status; changed_at: string }[]
  ai_analyses: AnalysisRow[]
}

const SELECT =
  '*, status_history(status, changed_at), ai_analyses(id, score, matched_skills, missing_skills, summary, suggestions, model, created_at)'

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
    .map((h) => ({ status: h.status, changedAt: h.changed_at }))
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

/** Maps edge-function failures (which carry our { error } body) to ServiceErrors. */
async function invokeFunction<T>(db: SupabaseClient, name: string, body: Record<string, unknown>): Promise<Result<T>> {
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
    return fail('AI_REQUEST_FAILED', 'The AI service is unavailable right now. Please try again.')
  }
  const payload = data as Result<T>
  return payload?.error ? fail(payload.error.code, payload.error.message) : ok(payload.data as T)
}

export function createSupabaseApi(db: SupabaseClient, options: { aiEnabled?: boolean } = {}): TrackerApi {
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
      }
      return ok({
        applications: r.applications,
        maxApplications: r.max_applications,
        writesToday: r.writes_today,
        maxWritesPerDay: r.max_writes_per_day,
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
  }
}
